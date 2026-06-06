import { describe, it, expect } from 'vitest'
import { routeAction } from '../services/action-router.js'

describe('Action router passthrough', () => {
  it('returns original text with no side effects', () => {
    const result = routeAction('user-1', 'Напомни завтра в 10 написать Ивану')
    expect(result.enrichedText).toBe('Напомни завтра в 10 написать Ивану')
    expect(result.sideEffects).toEqual([])
  })

  it('passes through English text unchanged', () => {
    const result = routeAction('user-1', 'Remind me tomorrow to call Sarah')
    expect(result.enrichedText).toBe('Remind me tomorrow to call Sarah')
    expect(result.sideEffects).toEqual([])
  })

  it('passes through plain questions unchanged', () => {
    const result = routeAction('user-1', 'What are the benefits of microservices?')
    expect(result.enrichedText).toBe('What are the benefits of microservices?')
    expect(result.sideEffects).toEqual([])
  })

  it('passes through daily plan requests unchanged', () => {
    const result = routeAction('user-1', 'план на день')
    expect(result.enrichedText).toBe('план на день')
    expect(result.sideEffects).toEqual([])
  })

  it('passes through calendar requests unchanged', () => {
    const result = routeAction('user-1', 'добавь встречу завтра в 15:00')
    expect(result.enrichedText).toBe('добавь встречу завтра в 15:00')
    expect(result.sideEffects).toEqual([])
  })

  it('passes through risk review requests unchanged', () => {
    const result = routeAction('user-1', 'risk review for the project')
    expect(result.enrichedText).toBe('risk review for the project')
    expect(result.sideEffects).toEqual([])
  })

  it('ignores userId — no user-specific logic', () => {
    const a = routeAction('user-a', 'test message')
    const b = routeAction('user-b', 'test message')
    expect(a.enrichedText).toBe(b.enrichedText)
    expect(a.sideEffects).toEqual(b.sideEffects)
  })
})
