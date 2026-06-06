import { describe, it, expect, beforeAll } from 'vitest'
import { v4 as uuid } from 'uuid'
import bcrypt from 'bcryptjs'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { users, workspaces, calendarEvents, reminders } from '../db/schema.js'
import { buildMessageContext } from '../services/message-context.js'

let userId: string
let wsPath: string

beforeAll(async () => {
  const email = `ctx-${uuid()}@test.com`
  const id = uuid()
  const now = new Date().toISOString()
  const passwordHash = await bcrypt.hash('test', 4)
  db.insert(users).values({
    id, email, passwordHash, displayName: 'Ctx',
    role: 'user', status: 'active', language: 'ru', responseStyle: 'concise',
    dailyQuotaLimit: 20, welcomeQuotaGranted: 30,
    createdAt: now, updatedAt: now,
  }).run()
  userId = id

  wsPath = `/tmp/moca-ctx-ws-${id}`
  mkdirSync(wsPath, { recursive: true })
  mkdirSync(join(wsPath, 'files'), { recursive: true })

  db.insert(workspaces).values({
    id: uuid(), userId, path: wsPath, createdAt: now, status: 'active',
  }).run()

  const today = new Date().toISOString().split('T')[0]
  db.insert(calendarEvents).values({
    id: uuid(), userId, title: 'DBA class', startsAt: `${today}T10:00:00Z`, endsAt: `${today}T11:00:00Z`,
    source: 'local', createdAt: now,
  }).run()
  db.insert(reminders).values({
    id: uuid(), userId, title: 'Call John',
    remindAt: new Date(Date.now() + 3600_000).toISOString(),
    timezone: 'UTC', channel: 'web', status: 'scheduled', createdAt: now,
  }).run()
})

describe('buildMessageContext', () => {
  it('returns files in workspace with text content inline for small text files', () => {
    writeFileSync(join(wsPath, 'files', 'notes.md'), '# Hello\nThis is a test.')
    const ctx = buildMessageContext(userId)
    const notes = ctx.files.find(f => f.name === 'notes.md')
    expect(notes).toBeDefined()
    expect(notes!.isText).toBe(true)
    expect(notes!.content).toContain('Hello')
  })

  it('lists binary files without trying to read content', () => {
    const buf = Buffer.alloc(2048, 0xff)
    writeFileSync(join(wsPath, 'files', 'binary.pdf'), buf)
    const ctx = buildMessageContext(userId)
    const bin = ctx.files.find(f => f.name === 'binary.pdf')
    expect(bin).toBeDefined()
    expect(bin!.isText).toBe(false)
    expect(bin!.content).toBeUndefined()
  })

  it('queries calendar events without crashing', () => {
    const ctx = buildMessageContext(userId)
    expect(Array.isArray(ctx.calendarToday)).toBe(true)
  })

  it('includes pending reminders', () => {
    const ctx = buildMessageContext(userId)
    expect(ctx.reminders.length).toBeGreaterThan(0)
    expect(ctx.reminders.some(r => r.title === 'Call John')).toBe(true)
  })

  it('includes memory count', () => {
    const ctx = buildMessageContext(userId)
    expect(ctx.memoryCount).toBe(0)
  })

  it('prompt contains all sections for the agent', () => {
    writeFileSync(join(wsPath, 'files', 'todo.md'), 'do laundry')
    const ctx = buildMessageContext(userId)
    expect(ctx.prompt).toContain('[System context for this turn]')
    expect(ctx.prompt).toContain('Files in your workspace')
    expect(ctx.prompt).toMatch(/Today's calendar|No calendar events today/)
    expect(ctx.prompt).toMatch(/Pending reminders|No pending reminders/)
    expect(ctx.prompt).toContain('Memory items:')
    expect(ctx.prompt).toContain('Available actions')
    expect(ctx.prompt).toContain('[/System context]')
  })

  it('does not crash on missing workspace', () => {
    const fakeId = uuid()
    const ctx = buildMessageContext(fakeId)
    expect(ctx.files).toEqual([])
    expect(ctx.calendarToday).toEqual([])
  })
})
