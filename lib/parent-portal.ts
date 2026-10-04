import { db } from '@/lib/db'
import { students, classes, dailyRecords, lessonRecords, studentPoints, subjects, teachers } from '@/lib/db/schema'
import { and, asc, desc, eq, gte, inArray, lte, or, sql, type SQL } from 'drizzle-orm'
import type { SchoolSettings } from '@/app/admin/(dashboard)/settings/settings-types'
import { maxPossiblePoints, yearStartForStudent } from '@/lib/points'
import { getSchoolDaysConfig } from '@/lib/school-holidays'
import { nonSchoolDayReason, shiftDate, weekdayOf } from '@/lib/school-days'
import { isValidDateString } from '@/lib/utils'

/**
 * What a family reads about one child: the week so far, and one day in full.
 *
 * Deliberately not in a 'use server' file: every export from one of those is a
 * public HTTP endpoint, and these readers are handed the parent's id rather
 * than working it out. The caller takes that id from the session; each reader
 * then checks for itself that the pupil is that parent's child, and answers
 * null for anybody else's.
 *
 * The school's settings are the one thing read through the caller's own
 * session (getSchoolSettings answers a member of the school, and a parent is
 * one through their child). Called for anybody else, the readers still work —
 * on the default settings.
 */

export type ChildWeek = {
  /** The most recent Sunday, or the first day of the school year when that is later. */
  from: string
  to: string
  /** Register days by status. All zero while the school keeps attendance switched off. */
  attendance: { present: number; late: number; absent: number; excused: number }
  /** What the register and the teachers' lessons earned — the figure `possible` is the ceiling of. */
  points: number
  /** The most the week could have earned — see maxPossiblePoints. */
  possible: number
  /** Points a teacher gave by hand. Outside `possible`, so never added to `points`. */
  bonus: number
  /** Lessons the child was assessed in; the empty row of an absent day is not one. */
  lessons: number
  homeworkMissing: number
  materialsMissing: number
  behaviorIssues: number
  /** Lessons a teacher left a written note on. */
  notes: number
}

