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
  /**
   * 'register' — nobody took the register that day, so the family heard
   * nothing and the attendance is genuinely gone.
   * 'assessment' — a colleague took the register, so the attendance is on
   * record; what is missing is this teacher's own marks for their lesson.
   */
  kind: 'register' | 'assessment'
}

/**
 * How far back to look, and why the answer has two numbers.
 *
 * Attendance is shared: the first teacher to open a class fixes the day for
 * everyone, and getRosterForDay hands that register to whoever opens it
 * afterwards. So the honest limit is not "how long ago" but "is the register
 * there".
 *
 * Where a colleague already took it, nothing has to be remembered — the
 * absences are on the screen and this teacher only adds their own lesson
 * marks. That is safe to offer for a week.
 *
 * Where nobody took it at all, the attendance does not exist anywhere, and a
 * teacher filling it days later is not recovering it but inventing it — the
 * invention then reaches the family as fact. Only the most recent school day
 * is offered for that; anything older belongs to the administration's
 * correction screen, which demands a written reason and records who gave it.
 *
 * (Measured first: a flat seven-day window put thirty-one red lines in front
 * of a teacher of eight classes, which is a wall nobody reads.)
 */
const LOOKBACK_SCHOOL_DAYS = 7

export async function missedDaysForTeacher(
  schoolId: string,
  teacherUserId: string,
  today: string,
  lookback = LOOKBACK_SCHOOL_DAYS,
): Promise<MissedDay[]> {
  // Only classes this teacher is actually assigned to. A class nobody has been
  // given is the administration's gap to fill, not this teacher's to answer for.
  const mineRows = await db
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
  // A teacher with two subjects in one class must not see the class twice.
  const mine = [...new Map(mineRows.map((c) => [c.classId, c])).values()]
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
      // has not finished. Drop it, then keep exactly `lookback` days — on a
      // Friday nothing is dropped and the window would otherwise be one long.
      const days = lastSchoolDays(lookback + 1, cfg, today).filter((d) => d < today && d >= floor).slice(-lookback)
      daysByStage.set(gid, days)
    }),
  )

  const windowDays = [...new Set([...daysByStage.values()].flat())]
  if (windowDays.length === 0) return []

  const classIds = mine.map((c) => c.classId)
  const [done, registered] = await Promise.all([
    // What this teacher has already assessed — the same measure the dashboard's
    // card for today uses, so "done" means the same thing on both.
    db
      .selectDistinct({ classId: lessonRecords.classId, date: lessonRecords.date })
      .from(lessonRecords)
      .where(
        and(
          eq(lessonRecords.teacherUserId, teacherUserId),
          inArray(lessonRecords.classId, classIds),
          inArray(lessonRecords.date, windowDays),
          gte(lessonRecords.date, floor),
        ),
      ),
    // Whether the register exists at all that day, by ANY teacher — this is
    // what decides whether an older gap can be filled honestly.
    db
      .selectDistinct({ classId: dailyRecords.classId, date: dailyRecords.date })
      .from(dailyRecords)
      .where(and(inArray(dailyRecords.classId, classIds), inArray(dailyRecords.date, windowDays))),
  ])
  const recorded = new Set(done.map((r) => `${r.classId}|${r.date}`))
  const hasRegister = new Set(registered.map((r) => `${r.classId}|${r.date}`))
  // The one day an untaken register may still be taken from memory — per
  // stage, because a stage that does not teach on Saturday has an earlier
  // "yesterday" than one that does, and the union's latest day would hide
  // its untaken Thursday.
  const latestByStage = new Map<string | null, string | null>()
  for (const [gid, days] of daysByStage) latestByStage.set(gid, days.length ? days[days.length - 1] : null)

  const missed: MissedDay[] = []
  for (const c of mine) {
    const latestSchoolDay = latestByStage.get(c.gradeLevelId) ?? null
    for (const date of daysByStage.get(c.gradeLevelId) ?? []) {
      const key = `${c.classId}|${date}`
      if (recorded.has(key)) continue
      const kind: 'register' | 'assessment' = hasRegister.has(key) ? 'assessment' : 'register'
      // An untaken register older than the stage's last school day is not
      // this teacher's to reconstruct.
      if (kind === 'register' && date !== latestSchoolDay) continue
      missed.push({ classId: c.classId, className: c.className, gradeName: c.gradeName, date, kind })
    }
  }
  // Newest first: yesterday is the one still worth fixing today.
  return missed.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.className.localeCompare(b.className)))
}
