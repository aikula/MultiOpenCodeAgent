import { describe, it, expect, vi, beforeEach } from 'vitest'

// Parse function extracted from bot.ts for testing
function parseReminderText(text: string, now: Date = new Date('2026-06-03T14:00:00Z')): { title: string; remindAt: Date } | null {
  // 2026-06-04 10:00 write Ivan about contract
  const fullDateMatch = text.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s+(.+)$/)
  if (fullDateMatch) {
    const date = new Date(`${fullDateMatch[1]}T${fullDateMatch[2]}:00`)
    if (!isNaN(date.getTime())) {
      return { remindAt: date, title: fullDateMatch[3] }
    }
  }

  // tomorrow 10:00 write Ivan about contract
  const tomorrowMatch = text.match(/^tomorrow\s+(\d{1,2}:\d{2})\s+(.+)$/i)
  if (tomorrowMatch) {
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const [h, m] = tomorrowMatch[1].split(':').map(Number)
    tomorrow.setHours(h, m, 0, 0)
    return { remindAt: tomorrow, title: tomorrowMatch[2] }
  }

  // today 18:30 check report
  const todayMatch = text.match(/^today\s+(\d{1,2}:\d{2})\s+(.+)$/i)
  if (todayMatch) {
    const date = new Date(now)
    const [h, m] = todayMatch[1].split(':').map(Number)
    date.setHours(h, m, 0, 0)
    return { remindAt: date, title: todayMatch[2] }
  }

  // in 30m call back
  const inMinutesMatch = text.match(/^in\s+(\d+)m\s+(.+)$/i)
  if (inMinutesMatch) {
    const date = new Date(now.getTime() + parseInt(inMinutesMatch[1]) * 60_000)
    return { remindAt: date, title: inMinutesMatch[2] }
  }

  // in 2h prepare meeting plan
  const inHoursMatch = text.match(/^in\s+(\d+)h\s+(.+)$/i)
  if (inHoursMatch) {
    const date = new Date(now.getTime() + parseInt(inHoursMatch[1]) * 3600_000)
    return { remindAt: date, title: inHoursMatch[2] }
  }

  return null
}

describe('Reminder parser', () => {
  const baseNow = new Date('2026-06-03T14:00:00Z')

  it('parses full date format', () => {
    const result = parseReminderText('2026-06-04 10:00 write Ivan about contract', baseNow)
    expect(result).not.toBeNull()
    expect(result!.title).toBe('write Ivan about contract')
    expect(result!.remindAt.toISOString()).toContain('2026-06-04')
    expect(result!.remindAt.getHours()).toBe(10)
  })

  it('parses tomorrow format', () => {
    const result = parseReminderText('tomorrow 10:00 write Ivan about contract', baseNow)
    expect(result).not.toBeNull()
    expect(result!.title).toBe('write Ivan about contract')
    expect(result!.remindAt.getHours()).toBe(10)
  })

  it('parses today format', () => {
    const result = parseReminderText('today 18:30 check report', baseNow)
    expect(result).not.toBeNull()
    expect(result!.title).toBe('check report')
    expect(result!.remindAt.getHours()).toBe(18)
    expect(result!.remindAt.getMinutes()).toBe(30)
  })

  it('parses in Xm format', () => {
    const result = parseReminderText('in 30m call back', baseNow)
    expect(result).not.toBeNull()
    expect(result!.title).toBe('call back')
    expect(result!.remindAt.getTime() - baseNow.getTime()).toBe(30 * 60_000)
  })

  it('parses in Xh format', () => {
    const result = parseReminderText('in 2h prepare meeting plan', baseNow)
    expect(result).not.toBeNull()
    expect(result!.title).toBe('prepare meeting plan')
    expect(result!.remindAt.getTime() - baseNow.getTime()).toBe(2 * 3600_000)
  })

  it('returns null for invalid format', () => {
    const result = parseReminderText('something random without date', baseNow)
    expect(result).toBeNull()
  })

  it('returns null for empty input', () => {
    const result = parseReminderText('', baseNow)
    expect(result).toBeNull()
  })
})