export type ChildDay = {
  date: string
  studentName: string
  /** Null when nobody recorded the day. */
  attendanceStatus: string | null
  /** Why the day was not taught on, for the pupil's own stage; null on a school day. */
  closedReason: string | null
  lessons: {
    teacherName: string | null
    subjects: string[]
    behavior: string | null
    homeworkStatus: string | null
    materialsStatus: string | null
    participationStatus: string | null
    teacherNote: string | null
    pointsEarned: number
  }[]
  manualPoints: { points: number; reason: string; teacherName: string | null }[]
  /** Register + every teacher's lesson + awards given by hand, that day. */
  totalPoints: number
  features: SchoolSettings['features']
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The pupil, only when they are this parent's child.
 *
 * The id is whatever the address bar held, and the column is a uuid: Postgres
 * throws on anything else rather than finding nothing, so the shape is checked
 * before the question is asked.
 */
async function childOf(studentId: string, parentUserId: string) {
  if (!parentUserId || typeof studentId !== 'string' || !UUID.test(studentId)) return null
  const [pupil] = await db
    .select({
      id: students.id,
      fullName: students.fullName,
      schoolId: students.schoolId,
      gradeLevelId: classes.gradeLevelId,
    })
    .from(students)
    .leftJoin(classes, eq(classes.id, students.classId))
    .where(and(eq(students.id, studentId), eq(students.parentUserId, parentUserId)))
    .limit(1)
  return pupil ?? null
}

/**
 * This week at a glance, Sunday to today.
 *
 * The year's totals answer «how is the year going»; a parent opening the
 * portal on a Wednesday is asking about the last four days. Everything is
 * counted in the database — one row back per table, however long the week.
 */
export async function getChildWeek(studentId: string, parentUserId: string, today: string): Promise<ChildWeek | null> {
  if (!isValidDateString(today)) return null
  const pupil = await childOf(studentId, parentUserId)
  if (!pupil) return null

  // Sunday opens the school week. In the week the year begins, the week begins
  // with it: the days before belong to last year's figures, not this one's.
  const since = await yearStartForStudent(pupil.id)
  const sunday = shiftDate(today, -weekdayOf(today))
  const from = since && since > sunday ? since : sunday

  // The same rule the year's ceiling uses: an out-of-school day writes a row
  // with every mark null, and that row is not a lesson the child was in.
  const assessed = sql`(${lessonRecords.behavior} IS NOT NULL OR ${lessonRecords.homeworkStatus} IS NOT NULL OR ${lessonRecords.materialsStatus} IS NOT NULL OR ${lessonRecords.participationStatus} IS NOT NULL)`
  const tally = (cond: SQL) => sql<number>`COUNT(*) FILTER (WHERE ${cond})`.mapWith(Number)

  const [register, lessonAgg, manualAgg, settings] = await Promise.all([
    // Rows, not a count: a pupil moved to another class in the middle of a day
    // has two for it, and a day is one day — the later word stands, as on the
    // day page. A week is a handful of rows.
    db
      .select({ date: dailyRecords.date, status: dailyRecords.attendanceStatus, points: dailyRecords.pointsEarned })
      .from(dailyRecords)
      .where(and(eq(dailyRecords.studentId, pupil.id), gte(dailyRecords.date, from), lte(dailyRecords.date, today)))
      .orderBy(desc(dailyRecords.updatedAt)),
    db
      .select({
        points: sql<number>`COALESCE(SUM(${lessonRecords.pointsEarned}), 0)`.mapWith(Number),
        lessons: tally(assessed),
        homeworkMissing: tally(sql`${lessonRecords.homeworkStatus} = 'missing'`),
        materialsMissing: tally(sql`${lessonRecords.materialsStatus} = 'missing'`),
        behaviorIssues: tally(sql`${lessonRecords.behavior} = 'issue'`),
        notes: tally(sql`BTRIM(${lessonRecords.teacherNote}) <> ''`),
      })
      .from(lessonRecords)
      .where(and(eq(lessonRecords.studentId, pupil.id), gte(lessonRecords.date, from), lte(lessonRecords.date, today))),
    db
      .select({ v: sql<number>`COALESCE(SUM(${studentPoints.points}), 0)`.mapWith(Number) })
      .from(studentPoints)
      .where(and(eq(studentPoints.studentId, pupil.id), gte(studentPoints.date, from), lte(studentPoints.date, today))),
    import('@/app/admin/(dashboard)/settings/actions-settings').then((m) => m.getSchoolSettings(pupil.schoolId)),
  ])

  const attendance = { present: 0, late: 0, absent: 0, excused: 0 }
  let registerPoints = 0
  const counted = new Set<string>()
  for (const r of register) {
    registerPoints += r.points
    if (counted.has(r.date)) continue
    counted.add(r.date)
    if (r.status === 'present' || r.status === 'late' || r.status === 'absent' || r.status === 'excused') {
      attendance[r.status] += 1
    }
  }
  const lesson = lessonAgg[0]
  const lessons = lesson?.lessons ?? 0
  const f = settings.features

  return {
    from,
    to: today,
    // With attendance switched off the roster files every pupil as present,
    // and a week of «حاضر» nobody took would be reported to the family as fact.
    attendance: f.attendance !== false ? attendance : { present: 0, late: 0, absent: 0, excused: 0 },
    points: registerPoints + (lesson?.points ?? 0),
    bonus: manualAgg[0]?.v ?? 0,
    possible: maxPossiblePoints(
      settings,
      attendance.present + attendance.late + attendance.absent + attendance.excused,
      lessons,
    ),
    lessons,
    // A mark left over from before a feature was switched off is not news.
    homeworkMissing: f.homework !== false ? lesson?.homeworkMissing ?? 0 : 0,
    materialsMissing: f.materials !== false ? lesson?.materialsMissing ?? 0 : 0,
    behaviorIssues: f.behavior !== false ? lesson?.behaviorIssues ?? 0 : 0,
    notes: lesson?.notes ?? 0,
  }
}

/**
 * One day as every teacher recorded it.
 *
 * No year boundary here, unlike the totals: a parent can open an old day from
 * a notice sent months ago, and the day is still what it was.
 */
export async function getChildDay(studentId: string, parentUserId: string, date: string): Promise<ChildDay | null> {
  if (!isValidDateString(date)) return null
  const pupil = await childOf(studentId, parentUserId)
  if (!pupil) return null

  const [register, lessonRows, manualRows, schoolDays, settings] = await Promise.all([
    db
      .select({ status: dailyRecords.attendanceStatus, points: dailyRecords.pointsEarned })
      .from(dailyRecords)
      .where(and(eq(dailyRecords.studentId, pupil.id), eq(dailyRecords.date, date)))
      // One row a day — unless the pupil changed class in the middle of it,
      // and then the later word is the one that stands.
      .orderBy(desc(dailyRecords.updatedAt)),
    // The name and nothing else: the teacher's row also holds their phone
    // number, and whatever is returned from here is sent to the family.
    db
      .select({
        teacherUserId: lessonRecords.teacherUserId,
        classId: lessonRecords.classId,
        subjectId: lessonRecords.subjectId,
        behavior: lessonRecords.behavior,
        homeworkStatus: lessonRecords.homeworkStatus,
        materialsStatus: lessonRecords.materialsStatus,
        participationStatus: lessonRecords.participationStatus,
        teacherNote: lessonRecords.teacherNote,
        pointsEarned: lessonRecords.pointsEarned,
        teacherName: teachers.fullName,
      })
      .from(lessonRecords)
      .leftJoin(teachers, eq(teachers.userId, lessonRecords.teacherUserId))
      .where(and(eq(lessonRecords.studentId, pupil.id), eq(lessonRecords.date, date)))
      .orderBy(asc(lessonRecords.createdAt)),
    db
      .select({ points: studentPoints.points, reason: studentPoints.reason, teacherName: teachers.fullName })
      .from(studentPoints)
      .leftJoin(teachers, eq(teachers.userId, studentPoints.teacherUserId))
      .where(and(eq(studentPoints.studentId, pupil.id), eq(studentPoints.date, date)))
      .orderBy(asc(studentPoints.createdAt)),
    // The calendar of the child's own stage; with no class there is no stage
    // to ask, and the whole school's calendar answers.
    getSchoolDaysConfig(pupil.schoolId, pupil.gradeLevelId),
    import('@/app/admin/(dashboard)/settings/actions-settings').then((m) => m.getSchoolSettings(pupil.schoolId)),
  ])

  const classIds = [...new Set(lessonRows.map((l) => l.classId))]
  const teacherIds = [...new Set(lessonRows.map((l) => l.teacherUserId))]
  const filedIds = [...new Set(lessonRows.map((l) => l.subjectId).filter((v): v is string => !!v))]
  const subjectRows = lessonRows.length === 0
    ? []
    : await db
        .select({
          id: subjects.id,
          name: subjects.name,
          classId: subjects.classId,
          teacherUserId: subjects.teacherUserId,
        })
        .from(subjects)
        .where(and(
          eq(subjects.schoolId, pupil.schoolId),
          or(
            and(inArray(subjects.classId, classIds), inArray(subjects.teacherUserId, teacherIds)),
            filedIds.length > 0 ? inArray(subjects.id, filedIds) : undefined,
          ),
        ))
        .orderBy(asc(subjects.name))

  /**
   * A teacher fills one roster per visit, whatever they teach the class, and
   * the row is filed under the first subject they hold there — so that subject
   * alone would drop the second one of a teacher who has two. It speaks alone
   * only when the teacher no longer holds it: the day was recorded before the
   * subject changed hands, and what they teach now is not what they taught then.
   */
  const subjectsOf = (l: { classId: string; teacherUserId: string; subjectId: string | null }) => {
    const held = subjectRows.filter((s) => s.classId === l.classId && s.teacherUserId === l.teacherUserId)
    const filed = l.subjectId ? subjectRows.find((s) => s.id === l.subjectId) : undefined
    return filed && !held.includes(filed) ? [filed.name] : held.map((s) => s.name)
  }

  return {
    date,
    studentName: pupil.fullName,
    attendanceStatus: register[0]?.status ?? null,
    closedReason: nonSchoolDayReason(date, schoolDays),
    lessons: lessonRows.map((l) => ({
      teacherName: l.teacherName,
      subjects: subjectsOf(l),
      behavior: l.behavior,
      homeworkStatus: l.homeworkStatus,
      materialsStatus: l.materialsStatus,
      participationStatus: l.participationStatus,
      teacherNote: l.teacherNote?.trim() || null,
      pointsEarned: l.pointsEarned,
    })),
    manualPoints: manualRows,
    totalPoints:
      register.reduce((sum, r) => sum + r.points, 0) +
      lessonRows.reduce((sum, l) => sum + l.pointsEarned, 0) +
      manualRows.reduce((sum, m) => sum + m.points, 0),
    features: settings.features,
  }
}
