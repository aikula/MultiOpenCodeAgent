import { Telegraf, type Context } from 'telegraf'
import { eq } from 'drizzle-orm'
import { v4 as uuid } from 'uuid'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { join } from 'path'
import { db } from '../db/index.js'
import { users, telegramLinks, sessions, auditLog } from '../db/schema.js'
import { getWorkspace } from '../services/workspace.js'
import { opencodeClient } from '../opencode/client.js'
import { chargeQuota, getBalance } from '../services/quota.js'
import { processMessageThroughRouter } from '../services/action-router.js'
import { env } from '../env.js'
import { consumeLoginCode } from '../routes/auth.js'
import { writeFileAsync, mkdirAsync } from '../lib/async-fs.js'

let bot: Telegraf | null = null

function getUserByTelegramId(telegramUserId: string) {
  const link = db.select().from(telegramLinks)
    .where(eq(telegramLinks.telegramUserId, telegramUserId))
    .get()
  if (!link || !link.isActive) return null

  const user = db.select().from(users)
    .where(eq(users.id, link.userId))
    .get()
  if (!user || user.status === 'blocked') return null

  return user
}

export function startTelegramBot(): Telegraf | null {
  if (!env.TELEGRAM_BOT_TOKEN) {
    console.log('TELEGRAM_BOT_TOKEN not set, skipping Telegram bot')
    return null
  }

  const proxyAgent = env.TELEGRAM_PROXY
    ? new HttpsProxyAgent(env.TELEGRAM_PROXY)
    : undefined

  if (proxyAgent) {
    console.log(`Telegram using proxy: ${env.TELEGRAM_PROXY!.replace(/\/\/[^@]+@/, '//***@')}`)
  }

  bot = new Telegraf(env.TELEGRAM_BOT_TOKEN, {
    telegram: { agent: proxyAgent },
  })

  bot.start(async (ctx) => {
    await ctx.reply(
      'Welcome to MultiOpenCodeAgent!\n\n' +
      'Use /login <code> to link your account.\n' +
      'Get the code from Web UI settings.'
    )
  })

  bot.command('login', async (ctx) => {
    const code = ctx.message?.text?.split(' ')[1]
    if (!code) {
      await ctx.reply('Usage: /login <code>\nGet code from Web UI > Settings.')
      return
    }

    const existing = getUserByTelegramId(String(ctx.from?.id))
    if (existing) {
      await ctx.reply('Already linked.')
      return
    }

    const userId = consumeLoginCode(code)
    if (!userId) {
      await ctx.reply('Invalid or expired code. Get a fresh code from Web UI > Settings.')
      return
    }

    const user = db.select().from(users).where(eq(users.id, userId)).get()

    db.insert(telegramLinks).values({
      id: uuid(),
      userId,
      telegramUserId: String(ctx.from?.id),
      telegramUsername: ctx.from?.username ?? null,
      linkedAt: new Date().toISOString(),
      isActive: true,
    }).run()

    db.insert(auditLog).values({
      id: uuid(),
      actorUserId: userId,
      action: 'telegram_linked',
      targetType: 'user',
      targetId: userId,
      metadataJson: JSON.stringify({ telegramUserId: String(ctx.from?.id) }),
      createdAt: new Date().toISOString(),
    }).run()

    await ctx.reply(`Linked to ${user?.email ?? 'account'}. You can now chat!`)
  })

  bot.command('help', async (ctx) => {
    await ctx.reply(
      'MultiOpenCodeAgent\n\n' +
      'Send normal text or voice. The manager agent will interpret the request using AGENTS.md and OpenCode skills.\n\n' +
      'Service commands:\n' +
      '/login <code> — link your account\n' +
      '/help — show this help'
    )
  })

  // Service commands (hidden from help, useful for debugging)
  bot.command('sessions', async (ctx) => {
    const user = getUserByTelegramId(String(ctx.from?.id))
    if (!user) { await ctx.reply('Not linked. Use /login <code>'); return }

    const list = db.select().from(sessions)
      .where(eq(sessions.userId, user.id))
      .all()
      .filter(s => s.status === 'active')

    if (list.length === 0) {
      await ctx.reply('No sessions.')
      return
    }

    const text = list.map((s, i) =>
      `${i + 1}. ${s.title || 'Untitled'}${s.isMain ? ' [main]' : ''}`
    ).join('\n')

    await ctx.reply(text)
  })

  bot.command('new', async (ctx) => {
    const user = getUserByTelegramId(String(ctx.from?.id))
    if (!user) { await ctx.reply('Not linked.'); return }

    const ws = getWorkspace(user.id)
    if (!ws) { await ctx.reply('No workspace.'); return }

    const title = ctx.message?.text?.split(' ').slice(1).join(' ') || 'New session'
    const id = uuid()
    const now = new Date().toISOString()

    let ocId: string
    try {
      const ocSession = await opencodeClient.createSession({
        workspacePath: ws.path,
        title,
      })
      ocId = ocSession.id
    } catch (err: any) {
      if (env.ALLOW_LOCAL_OPENCODE_FALLBACK) {
        ocId = `local-${id}`
      } else {
        await ctx.reply(`Failed to create OpenCode session: ${err.message}`)
        return
      }
    }

    db.insert(sessions).values({
      id,
      userId: user.id,
      workspaceId: ws.id,
      opencodeSessionId: ocId,
      title,
      isMain: false,
      source: 'telegram',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    }).run()

    await ctx.reply(`Created session: ${title}`)
  })

  bot.command('use', async (ctx) => {
    const user = getUserByTelegramId(String(ctx.from?.id))
    if (!user) { await ctx.reply('Not linked.'); return }

    const num = parseInt(ctx.message?.text?.split(' ')[1] ?? '')
    if (isNaN(num)) { await ctx.reply('Usage: /use <session_number>'); return }

    const list = db.select().from(sessions)
      .where(eq(sessions.userId, user.id))
      .all()
      .filter(s => s.status === 'active')

    if (num < 1 || num > list.length) {
      await ctx.reply(`Invalid number. You have ${list.length} sessions.`)
      return
    }

    db.update(sessions).set({ isMain: false }).where(eq(sessions.userId, user.id)).run()
    db.update(sessions).set({ isMain: true, updatedAt: new Date().toISOString() }).where(eq(sessions.id, list[num - 1].id)).run()

    await ctx.reply(`Switched to: ${list[num - 1].title || 'Untitled'}`)
  })

  bot.command('main', async (ctx) => {
    const user = getUserByTelegramId(String(ctx.from?.id))
    if (!user) { await ctx.reply('Not linked.'); return }

    const session = db.select().from(sessions)
      .where(eq(sessions.userId, user.id))
      .all()
      .find(s => s.isMain && s.status === 'active')
    if (session) {
      await ctx.reply(`Main session: ${session.title || 'Untitled'}`)
    } else {
      await ctx.reply('No main session set.')
    }
  })

  bot.command('limits', async (ctx) => {
    const user = getUserByTelegramId(String(ctx.from?.id))
    if (!user) { await ctx.reply('Not linked.'); return }

    const balance = getBalance(user.id)
    await ctx.reply(`Balance: ${balance} messages`)
  })

  bot.command('settings', async (ctx) => {
    const user = getUserByTelegramId(String(ctx.from?.id))
    if (!user) { await ctx.reply('Not linked.'); return }

    const balance = getBalance(user.id)
    await ctx.reply(
      `Settings for ${user.email}:\n` +
      `Language: ${user.language}\n` +
      `Style: ${user.responseStyle}\n` +
      `Agent: ${user.defaultAgent ?? 'OpenCode default'}\n` +
      `Balance: ${balance}\n` +
      `Daily limit: ${user.dailyQuotaLimit}`
    )
  })

  // All normal text goes to manager agent via action-router
  bot.on('text', async (ctx) => {
    const user = getUserByTelegramId(String(ctx.from?.id))
    if (!user) { await ctx.reply('Not linked. Use /login <code>'); return }

    const balance = getBalance(user.id)
    if (balance <= 0) {
      await ctx.reply('Quota exceeded. Contact admin for more.')
      return
    }

    chargeQuota(user.id, 1, 'telegram_message')

    try {
      const result = await processMessageThroughRouter(user.id, ctx.message.text, 'telegram')
      await ctx.reply(result.assistantContent.slice(0, 4000))
    } catch (err: any) {
      chargeQuota(user.id, -1, 'refund_opencode_error')
      await ctx.reply(`Error: ${err.message}`)
    }
  })

  // Voice -> STT -> manager agent
  bot.on('voice', async (ctx) => {
    const user = getUserByTelegramId(String(ctx.from?.id))
    if (!user) { await ctx.reply('Not linked.'); return }

    if (!env.STT_API_URL) {
      await ctx.reply('Voice transcription not configured.')
      return
    }

    try {
      const fileLink = await ctx.telegram.getFileLink(ctx.message.voice)
      const response = await fetch(fileLink.toString(), proxyAgent ? { agent: proxyAgent } as any : undefined)
      const audioBuffer = Buffer.from(await response.arrayBuffer())

      const ws = getWorkspace(user.id)
      if (!ws) { await ctx.reply('No workspace.'); return }

      const uploadDir = join(ws.path, 'uploads')
      await mkdirAsync(uploadDir, { recursive: true })
      const filename = `voice_${Date.now()}.ogg`
      const filepath = join(uploadDir, filename)
      await writeFileAsync(filepath, audioBuffer)

      const { transcribeAudio } = await import('../services/stt.js')
      const result = await transcribeAudio(audioBuffer, filename)
      const transcript = result.text || '(no transcript)'

      await ctx.reply(`Transcript: ${transcript}`)

      const balance = getBalance(user.id)
      if (balance <= 0) {
        await ctx.reply('Quota exceeded after transcription.')
        return
      }

      chargeQuota(user.id, 1, 'telegram_message')
      try {
        const routerResult = await processMessageThroughRouter(user.id, transcript, 'telegram')
        await ctx.reply(routerResult.assistantContent.slice(0, 4000))
      } catch (err: any) {
        chargeQuota(user.id, -1, 'refund_opencode_error')
        await ctx.reply(`Error: ${err.message}`)
      }
    } catch (err: any) {
      await ctx.reply(`Voice error: ${err.message}`)
    }
  })

  bot.launch()
  console.log('Telegram bot started')

  process.on('SIGINT', () => bot?.stop())
  return bot
}

export { bot }
