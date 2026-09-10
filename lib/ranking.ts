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

/** 🥇🥈🥉 for the first three places; ties share the medal. */
export function medalFor(rank: number): string | null {
  return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null
}
