import { db } from '@/lib/db'
import { classes, gradeLevels, lessonRecords, dailyRecords, subjects, schools } from '@/lib/db/schema'
import { and, eq, inArray, gte, sql } from 'drizzle-orm'
import { getSchoolDaysConfig } from '@/lib/school-holidays'
import { lastSchoolDays } from '@/lib/school-days'

/**
 * Days a teacher's class went unrecorded.
 *
 * This is the one failure the system cannot see by itself. A wrong mark leaves
 * a row to argue with; a day nobody opened leaves nothing at all — the family
 * hears nothing, the absence sheet is short a class, and the attendance rate
 * quietly *improves*, because it is a percentage of what was recorded. The
 * more days are skipped, the healthier the numbers look.
 *
 * So the teacher is told, not the manager: the teacher is the only person who
 * can still fix it, and can do it in one click without anyone chasing them.
 */

export type MissedDay = {
  classId: string
  className: string
  gradeName: string | null
  date: string
}

/**
 * One school day — yesterday, in effect. Not a week.
 *
 * Two things were measured before settling on this. Over seven days a teacher
 * of eight classes met thirty-one red lines, which is a wall nobody reads and
 * so protects nothing. And the deeper objection: a register filled in a week
 * late is not recovered, it is invented — nobody remembers who was absent last
 * Tuesday — and the invention reaches the family as fact, which is worse than
 * the gap it covers.
 *
 * Yesterday is the one day a teacher can honestly reconstruct. Anything older
 * belongs to the administration, which has a correction screen that demands a
 * reason and records who gave it.
 */
const LOOKBACK_SCHOOL_DAYS = 1

export async function missedDaysForTeacher(
  schoolId: string,
  teacherUserId: string,
  today: string,
  lookback = LOOKBACK_SCHOOL_DAYS,
): Promise<MissedDay[]> {
  // Only classes this teacher is actually assigned to. A class nobody has been
  // given is the administration's gap to fill, not this teacher's to answer for.
  const mine = await db
    .select({
      classId: classes.id,
      className: classes.name,
      gradeLevelId: classes.gradeLevelId,
      gradeName: gradeLevels.name,
    })
    .from(subjects)
    .innerJoin(classes, eq(classes.id, subjects.classId))
    .leftJoin(gradeLevels, eq(gradeLevels.id, classes.gradeLevelId))
    .where(and(eq(subjects.schoolId, schoolId), eq(subjects.teacherUserId, teacherUserId)))
  if (mine.length === 0) return []

  /**
   * Nothing counts as missed before the school began using the system.
   *
   * Without this, the morning after the trial data is wiped every teacher
   * would open the portal to a wall of red for days the school was not yet
   * recording at all — and an alert that is wrong on its first day is an
   * alert nobody reads on its hundredth. The floor is the school's own first
   * recorded day, or the year's start date when the owner has set one,
   * whichever is later.
   */
  const [[firstRow], [schoolRow]] = await Promise.all([
    db
      .select({ d: sql<string | null>`min(${dailyRecords.date})` })
      .from(dailyRecords)
      .where(eq(dailyRecords.schoolId, schoolId)),
    db.select({ yearStart: schools.yearStartDate }).from(schools).where(eq(schools.id, schoolId)).limit(1),
  ])
  const firstRecorded = firstRow?.d ?? null
  if (!firstRecorded) return []
  const floor = schoolRow?.yearStart && schoolRow.yearStart > firstRecorded ? schoolRow.yearStart : firstRecorded

  // Each stage keeps its own calendar — one may teach on Saturday and another not.
  const stages = [...new Set(mine.map((c) => c.gradeLevelId))]
  const daysByStage = new Map<string | null, string[]>()
  await Promise.all(
    stages.map(async (gid) => {
      const cfg = await getSchoolDaysConfig(schoolId, gid)
      // Today is still being taught; a teacher is not late for a lesson that
      // has not finished. Ask for one extra day and drop it.
      const days = lastSchoolDays(lookback + 1, cfg, today).filter((d) => d < today && d >= floor)
      daysByStage.set(gid, days)
    }),
  )

  const windowDays = [...new Set([...daysByStage.values()].flat())]
  if (windowDays.length === 0) return []

  // What this teacher has already recorded — the same measure the dashboard's
  // card for today uses, so "done" means the same thing on both.
  const done = await db
    .selectDistinct({ classId: lessonRecords.classId, date: lessonRecords.date })
    .from(lessonRecords)
    .where(
      and(
        eq(lessonRecords.teacherUserId, teacherUserId),
        inArray(lessonRecords.classId, mine.map((c) => c.classId)),
        inArray(lessonRecords.date, windowDays),
        gte(lessonRecords.date, floor),
      ),
    )
  const recorded = new Set(done.map((r) => `${r.classId}|${r.date}`))

  const missed: MissedDay[] = []
  for (const c of mine) {
    for (const date of daysByStage.get(c.gradeLevelId) ?? []) {
      if (!recorded.has(`${c.classId}|${date}`)) {
        missed.push({ classId: c.classId, className: c.className, gradeName: c.gradeName, date })
      }
    }
  }
  // Newest first: yesterday is the one still worth fixing today.
  return missed.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.className.localeCompare(b.className)))
}
