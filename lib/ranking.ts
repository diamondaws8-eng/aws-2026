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

// ─── The honour board a family may see ───────────────────────────────────────
/** One period of the board, already cut to what a home is allowed to read. */
export type HonorBoardView = {
  /** The names on the board: the top five only, never a full ranking. */
  top: { name: string; rank: number; points: number; isMine: boolean }[]
  myRank: number
  myPoints: number
  gap: number
  /** The child is not among the names shown, so their place is stated apart. */
  showMine: boolean
}

/**
 * Rank a class and keep only what one family may read.
 *
 * This used to run in the browser, which meant the whole class — every
 * pupil's name and points — was serialised into every parent's page and
 * only then sliced to five. The slice is the point: an honour board
 * celebrates the top, while a full ranking in every home shames the pupils
 * at the bottom in front of the whole class. So it is cut here, before it
 * ever leaves the server, and the names of everyone else never travel.
 */
export function buildHonorBoard<T extends { id: string; name: string; periods: Record<LeaderboardPeriod, { points: number }> }>(
  rows: T[],
  childId: string,
  period: LeaderboardPeriod,
  top = 5,
): HonorBoardView {
  // A pupil with nothing positive this period is not on the list at all.
  const scoring = rows
    .map((r) => ({ id: r.id, name: r.name, totalPoints: r.periods[period].points }))
    .filter((r) => r.totalPoints > 0)
  const ranked = rankWithTies(scoring)
  const mine = ranked.find((r) => r.id === childId)
  const myPoints = mine?.totalPoints ?? rows.find((r) => r.id === childId)?.periods[period].points ?? 0
  const above = mine ? ranked.filter((r) => r.rank < mine.rank).pop() : ranked[ranked.length - 1]
  const shown = ranked.slice(0, top)
  return {
    top: shown.map((r) => ({ name: r.name, rank: r.rank, points: r.totalPoints, isMine: r.id === childId })),
    myRank: mine?.rank ?? ranked.length + 1,
    myPoints,
    gap: above ? above.totalPoints - myPoints : 0,
    // The child's own line appears whenever their name is not among the rows
    // shown — a tie at rank 1 across forty pupils puts most of them outside the
    // five rows while their rank is still 1.
    showMine: shown.length > 0 && !shown.some((r) => r.id === childId),
  }
}

/** Every period of the board, each already cut. */
export function buildHonorBoards<T extends { id: string; name: string; periods: Record<LeaderboardPeriod, { points: number }> }>(
  rows: T[],
  childId: string,
): Record<LeaderboardPeriod, HonorBoardView> {
  return Object.fromEntries(
    LEADERBOARD_PERIODS.map((p) => [p.key, buildHonorBoard(rows, childId, p.key)]),
  ) as Record<LeaderboardPeriod, HonorBoardView>
}
