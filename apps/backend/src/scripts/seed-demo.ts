#!/usr/bin/env tsx
/**
 * Demo seed script.
 * Creates a demo user with workspace, sessions, reminders, calendar events,
 * memory items, and a private skill. Idempotent: skips if demo user already exists.
 *
 * Usage: npm run seed -w @moca/backend
 * Or:    tsx apps/backend/src/scripts/seed-demo.ts
 */
import { config as loadEnv } from 'dotenv'
import { resolve as resolvePath } from 'path'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
loadEnv({ path: resolvePath(join(__dirname, '..', '..', '..', '..', '.env')) })
loadEnv({ path: resolvePath(join(__dirname, '..', '..', '..', '.env')) })

import { eq } from 'drizzle-orm'
import { v4 as uuid } from 'uuid'
import { createHash } from 'crypto'
import bcrypt from 'bcryptjs'
import { db, sqlite } from '../db/index.js'
import { runMigrations } from '../db/migrate.js'
import {
  users,
  workspaces,
  sessions,
  reminders,
  calendarEvents,
  memoryItems,
  quotaLedger,
  inviteCodes,
} from '../db/schema.js'
import { createWorkspace } from '../services/workspace.js'
import { opencodeClient } from '../opencode/client.js'
import { env } from '../env.js'

const DEMO_EMAIL = 'demo@moca.local'
const DEMO_PASSWORD = 'demo-password-2026'

function isoOffset(daysFromNow: number, hour: number, minute = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + daysFromNow)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

