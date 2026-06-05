import { describe, it, expect } from 'vitest'

// Test intent detection logic without DB side-effects
// The routeAction function does DB writes, so we test the regex patterns directly

const REMINDER_INTENT = /(?:напомни|напоминание|remind(?:er)?|не забудь|поставь напоминание)/i
const DAILY_PLAN_INTENT = /(?:план на день|daily plan|план(?:ик)? на сегодня|daily|что сегодня|what'?s today)/i
const RISK_INTENT = /(?:risk|риски|risk review|анализ рисков|оценка рисков)/i
const DECISION_INTENT = /(?:decision|решение|decision log|лог решений|зафиксируй решение)/i
const EMAIL_INTENT = /(?:draft.*email|email.*draft|напиши.*письмо|черновик.*письма|draft.*письмо)/i

describe('Action router intent detection', () => {
  it('detects Russian reminder intent', () => {
    expect(REMINDER_INTENT.test('Напомни завтра в 10 написать Ивану')).toBe(true)
    expect(REMINDER_INTENT.test('напоминание о созвоне')).toBe(true)
    expect(REMINDER_INTENT.test('не забудь купить молоко')).toBe(true)
  })

  it('detects English reminder intent', () => {
    expect(REMINDER_INTENT.test('Remind me tomorrow')).toBe(true)
    expect(REMINDER_INTENT.test('reminder about meeting')).toBe(true)
  })

  it('detects daily plan intent', () => {
    expect(DAILY_PLAN_INTENT.test('план на день')).toBe(true)
    expect(DAILY_PLAN_INTENT.test('daily plan')).toBe(true)
    expect(DAILY_PLAN_INTENT.test('daily')).toBe(true)
    expect(DAILY_PLAN_INTENT.test('что сегодня')).toBe(true)
  })

  it('detects risk review intent', () => {
    expect(RISK_INTENT.test('анализ рисков')).toBe(true)
    expect(RISK_INTENT.test('risk review')).toBe(true)
    expect(RISK_INTENT.test('риски для проекта')).toBe(true)
  })

  it('detects decision log intent', () => {
    expect(DECISION_INTENT.test('зафиксируй решение')).toBe(true)
    expect(DECISION_INTENT.test('decision log')).toBe(true)
  })

  it('detects email draft intent', () => {
    expect(EMAIL_INTENT.test('напиши письмо Ивану')).toBe(true)
    expect(EMAIL_INTENT.test('draft email')).toBe(true)
  })

  it('does not false positive on plain text', () => {
    const plainText = 'Расскажи о преимуществах микросервисов'
    expect(REMINDER_INTENT.test(plainText)).toBe(false)
    expect(DAILY_PLAN_INTENT.test(plainText)).toBe(false)
    expect(RISK_INTENT.test(plainText)).toBe(false)
  })

  it('parses "завтра в 10" reminder', () => {
    const text = 'напомни завтра в 10 написать Ивану по договору'
    const m = text.match(/(?:завтра|tomorrow)\s+(?:в\s+)?(\d{1,2})(?::(\d{2}))?\s+(.+)/i)
    expect(m).not.toBeNull()
    expect(m![1]).toBe('10')
    expect(m![3]).toContain('написать')
  })

  it('parses "через 30 минут" reminder', () => {
    const text = 'напомни через 30 минут позвонить'
    const m = text.match(/(?:через|in)\s+(\d+)\s*(?:минут|мин|m|minutes?)\s+(.+)/i)
    expect(m).not.toBeNull()
    expect(m![1]).toBe('30')
    expect(m![2]).toContain('позвонить')
  })

  it('parses "через 2 часа" reminder', () => {
    const reminderPart = 'через 2 часа закончить отчёт'
    const m = reminderPart.match(/(?:через|in)\s+(\d+)\s*(?:час(?:а|ов)?|h|hours?)\s+(.+)/i)
    expect(m).not.toBeNull()
    expect(m![1]).toBe('2')
    expect(m![2]).toContain('закончить отчёт')
  })
})
