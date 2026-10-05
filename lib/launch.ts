import { cache } from 'react'
import { db } from '@/lib/db'
import { schools } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { NOT_LIVE_LABEL, BEFORE_LIVE_LABEL } from '@/lib/school-days'

/**
 * Whether the school has begun using the system for real, and since when.
 *
 * A school is set up before it is run: stages, classes, teachers, pupils and
 * timetables go in over days or weeks, and the families are invited. Nothing
 * that happens in that time is the school's record — a register taken to try
 * the screen is not an absence — so until the owner presses «التشغيل» nothing
 * is recorded and nothing is counted, and from that day everything is.
 *
 * Most of that is enforced by the calendar, not here: lib/school-holidays.ts
 * lays a closure over every day before the launch, so each screen that asks
 * «is this a teaching day» — the roster, the office's register, the dashboards,
 * the missed-day reminders — already answers no. This file is for the few
 * writes that never ask the calendar.
 *
 * Not in a 'use server' file: it takes a school id and trusts it.
 */
export const getLiveSince = cache(async (schoolId: string): Promise<string | null> => {
  const [row] = await db
    .select({ liveSince: schools.liveSince })
    .from(schools)
    .where(eq(schools.id, schoolId))
    .limit(1)
  return row?.liveSince ?? null
})

/** Why nothing may be recorded on this date, or null when the school is live on it. */
export async function notLiveReason(schoolId: string, date: string): Promise<string | null> {
  const liveSince = await getLiveSince(schoolId)
  if (!liveSince) return NOT_LIVE_LABEL
  return date < liveSince ? BEFORE_LIVE_LABEL : null
}
