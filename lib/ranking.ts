/**
 * Ranks that respect ties — "1, 2, 2, 4", the way a real honour board reads.
 *
 * Pure: no database, so it is safe in client components. Sorting by points and
 * printing the row index used to hand ten pupils on +23 the places 2 to 11 in
 * whatever order the query returned them.
 */
export function rankWithTies<T extends { totalPoints: number }>(rows: T[]): (T & { rank: number })[] {
  const sorted = [...rows].sort((a, b) => b.totalPoints - a.totalPoints)
  let rank = 0
  let prev: number | null = null
  return sorted.map((row, i) => {
    if (prev === null || row.totalPoints !== prev) {
      rank = i + 1
      prev = row.totalPoints
    }
    return { ...row, rank }
  })
}

// ─── Periods a board can show ─────────────────────────────────────────────────
// Defined here, not in lib/points, so client components can list them without
// pulling the database module into the browser bundle.

export type LeaderboardPeriod = 'year' | 'month' | 'week'

export const LEADERBOARD_PERIODS: { key: LeaderboardPeriod; label: string }[] = [
  { key: 'year', label: 'العام' },
  { key: 'month', label: 'آخر 30 يوماً' },
  { key: 'week', label: 'آخر 7 أيام' },
]

/** One period's figures for one pupil. `pct` is null when nothing was possible. */
export type PeriodStat = {
  points: number
  /** The most the pupil could have earned in the period — see maxPossiblePoints. */
  possible: number
  pct: number | null
  /** Register days and teacher records in the period — the sample behind `pct`. */
  days: number
  lessons: number
}

/**
 * A school-wide place needs a sample. One perfect lesson is 100%, and on the
 * first day of a window that "100%" would outrank a pupil with thirty good
 * ones. Below this many teacher records a pupil is listed as not yet rated.
 */
export const MIN_LESSONS_FOR_SCHOOL_RANK = 3

/** 🥇🥈🥉 for the first three places; ties share the medal. */
export function medalFor(rank: number): string | null {
  return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null
}
