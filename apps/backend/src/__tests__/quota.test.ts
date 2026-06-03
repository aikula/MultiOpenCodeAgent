import { describe, it, expect } from 'vitest'

// Daily refill logic extracted for testing
function computeRefillDelta(balance: number, dailyLimit: number): number {
  return Math.max(0, dailyLimit - balance)
}

describe('Daily quota refill', () => {
  it('adds full limit when balance is 0', () => {
    expect(computeRefillDelta(0, 20)).toBe(20)
  })

  it('adds partial when balance is above 0 but below limit', () => {
    expect(computeRefillDelta(5, 20)).toBe(15)
  })

  it('adds 0 when balance equals limit', () => {
    expect(computeRefillDelta(20, 20)).toBe(0)
  })

  it('adds 0 when balance exceeds limit', () => {
    expect(computeRefillDelta(35, 20)).toBe(0)
  })

  it('handles edge case of balance at 1', () => {
    expect(computeRefillDelta(1, 20)).toBe(19)
  })
})
