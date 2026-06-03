import { eq, sql as drizzleSql } from 'drizzle-orm'
import { v4 as uuid } from 'uuid'
import { db } from '../db/index.js'
import { reminders, users, quotaLedger, telegramLinks } from '../db/schema.js'
import { env } from '../env.js'

let telegramBot: any = null

export function setTelegramBot(bot: any) {
  telegramBot = bot
}

export function startScheduler() {
  // Check due reminders every 60 seconds
  setInterval(() => {
    try {
      const now = new Date().toISOString()
      const due = db.select().from(reminders)
        .where(eq(reminders.status, 'scheduled'))
        .all()
        .filter(r => r.remindAt <= now)

      for (const reminder of due) {
        const user = db.select().from(users).where(eq(users.id, reminder.userId)).get()
        if (user && user.status === 'active') {
          const text = `Reminder: ${reminder.title}${reminder.description ? `\n${reminder.description}` : ''}`

          if ((reminder.channel === 'telegram' || reminder.channel === 'both') && telegramBot) {
            const link = db.select().from(telegramLinks)
              .where(eq(telegramLinks.userId, user.id))
              .get()
            if (link?.isActive) {
              telegramBot.telegram.sendMessage(link.telegramUserId, text).catch(() => {})
            }
          }
        }
        db.update(reminders)
          .set({ status: 'sent' })
          .where(eq(reminders.id, reminder.id))
          .run()
      }
    } catch (err) {
      console.error('Reminder scheduler error:', err)
    }
  }, 60_000)

  // Daily quota refill — check every hour, act once per day
  let lastRefillDate = ''
  setInterval(() => {
    try {
      const today = new Date().toISOString().split('T')[0]
      if (today === lastRefillDate) return
      lastRefillDate = today

      const activeUsers = db.select().from(users)
        .where(eq(users.status, 'active'))
        .all()

      const todayStart = `${today}T00:00:00Z`

      for (const user of activeUsers) {
        const limit = user.dailyQuotaLimit ?? env.DAILY_QUOTA_LIMIT

        const existing = db.select().from(quotaLedger)
          .where(drizzleSql`${quotaLedger.userId} = ${user.id} AND ${quotaLedger.reason} = 'daily_refill' AND ${quotaLedger.createdAt} >= ${todayStart}`)
          .get()

        if (!existing) {
          db.insert(quotaLedger).values({
            id: uuid(),
            userId: user.id,
            delta: limit,
            reason: 'daily_refill',
            metadataJson: JSON.stringify({ date: today }),
            createdAt: new Date().toISOString(),
          }).run()
        }
      }
    } catch (err) {
      console.error('Quota refill error:', err)
    }
  }, 3600_000)

  console.log('Scheduler started (reminders: 60s, quota refill: hourly)')
}
