import { describe, expect, it } from 'vitest'
import { normalizeWordGoal, WORD_GOAL_MAX, WORD_GOAL_MIN } from './wordGoal'

describe('word goal', () => {
  it('accepts integers within bounds', () => {
    expect(normalizeWordGoal(WORD_GOAL_MIN)).toBe(WORD_GOAL_MIN)
    expect(normalizeWordGoal(500)).toBe(500)
    expect(normalizeWordGoal(WORD_GOAL_MAX)).toBe(WORD_GOAL_MAX)
  })

  it('rejects null-like, fractional and out-of-range values', () => {
    expect(normalizeWordGoal(null)).toBeNull()
    expect(normalizeWordGoal(undefined)).toBeNull()
    expect(normalizeWordGoal(WORD_GOAL_MIN - 1)).toBeNull()
    expect(normalizeWordGoal(WORD_GOAL_MAX + 1)).toBeNull()
    expect(normalizeWordGoal(500.5)).toBeNull()
    expect(normalizeWordGoal(Number.NaN)).toBeNull()
    expect(normalizeWordGoal('500')).toBeNull()
  })
})
