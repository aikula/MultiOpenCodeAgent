import { Telegraf, type Context } from 'telegraf'
import { eq } from 'drizzle-orm'
import { v4 as uuid } from 'uuid'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { join, resolve } from 'path'
import { db } from '../db/index.js'
import { users, telegramLinks, sessions, messages, workspaces, reminders, auditLog } from '../db/schema.js'
import { getWorkspace, assertInsideWorkspace } from '../services/workspace.js'
import { opencodeClient } from '../opencode/client.js'
import { chargeQuota, getBalance } from '../services/quota.js'
import { env } from '../env.js'
import { consumeLoginCode } from '../routes/auth.js'
import { writeFileAsync, mkdirAsync, readdirAsync, statAsync } from '../lib/async-fs.js'

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

async function sendToSession(user: { id: string; defaultAgent: string | null; defaultModel: string | null }, text: string, ctx: Context) {
  const session = getMainSession(user.id)
  if (!session) {
    await ctx.reply('No main session found. Create one via /new or Web UI first.')
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

  // Charge quota before calling OpenCode
  chargeQuota(user.id, 1, 'telegram_message')

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
    chargeQuota(user.id, -1, 'refund_opencode_error')
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

  await ctx.reply(assistantContent)
}

function parseReminderText(text: string): { title: string; remindAt: Date } | null {
  const tz = env.DEFAULT_TIMEZONE
  const now = new Date()

  // /remind 2026-06-04 10:00 write Ivan about contract
  const fullDateMatch = text.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s+(.+)$/)
  if (fullDateMatch) {
    const date = new Date(`${fullDateMatch[1]}T${fullDateMatch[2]}:00`)
    if (!isNaN(date.getTime())) {
      return { remindAt: date, title: fullDateMatch[3] }
    }
  }

  // /remind tomorrow 10:00 write Ivan about contract
  const tomorrowMatch = text.match(/^tomorrow\s+(\d{1,2}:\d{2})\s+(.+)$/i)
  if (tomorrowMatch) {
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const [h, m] = tomorrowMatch[1].split(':').map(Number)
    tomorrow.setHours(h, m, 0, 0)
    return { remindAt: tomorrow, title: tomorrowMatch[2] }
  }

  // /remind today 18:30 check report
  const todayMatch = text.match(/^today\s+(\d{1,2}:\d{2})\s+(.+)$/i)
  if (todayMatch) {
    const date = new Date(now)
    const [h, m] = todayMatch[1].split(':').map(Number)
    date.setHours(h, m, 0, 0)
    return { remindAt: date, title: todayMatch[2] }
  }

  // /remind in 30m call back
  const inMinutesMatch = text.match(/^in\s+(\d+)m\s+(.+)$/i)
  if (inMinutesMatch) {
    const date = new Date(now.getTime() + parseInt(inMinutesMatch[1]) * 60_000)
    return { remindAt: date, title: inMinutesMatch[2] }
  }

  // /remind in 2h prepare meeting plan
  const inHoursMatch = text.match(/^in\s+(\d+)h\s+(.+)$/i)
  if (inHoursMatch) {
    const date = new Date(now.getTime() + parseInt(inHoursMatch[1]) * 3600_000)
    return { remindAt: date, title: inHoursMatch[2] }
  }

  return null
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
    if (!text) {
      await ctx.reply(
        'Usage:\n' +
        '/remind 2026-06-04 10:00 write Ivan about contract\n' +
        '/remind tomorrow 10:00 write Ivan about contract\n' +
        '/remind today 18:30 check report\n' +
        '/remind in 30m call back\n' +
        '/remind in 2h prepare meeting plan'
      )
      return
    }

    const parsed = parseReminderText(text)
    if (!parsed) {
      await ctx.reply(
        'Could not parse reminder. Supported formats:\n' +
        '/remind 2026-06-04 10:00 <title>\n' +
        '/remind tomorrow 10:00 <title>\n' +
        '/remind today 18:30 <title>\n' +
        '/remind in 30m <title>\n' +
        '/remind in 2h <title>'
      )
      return
    }

    const id = uuid()
    const now = new Date().toISOString()

    db.insert(reminders).values({
      id,
      userId: user.id,
      title: parsed.title,
      remindAt: parsed.remindAt.toISOString(),
      timezone: env.DEFAULT_TIMEZONE,
      channel: 'telegram',
      status: 'scheduled',
      createdAt: now,
    }).run()

    await ctx.reply(
      `Reminder created:\n` +
      `  Title: ${parsed.title}\n` +
      `  At: ${parsed.remindAt.toISOString()}\n` +
      `  Timezone: ${env.DEFAULT_TIMEZONE}\n` +
      `  Channel: telegram`
    )
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
      '/remind <when> <text> — Create reminder\n' +
      '/calendar — Today\'s events\n' +
      '/files [path] — List your files\n' +
      '/sendfile <path> — Get a file\n' +
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

    if (!env.STT_API_URL) {
      await ctx.reply('Voice transcription not configured.')
      return
    }

    try {
      const fileLink = await ctx.telegram.getFileLink(ctx.message.voice)
      const response = await fetch(fileLink.toString(), proxyAgent ? { agent: proxyAgent as any } : {})
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
      await sendToSession(user, transcript, ctx)
    } catch (err: any) {
      await ctx.reply(`Voice error: ${err.message}`)
    }
  })

  // Receive documents
  bot.on('document', async (ctx) => {
    const user = getUserByTelegramId(String(ctx.from?.id))
    if (!user) { await ctx.reply('Not linked.'); return }

    const ws = getWorkspace(user.id)
    if (!ws) { await ctx.reply('No workspace.'); return }

    const doc = ctx.message?.document
    if (!doc) return

    if (doc.file_size && doc.file_size > 20 * 1024 * 1024) {
      await ctx.reply('File too large (max 20 MB via Telegram). Upload via Web UI.')
      return
    }

    try {
      const filename = doc.file_name || `file_${Date.now()}`
      if (filename.slice(filename.lastIndexOf('.')).toLowerCase() === '.exe' ||
          ['.bat', '.cmd', '.scr', '.dll', '.sh'].includes(filename.slice(filename.lastIndexOf('.')).toLowerCase())) {
        await ctx.reply('This file type is not allowed.')
        return
      }

      const fileLink = await ctx.telegram.getFileLink(doc)
      const response = await fetch(fileLink.toString(), proxyAgent ? { agent: proxyAgent as any } : {})
      const buffer = Buffer.from(await response.arrayBuffer())

      const filesDir = join(ws.path, 'files')
      await mkdirAsync(filesDir, { recursive: true })
      const filepath = join(filesDir, filename)
      await writeFileAsync(filepath, buffer)

      await ctx.reply(`Saved: ${filename} (${(buffer.length / 1024).toFixed(1)} KB)`)
    } catch (err: any) {
      await ctx.reply(`File error: ${err.message}`)
    }
  })

  // Receive photos
  bot.on('photo', async (ctx) => {
    const user = getUserByTelegramId(String(ctx.from?.id))
    if (!user) { await ctx.reply('Not linked.'); return }

    const ws = getWorkspace(user.id)
    if (!ws) { await ctx.reply('No workspace.'); return }

    try {
      const photos = ctx.message?.photo
      if (!photos?.length) return
      const largest = photos[photos.length - 1]

      const fileLink = await ctx.telegram.getFileLink(largest)
      const response = await fetch(fileLink.toString(), proxyAgent ? { agent: proxyAgent as any } : {})
      const buffer = Buffer.from(await response.arrayBuffer())

      const filesDir = join(ws.path, 'files')
      await mkdirAsync(filesDir, { recursive: true })
      const filename = `photo_${Date.now()}.jpg`
      await writeFileAsync(join(filesDir, filename), buffer)

      await ctx.reply(`Saved: ${filename} (${(buffer.length / 1024).toFixed(1)} KB)`)
    } catch (err: any) {
      await ctx.reply(`Photo error: ${err.message}`)
    }
  })

  // /files [path] - list files
  bot.command('files', async (ctx) => {
    const user = getUserByTelegramId(String(ctx.from?.id))
    if (!user) { await ctx.reply('Not linked.'); return }

    const ws = getWorkspace(user.id)
    if (!ws) { await ctx.reply('No workspace.'); return }

    const relPath = ctx.message?.text?.split(' ').slice(1).join(' ') ?? ''
    const dir = join(ws.path, 'files', relPath)

    try {
      const entries = await readdirAsync(dir, { withFileTypes: true })
      if (entries.length === 0) {
        await ctx.reply(`Empty directory: ${relPath || '/'}`)
        return
      }
      const text = entries
        .filter(e => !e.name.startsWith('.'))
        .map((e, i) => `${i + 1}. ${e.name}${e.isDirectory() ? '/' : ''}`)
        .join('\n')
      await ctx.reply(`Files in /${relPath}:\n${text}`)
    } catch {
      await ctx.reply('Directory not found or empty.')
    }
  })

  // /sendfile <path>
  bot.command('sendfile', async (ctx) => {
    const user = getUserByTelegramId(String(ctx.from?.id))
    if (!user) { await ctx.reply('Not linked.'); return }

    const ws = getWorkspace(user.id)
    if (!ws) { await ctx.reply('No workspace.'); return }

    const relPath = ctx.message?.text?.split(' ').slice(1).join(' ')
    if (!relPath) { await ctx.reply('Usage: /sendfile <path>'); return }

    const resolved = resolve(ws.path, 'files', relPath)
    assertInsideWorkspace(ws.path, resolved)

    try {
      const st = await statAsync(resolved)
      if (!st.isFile()) { await ctx.reply('Not a file.'); return }
      await ctx.replyWithDocument({ source: resolved, filename: relPath.split('/').pop() })
    } catch {
      await ctx.reply('File not found.')
    }
  })

  bot.launch()
  console.log('Telegram bot started')

  process.on('SIGINT', () => bot?.stop())
  return bot
}

export { bot }
