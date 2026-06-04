import { describe, it, expect } from 'vitest'
import bcrypt from 'bcryptjs'
import { v4 as uuid } from 'uuid'
import { eq } from 'drizzle-orm'
import { db, sqlite } from '../db/index.js'
import {
  users,
  workspaces,
  sessions,
  messages,
  reminders,
  calendarEvents,
  memoryItems,
  quotaLedger,
  telegramLinks,
  auditLog,
} from '../db/schema.js'
import { AccountDeletionError, deleteUserAccount } from '../services/account-delete.js'
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'fs'
import { join } from 'path'

function isoNow(offsetMs = 0) {
  return new Date(Date.now() + offsetMs).toISOString()
}

async function createTestUser(email: string, password: string) {
  const id = uuid()
  const now = new Date().toISOString()
  const passwordHash = await bcrypt.hash(password, 4)
  db.insert(users).values({
    id,
    email,
    passwordHash,
    displayName: 'Test',
    role: 'user',
    status: 'active',
    language: 'ru',
    responseStyle: 'concise',
    dailyQuotaLimit: 20,
    welcomeQuotaGranted: 30,
    createdAt: now,
    updatedAt: now,
  }).run()
  return { id, email, passwordHash, now }
}

describe('deleteUserAccount', () => {
  it('rejects when password is wrong', async () => {
    const u = await createTestUser(`del-wrong-${uuid()}@test.com`, 'correct-pw')
    await expect(deleteUserAccount(u.id, 'wrong-pw')).rejects.toThrow(AccountDeletionError)
    const remaining = db.select().from(users).where(eq(users.id, u.id)).get()
    expect(remaining).toBeDefined()
  })

  it('rejects when user does not exist', async () => {
    await expect(deleteUserAccount(uuid(), 'whatever')).rejects.toThrow(AccountDeletionError)
  })

  it('rejects when user is blocked', async () => {
    const u = await createTestUser(`del-blocked-${uuid()}@test.com`, 'pw')
    db.update(users).set({ status: 'blocked' }).where(eq(users.id, u.id)).run()
    await expect(deleteUserAccount(u.id, 'pw')).rejects.toThrow(/Blocked/)
    const remaining = db.select().from(users).where(eq(users.id, u.id)).get()
    expect(remaining).toBeDefined()
  })

  it('cascades deletion of all related rows', async () => {
    const u = await createTestUser(`del-cascade-${uuid()}@test.com`, 'pw')
    const wsId = uuid()
    const wsPath = `/tmp/test-ws-${u.id}`
    mkdirSync(wsPath, { recursive: true })
    writeFileSync(join(wsPath, 'AGENTS.md'), '# test')

    db.insert(workspaces).values({
      id: wsId, userId: u.id, path: wsPath, createdAt: isoNow(), status: 'active',
    }).run()
    db.insert(sessions).values({
      id: uuid(), userId: u.id, workspaceId: wsId, opencodeSessionId: 'ses_x',
      title: 's', isMain: true, source: 'web', status: 'active',
      createdAt: isoNow(), updatedAt: isoNow(),
    }).run()
    db.insert(reminders).values({
      id: uuid(), userId: u.id, title: 'r', remindAt: isoNow(60_000),
      timezone: 'UTC', channel: 'web', status: 'scheduled', createdAt: isoNow(),
    }).run()
    db.insert(calendarEvents).values({
      id: uuid(), userId: u.id, title: 'e', startsAt: isoNow(60_000), endsAt: isoNow(120_000),
      source: 'local', createdAt: isoNow(),
    }).run()
    db.insert(memoryItems).values({
      id: uuid(), userId: u.id, type: 'fact', content: 'm',
      confidence: 1.0, createdAt: isoNow(), updatedAt: isoNow(),
    }).run()
    db.insert(quotaLedger).values({
      id: uuid(), userId: u.id, delta: 1, reason: 'test', createdAt: isoNow(),
    }).run()
    db.insert(telegramLinks).values({
      id: uuid(), userId: u.id, telegramUserId: String(Math.floor(Math.random() * 1e9)),
      linkedAt: isoNow(), isActive: true,
    }).run()
    db.insert(auditLog).values({
      id: uuid(), actorUserId: u.id, action: 'user_registered',
      targetType: 'user', targetId: u.id, createdAt: isoNow(),
    }).run()

    expect(existsSync(wsPath)).toBe(true)
    await deleteUserAccount(u.id, 'pw')

    expect(db.select().from(users).where(eq(users.id, u.id)).get()).toBeUndefined()
    expect(db.select().from(workspaces).where(eq(workspaces.userId, u.id)).all()).toHaveLength(0)
    expect(db.select().from(sessions).where(eq(sessions.userId, u.id)).all()).toHaveLength(0)
    expect(db.select().from(reminders).where(eq(reminders.userId, u.id)).all()).toHaveLength(0)
    expect(db.select().from(calendarEvents).where(eq(calendarEvents.userId, u.id)).all()).toHaveLength(0)
    expect(db.select().from(memoryItems).where(eq(memoryItems.userId, u.id)).all()).toHaveLength(0)
    expect(db.select().from(quotaLedger).where(eq(quotaLedger.userId, u.id)).all()).toHaveLength(0)
    expect(db.select().from(telegramLinks).where(eq(telegramLinks.userId, u.id)).all()).toHaveLength(0)
    expect(db.select().from(auditLog).where(eq(auditLog.actorUserId, u.id)).all()).toHaveLength(0)
    expect(existsSync(wsPath)).toBe(false)
  })

  it('nulls out actorUserId in audit log (audit trail preserved)', async () => {
    const u = await createTestUser(`del-audit-${uuid()}@test.com`, 'pw')
    const auditId = uuid()
    db.insert(auditLog).values({
      id: auditId, actorUserId: u.id, action: 'user_registered',
      targetType: 'user', targetId: u.id, createdAt: isoNow(),
    }).run()

    await deleteUserAccount(u.id, 'pw')

    const row = db.select().from(auditLog).where(eq(auditLog.id, auditId)).get()
    expect(row).toBeDefined()
    expect(row!.actorUserId).toBeNull()
  })
})