function todayAt(hour: number, minute = 0): string {
  const d = new Date()
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

async function main() {
  console.log('Running migrations...')
  runMigrations()

  const existing = db.select().from(users).where(eq(users.email, DEMO_EMAIL)).get()
  if (existing) {
    console.log(`Demo user already exists (${existing.id}). Skipping seed.`)
    console.log(`Email: ${DEMO_EMAIL}`)
    console.log(`Password: ${DEMO_PASSWORD}`)
    process.exit(0)
  }

  console.log('Creating demo user...')
  const userId = uuid()
  const now = new Date().toISOString()
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10)

  db.insert(users).values({
    id: userId,
    email: DEMO_EMAIL,
    passwordHash,
    displayName: 'Demo Manager',
    role: 'user',
    status: 'active',
    defaultAgent: null,
    defaultModel: null,
    language: 'ru',
    responseStyle: 'concise',
    dailyQuotaLimit: 50,
    welcomeQuotaGranted: env.WELCOME_QUOTA,
    createdAt: now,
    updatedAt: now,
  }).run()

  db.insert(quotaLedger).values({
    id: uuid(),
    userId,
    delta: env.WELCOME_QUOTA,
    reason: 'welcome_grant',
    createdAt: now,
  }).run()

  console.log('Creating workspace...')
  const ws = await createWorkspace(userId)

  console.log('Creating main session...')
  const sessionId = uuid()
  let ocId: string
  try {
    const oc = await opencodeClient.createSession({ workspacePath: ws.path, title: 'Main session' })
    ocId = oc.id
  } catch (err: any) {
    if (env.ALLOW_LOCAL_OPENCODE_FALLBACK) {
      ocId = `local-${sessionId}`
      console.warn(`OpenCode unavailable, using local fallback: ${ocId}`)
    } else {
      console.error(`OpenCode unavailable and fallback disabled: ${err.message}`)
      console.error('Re-run with ALLOW_LOCAL_OPENCODE_FALLBACK=true to seed with placeholder sessions.')
      process.exit(1)
    }
  }

  db.insert(sessions).values({
    id: sessionId,
    userId,
    workspaceId: ws.id,
    opencodeSessionId: ocId,
    title: 'Main session',
    isMain: true,
    source: 'web',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  }).run()

  console.log('Seeding reminders...')
  const demoReminders = [
    { title: 'Подготовить квартальный отчёт', offsetDays: 0, hour: 17 },
    { title: 'Позвонить Ивану по контракту', offsetDays: 1, hour: 10 },
    { title: 'Созвон с командой дизайна', offsetDays: 2, hour: 15 },
  ]
  for (const r of demoReminders) {
    db.insert(reminders).values({
      id: uuid(),
      userId,
      title: r.title,
      remindAt: isoOffset(r.offsetDays, r.hour),
      timezone: env.DEFAULT_TIMEZONE,
      channel: 'telegram',
      status: 'scheduled',
      createdAt: now,
    }).run()
  }

  console.log('Seeding calendar events...')
  const demoEvents = [
    { title: 'Stand-up с командой', startsHour: 10, endsHour: 10, duration: 30, location: 'Zoom' },
    { title: '1:1 с Петром (HR)', startsHour: 14, endsHour: 15, duration: 60, location: 'Переговорка 3' },
    { title: 'Обзор спринта', startsHour: 16, endsHour: 17, duration: 60, location: 'Zoom' },
    { title: 'Завтрак с клиентом X', offsetDays: 1, startsHour: 9, endsHour: 10, duration: 60, location: 'Кафе "Балтика"' },
    { title: 'Стратегическая сессия', offsetDays: 3, startsHour: 11, endsHour: 13, duration: 120, location: 'Большой зал' },
  ]
  for (const e of demoEvents) {
    const start = e.offsetDays ? isoOffset(e.offsetDays, e.startsHour) : todayAt(e.startsHour)
    const end = e.offsetDays ? isoOffset(e.offsetDays, e.endsHour) : todayAt(e.endsHour)
    db.insert(calendarEvents).values({
      id: uuid(),
      userId,
      title: e.title,
      startsAt: start,
      endsAt: end,
      location: e.location,
      description: null,
      source: 'local',
      createdAt: now,
    }).run()
  }

  console.log('Seeding memory items...')
  const demoMemory = [
    { type: 'fact' as const, content: 'Ответственный за продуктовое направление B2B.' },
    { type: 'fact' as const, content: 'Команда: 8 инженеров, 2 дизайнера, 1 продакт-менеджер.' },
    { type: 'preference' as const, content: 'Предпочитает короткие и структурированные ответы на русском.' },
    { type: 'decision' as const, content: 'Принято: переход с квартальных на двухнедельные релизы.' },
    { type: 'task_context' as const, content: 'Активный найм: 2 бэкенд-инженера, 1 QA.' },
  ]
  for (const m of demoMemory) {
    db.insert(memoryItems).values({
      id: uuid(),
      userId,
      type: m.type,
      content: m.content,
      sourceSessionId: null,
      confidence: 1.0,
      createdAt: now,
      updatedAt: now,
    }).run()
  }

  console.log('\n=== Demo user created ===')
  console.log(`Email:    ${DEMO_EMAIL}`)
  console.log(`Password: ${DEMO_PASSWORD}`)
  console.log(`User ID:  ${userId}`)
  console.log(`Sessions: 1 main session`)
  console.log(`Reminders: ${demoReminders.length}`)
  console.log(`Calendar events: ${demoEvents.length}`)
  console.log(`Memory items: ${demoMemory.length}`)

  // Create smoke test invite code
  const smokeCodeHash = createHash('sha256').update('SMOKE-TEST-CODE').digest('hex')
  const existingSmoke = db.select().from(inviteCodes).where(eq(inviteCodes.codeHash, smokeCodeHash)).get()
  if (!existingSmoke) {
    db.insert(inviteCodes).values({
      id: uuid(),
      codeHash: smokeCodeHash,
      label: 'Smoke test invite',
      status: 'active',
      maxUses: 1000,
      usedCount: 0,
      createdByUserId: userId,
      createdAt: now,
      updatedAt: now,
    }).run()
    console.log('Invite code: SMOKE-TEST-CODE (1000 uses)')
  }

  console.log('\nRun "npm run dev" and log in to see demo data.')
}

main().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
