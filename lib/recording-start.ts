import { cache } from 'react'
import { db } from '@/lib/db'
import { dailyRecords, schools } from '@/lib/db/schema'
import { and, eq, sql } from 'drizzle-orm'

/**
 * The first day the school can be held to account for recording.
 *
 * A school enters its real first day of study — late August — and then starts
 * using the system in October. The weeks in between were taught, but nobody
 * was asked to record them here, so they are not neglected days and no screen
 * may count them as such: the morning after the trial data is wiped, a
 * dashboard reporting "13 of 14 school days with no recording" is wrong on its
 * first day, and a warning that starts out wrong is one nobody reads later.
 *
 * So the floor is the first register entry of the current year — the first
 * entry on or after the year's start date, or simply the first entry when no
 * start date is set. Null while nothing has been recorded this year: there is
 * no day yet that anybody could have missed.
 */
export const recordingStart = cache(async (schoolId: string): Promise<string | null> => {
  const [row] = await db
    .select({ d: sql<string | null>`min(${dailyRecords.date})` })
    .from(dailyRecords)
    .where(and(
      eq(dailyRecords.schoolId, schoolId),
      // Dates are YYYY-MM-DD text, so they compare as written; '' sorts before all of them.
      sql`${dailyRecords.date} >= COALESCE((SELECT ${schools.yearStartDate} FROM ${schools} WHERE ${schools.id} = ${schoolId}), '')`,
    ))
  return row?.d ?? null
})
