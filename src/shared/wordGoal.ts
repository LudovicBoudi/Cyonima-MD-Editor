/** Smallest and largest accepted word goal. `null` means no goal. */
export const WORD_GOAL_MIN = 10
export const WORD_GOAL_MAX = 100000

/** Keeps a valid integer goal, or `null` for anything else. */
export function normalizeWordGoal(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= WORD_GOAL_MIN &&
    value <= WORD_GOAL_MAX
    ? value
    : null
}
