import { eq, and, sql } from 'drizzle-orm'
import { v4 as uuid } from 'uuid'
import { db } from '../db/index.js'
import { quotaLedger, users } from '../db/schema.js'
import { env } from '../env.js'

export function getBalance(userId: string): number {
  const result = db
    .select({ total: sql<number>`COALESCE(SUM(${quotaLedger.delta}), 0)` })
    .from(quotaLedger)
    .where(eq(quotaLedger.userId, userId))
    .get()
  return result?.total ?? 0
}

export function grantWelcomeQuota(userId: string) {
  const now = new Date().toISOString()
  db.insert(quotaLedger).values({
    id: uuid(),
    userId,
    delta: env.WELCOME_QUOTA,
    reason: 'welcome_grant',
    createdAt: now,
  }).run()
}

export function chargeQuota(userId: string, amount: number, reason: string) {
  db.transaction((tx) => {
    const result = tx
      .select({ total: sql<number>`COALESCE(SUM(${quotaLedger.delta}), 0)` })
      .from(quotaLedger)
      .where(eq(quotaLedger.userId, userId))
      .get()
    const balance = result?.total ?? 0
    if (balance < amount) throw new Error('Insufficient quota')

    const now = new Date().toISOString()
    tx.insert(quotaLedger).values({
      id: uuid(),
      userId,
      delta: -amount,
      reason,
      createdAt: now,
    }).run()
  })
}

export function grantQuota(userId: string, amount: number, reason: string, metadata?: object) {
  const now = new Date().toISOString()
  db.insert(quotaLedger).values({
    id: uuid(),
    userId,
    delta: amount,
    reason,
    metadataJson: metadata ? JSON.stringify(metadata) : null,
    createdAt: now,
  }).run()
}

export function getDailyQuotaLimit(userId: string): number {
  const user = db.select({ dailyQuotaLimit: users.dailyQuotaLimit })
    .from(users)
    .where(eq(users.id, userId))
    .get()
  return user?.dailyQuotaLimit ?? env.DAILY_QUOTA_LIMIT
}
