import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import multipart from '@fastify/multipart'
import { env } from './env.js'
import { db, sqlite } from './db/index.js'
import { runMigrations } from './db/migrate.js'
import { authMiddleware } from './middleware/auth.js'
import { authRoutes } from './routes/auth.js'
import { sessionRoutes } from './routes/sessions.js'
import { settingsRoutes } from './routes/settings.js'
import { skillRoutes } from './routes/skills.js'
import { reminderRoutes } from './routes/reminders.js'
import { calendarRoutes } from './routes/calendar.js'
import { searchRoutes } from './routes/search.js'
import { adminRoutes } from './routes/admin.js'
import { marketplaceRoutes } from './routes/marketplace.js'
import { opencodeRoutes } from './routes/opencode.js'
import { memoryRoutes } from './routes/memory.js'
import { fileRoutes } from './routes/files.js'
import { startTelegramBot } from './telegram/bot.js'
import { startScheduler, setTelegramBot } from './services/scheduler.js'
import { sql } from 'drizzle-orm'

const app = Fastify({ logger: true })

// CORS configuration
if (env.NODE_ENV === 'production') {
  if (!env.CORS_ORIGINS) {
    console.error('CORS_ORIGINS is required in production')
    process.exit(1)
  }
  const origins = env.CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
  await app.register(cors, { origin: origins, credentials: true })
} else {
  const origins = env.CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
  await app.register(cors, { origin: origins, credentials: true })
}

await app.register(jwt, { secret: env.JWT_SECRET })

await app.register(multipart, {
  limits: { fileSize: env.MAX_FILE_SIZE_BYTES, files: 10 },
})

await runMigrations()

app.decorate('authenticate', authMiddleware)

app.get('/health', async () => {
  db.run(sql`select 1`)
  return { status: 'ok', timestamp: new Date().toISOString() }
})

app.get('/api/opencode/health', {
  preHandler: [authMiddleware],
}, async () => {
  try {
    const { opencodeClient } = await import('./opencode/client.js')
    const result = await opencodeClient.health()
    return result
  } catch (err: any) {
    return { status: 'unavailable', error: err.message }
  }
})

app.register(authRoutes)
app.register(sessionRoutes)
app.register(settingsRoutes)
app.register(skillRoutes)
app.register(reminderRoutes)
app.register(calendarRoutes)
app.register(searchRoutes)
app.register(adminRoutes)
app.register(marketplaceRoutes)
app.register(opencodeRoutes)
app.register(memoryRoutes)
app.register(fileRoutes)

const telegramBot = startTelegramBot()
if (telegramBot) setTelegramBot(telegramBot)

startScheduler()

try {
  await app.listen({ port: env.PORT, host: '0.0.0.0' })
  console.log(`Backend running on http://0.0.0.0:${env.PORT}`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}

process.on('SIGINT', async () => {
  sqlite.close()
  await app.close()
  process.exit(0)
})
