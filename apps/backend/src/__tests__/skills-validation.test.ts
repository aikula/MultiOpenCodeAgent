import { describe, it, expect } from 'vitest'

const SKILL_SLUG_RE = /^[a-z0-9][a-z0-9-]{1,60}$/

describe('Skill slug validation', () => {
  it('accepts valid slugs', () => {
    expect(SKILL_SLUG_RE.test('daily-plan')).toBe(true)
    expect(SKILL_SLUG_RE.test('my-skill')).toBe(true)
    expect(SKILL_SLUG_RE.test('abc123')).toBe(true)
  })

  it('rejects slugs with uppercase', () => {
    expect(SKILL_SLUG_RE.test('Daily-Plan')).toBe(false)
  })

  it('rejects slugs with spaces', () => {
    expect(SKILL_SLUG_RE.test('daily plan')).toBe(false)
  })

  it('rejects slugs with special characters', () => {
    expect(SKILL_SLUG_RE.test('daily_plan')).toBe(false)
    expect(SKILL_SLUG_RE.test('daily.plan')).toBe(false)
    expect(SKILL_SLUG_RE.test('daily/plan')).toBe(false)
  })

  it('rejects empty slugs', () => {
    expect(SKILL_SLUG_RE.test('')).toBe(false)
  })

  it('rejects single character slugs', () => {
    expect(SKILL_SLUG_RE.test('a')).toBe(false)
  })

  it('rejects slugs starting with hyphen', () => {
    expect(SKILL_SLUG_RE.test('-daily')).toBe(false)
  })

  it('rejects slugs with path traversal', () => {
    expect(SKILL_SLUG_RE.test('../etc')).toBe(false)
  })
})
