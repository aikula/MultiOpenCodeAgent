import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { rm } from 'fs/promises'
import { existsSync } from 'fs'
import { db } from '../db/index.js'
import {
  users,
  workspaces,
  sessions,
  messages,
  memoryItems,
  quotaLedger,
  reminders,
  calendarEvents,
  telegramLinks,
  auditLog,
  userInstalledSkills,
} from '../db/schema.js'
import { env } from '../env.js'

export class AccountDeletionError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

/**
 * Permanently deletes a user account and all associated data.
 *
 * Order matters because of FK constraints (no ON DELETE CASCADE).
 * Wrapped in a SQLite transaction so a partial failure cannot leak
 * orphan rows.
 *
 * Also removes the workspace directory from disk.
 */
export async function deleteUserAccount(userId: string, password: string): Promise<void> {
  const user = db.select().from(users).where(eq(users.id, userId)).get()
  if (!user) throw new AccountDeletionError('User not found', 404)

  if (user.status === 'blocked') {
    throw new AccountDeletionError('Blocked users cannot self-delete; contact admin', 403)
  }

  if (!user.passwordHash) {
    throw new AccountDeletionError('Account has no password (OAuth-only); cannot verify', 400)
  }

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) throw new AccountDeletionError('Invalid password', 401)

  const wsList = db.select().from(workspaces).where(eq(workspaces.userId, userId)).all()
  const sessionIds = db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .all()
    .map(s => s.id)

  db.transaction((tx: any) => {
    if (sessionIds.length > 0) {
      tx.delete(messages)
        .where(eq(messages.sessionId, sessionIds[0]))
        .run()
      for (let i = 1; i < sessionIds.length; i++) {
        tx.delete(messages)
          .where(eq(messages.sessionId, sessionIds[i]))
          .run()
      }
    }

    tx.delete(messages).where(eq(messages.userId, userId)).run()
    tx.delete(sessions).where(eq(sessions.userId, userId)).run()
    tx.delete(memoryItems).where(eq(memoryItems.userId, userId)).run()
    tx.delete(quotaLedger).where(eq(quotaLedger.userId, userId)).run()
    tx.delete(reminders).where(eq(reminders.userId, userId)).run()
    tx.delete(calendarEvents).where(eq(calendarEvents.userId, userId)).run()
    tx.delete(telegramLinks).where(eq(telegramLinks.userId, userId)).run()
    tx.delete(userInstalledSkills).where(eq(userInstalledSkills.userId, userId)).run()
    tx.delete(workspaces).where(eq(workspaces.userId, userId)).run()

    tx.update(auditLog)
      .set({ actorUserId: null })
      .where(eq(auditLog.actorUserId, userId))
      .run()

    tx.delete(users).where(eq(users.id, userId)).run()
  })

  for (const ws of wsList) {
    if (ws.path && existsSync(ws.path)) {
      try {
        await rm(ws.path, { recursive: true, force: true })
        console.log(`[account-delete] removed workspace dir: ${ws.path}`)
      } catch (err: any) {
        console.error(`[account-delete] failed to remove ${ws.path}: ${err.message}`)
      }
    }
  }

  console.log(`[account-delete] user ${userId} (${user.email}) permanently deleted`)
}

export function isDeletableEmail(email: string): boolean {
  return !email.endsWith('@moca.local') || env.ALLOW_DEMO_DELETION
}
