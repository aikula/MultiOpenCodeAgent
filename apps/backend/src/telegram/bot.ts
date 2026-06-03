import { Telegraf, type Context } from 'telegraf'
import { eq } from 'drizzle-orm'
import { v4 as uuid } from 'uuid'
import { db } from '../db/index.js'
import { users, telegramLinks, sessions, messages, workspaces } from '../db/schema.js'
import { getWorkspace } from '../services/workspace.js'
import { opencodeClient } from '../opencode/client.js'
import { chargeQuota, getBalance } from '../services/quota.js'
import { env } from '../env.js'
import { consumeLoginCode } from '../routes/auth.js'

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

function getMainSession(userId: string) {
  return db.select().from(sessions)
    .where(eq(sessions.userId, userId))
    .all()
    .find(s => s.isMain && s.status === 'active')
}

async function sendToSession(user: any, text: string, ctx: Context) {
  const session = getMainSession(user.id)
  if (!session) {
    await ctx.reply('No main session found. Create one via Web UI first.')
    return
  }

  const ws = getWorkspace(user.id)
  if (!ws) {
    await ctx.reply('Workspace not found.')
    return
  }

  const balance = getBalance(user.id)
  if (balance <= 0) {
    await ctx.reply('Quota exceeded. Contact admin for more.')
    return
  }

  const msgId = uuid()
  const now = new Date().toISOString()

  db.insert(messages).values({
    id: msgId,
    userId: user.id,
    sessionId: session.id,
    role: 'user',
    content: text,
    channel: 'telegram',
    createdAt: now,
  }).run()

  let assistantContent = ''
  try {
    const result = await opencodeClient.sendMessage({
      workspacePath: ws.path,
      opencodeSessionId: session.opencodeSessionId,
      text,
      agent: user.defaultAgent,
      model: user.defaultModel,
    })
    assistantContent = result.content
  } catch (err: any) {
    assistantContent = `OpenCode error: ${err.message}`
  }

  const assistantId = uuid()
  db.insert(messages).values({
    id: assistantId,
    userId: user.id,
    sessionId: session.id,
    role: 'assistant',
    content: assistantContent,
    channel: 'telegram',
    createdAt: new Date().toISOString(),
  }).run()

  chargeQuota(user.id, 1, 'telegram_message')

  await ctx.reply(assistantContent)
}

export function startTelegramBot(): Telegraf | null {
  if (!env.TELEGRAM_BOT_TOKEN) {
    console.log('TELEGRAM_BOT_TOKEN not set, skipping Telegram bot')
    return null
  }

  bot = new Telegraf(env.TELEGRAM_BOT_TOKEN)

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

    await ctx.reply(`Linked to ${user?.email ?? 'account'}. You can now chat!`)
  })

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
    const ocId = `local-${id}`

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

  bot.command('main', async (ctx) => {
    const user = getUserByTelegramId(String(ctx.from?.id))
    if (!user) { await ctx.reply('Not linked.'); return }

    const session = getMainSession(user.id)
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

  bot.command('remind', async (ctx) => {
    const user = getUserByTelegramId(String(ctx.from?.id))
    if (!user) { await ctx.reply('Not linked.'); return }

    const text = ctx.message?.text?.split(' ').slice(1).join(' ')
    if (!text) { await ctx.reply('Usage: /remind <text>'); return }

    await ctx.reply(`Reminder noted: "${text}". Use Web UI for full reminder management.`)
  })

  bot.command('help', async (ctx) => {
    await ctx.reply(
      'MultiOpenCodeAgent Commands:\n\n' +
      '/login <code> — Link your account\n' +
      '/sessions — List your sessions\n' +
      '/new <title> — Create new session\n' +
      '/use <number> — Switch session by number\n' +
      '/main — Show main session\n' +
      '/limits — Show quota balance\n' +
      '/remind <text> — Quick reminder\n' +
      '/calendar — Today\'s events\n' +
      '/settings — Show your settings\n' +
      '/help — This message\n\n' +
      'Send any text to chat with your agent.'
    )
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

  bot.command('calendar', async (ctx) => {
    const user = getUserByTelegramId(String(ctx.from?.id))
    if (!user) { await ctx.reply('Not linked.'); return }

    const today = new Date().toISOString().split('T')[0]
    const { calendarEvents } = await import('../db/schema.js')
    const events = db.select().from(calendarEvents)
      .where(eq(calendarEvents.userId, user.id))
      .all()
      .filter(e => e.startsAt?.startsWith(today))

    if (events.length === 0) {
      await ctx.reply(`No events today (${today}).`)
      return
    }

    const text = events.map(e =>
      `${e.startsAt?.split('T')[1]?.slice(0, 5) ?? '??:??'} — ${e.title}${e.location ? ` @ ${e.location}` : ''}`
    ).join('\n')
    await ctx.reply(`Today (${today}):\n${text}`)
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

  bot.on('text', async (ctx) => {
    const user = getUserByTelegramId(String(ctx.from?.id))
    if (!user) { await ctx.reply('Not linked. Use /login <code>'); return }

    await sendToSession(user, ctx.message.text, ctx)
  })

  bot.on('voice', async (ctx) => {
    const user = getUserByTelegramId(String(ctx.from?.id))
    if (!user) { await ctx.reply('Not linked.'); return }

    if (!env.STT_BASE_URL) {
      await ctx.reply('Voice transcription not configured.')
      return
    }

    try {
      const fileLink = await ctx.telegram.getFileLink(ctx.message.voice)
      const response = await fetch(fileLink.toString())
      const audioBuffer = Buffer.from(await response.arrayBuffer())

      // Save to workspace
      const ws = getWorkspace(user.id)
      if (!ws) { await ctx.reply('No workspace.'); return }

      const { writeFileSync } = await import('fs')
      const { join } = await import('path')
      const filename = `voice_${Date.now()}.ogg`
      const filepath = join(ws.path, 'uploads', filename)
      writeFileSync(filepath, audioBuffer)

      // Send to STT
      const sttResponse = await fetch(env.STT_BASE_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.STT_API_KEY}`,
          'Content-Type': 'audio/ogg',
        },
        body: audioBuffer,
      })
      const sttData = await sttResponse.json() as { text?: string }
      const transcript = sttData.text || '(no transcript)'

      await ctx.reply(`Transcript: ${transcript}`)
      await sendToSession(user, transcript, ctx)
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
