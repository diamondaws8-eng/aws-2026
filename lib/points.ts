import { cache } from 'react'
import { db } from '@/lib/db'
import { dailyRecords, lessonRecords, studentPoints, students, classes, gradeLevels, schools } from '@/lib/db/schema'
import { eq, and, gte, inArray, sql, type SQL } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import type { SchoolSettings } from '@/app/admin/(dashboard)/settings/settings-types'
import { schoolDate } from '@/lib/utils'
import type { LeaderboardPeriod, PeriodStat } from '@/lib/ranking'

// ─── The academic year boundary ───────────────────────────────────────────────
/**
 * Every total below counts from the first day of the school's current year.
 *
 * Without it a pupil's score is their entire history. That is the right answer
 * in a school's first year and the wrong one ever after: the child who did well
 * last year would top this year's board on last year's marks, and a parent
 * would be shown a "total" that quietly spans two years with no way to tell.
 *
 * The boundary is resolved here rather than passed in by each caller. There are
 * nine call sites across four portals, and a rule applied in one place cannot
 * be forgotten at the tenth.
 *
 * Null — a school that has not set a start date — means count everything, which
 * is exactly today's behaviour. So nothing changes until the date is set.
 */
const yearStartForSchool = cache(async (schoolId: string): Promise<string | null> => {
  const [row] = await db
    .select({ d: schools.yearStartDate })
    .from(schools)
    .where(eq(schools.id, schoolId))
    .limit(1)
  return row?.d ?? null
})

/** Exported for the parent portal, which counts attendance for the same year the points cover. */
export const yearStartForStudent = cache(async (studentId: string): Promise<string | null> => {
  const [row] = await db
    .select({ schoolId: students.schoolId })
    .from(students)
    .where(eq(students.id, studentId))
    .limit(1)
  return row ? yearStartForSchool(row.schoolId) : null
})

const yearStartForClass = cache(async (classId: string): Promise<string | null> => {
  const [row] = await db
    .select({ schoolId: classes.schoolId })
    .from(classes)
    .where(eq(classes.id, classId))
    .limit(1)
  return row ? yearStartForSchool(row.schoolId) : null
})

/**
 * Points are DERIVED, not duplicated.
 *
 * A day's record already stores every status (attendance, behavior, homework,
 * materials, participation) plus the resulting `pointsEarned`. Writing a
 * separate row per category as well would store the same fact twice and cost
 * ~5 extra rows per student per day — about 100 MB a year for one school.
 *
 * So: totals come from `daily_records.pointsEarned`, the per-category breakdown
 * is recomputed here on demand, and `student_points` now holds only the manual
 * awards a teacher gives by hand, which cannot be derived from anything.
 */

export type PointType = 'attendance' | 'behavior' | 'homework' | 'materials' | 'participation'

export type PointEntry = {
  type: PointType | 'manual'
  points: number
  reason: string
  date: string
}

/** The statuses a daily record holds — matches the columns on `daily_records`. */
export type DailyStatuses = {
  date: string
  attendanceStatus?: string | null
  behavior?: string | null
  homeworkStatus?: string | null
  materialsStatus?: string | null
  participationStatus?: string | null
}

/**
 * Turns one day's statuses into its point entries.
 * This is the single source of truth — saving and displaying both use it, so
 * the breakdown a parent sees can never drift from what was actually awarded.
 */
export function derivePointEntries(rec: DailyStatuses, settings: SchoolSettings): PointEntry[] {
  return [...deriveAttendanceEntries(rec, settings), ...deriveLessonEntries(rec, settings)]
}

/**
 * The attendance half — scored ONCE a day, however many teachers saw the pupil.
 * Being in school is one fact about the day, not one per lesson.
 */
export function deriveAttendanceEntries(rec: DailyStatuses, settings: SchoolSettings): PointEntry[] {
  const f = settings.features
  const p = settings.points
  const out: PointEntry[] = []
  const add = (type: PointType, points: number, reason: string) => {
    if (points !== 0) out.push({ type, points, reason, date: rec.date })
  }

  if (f.attendance !== false) {
    if (rec.attendanceStatus === 'present') add('attendance', p.attendance_present ?? 1, 'حضور اليوم')
    else if (rec.attendanceStatus === 'late') add('attendance', p.attendance_late ?? 0, 'تأخر')
    else if (rec.attendanceStatus === 'absent') add('attendance', p.attendance_absent ?? -1, 'غياب بدون عذر')
  }

  return out
}

/**
 * The per-lesson half — scored once per teacher. Doing the homework for six
 * subjects earns six times what doing it for one earns, which is the point.
 */
export function deriveLessonEntries(rec: DailyStatuses, settings: SchoolSettings): PointEntry[] {
  const f = settings.features
  const p = settings.points
  const out: PointEntry[] = []
  const add = (type: PointType, points: number, reason: string) => {
    // A zero-point outcome isn't worth listing.
    if (points !== 0) out.push({ type, points, reason, date: rec.date })
  }

  if (f.behavior !== false && rec.behavior) {
    if (rec.behavior === 'excellent') add('behavior', p.behavior_excellent ?? 2, 'سلوك ممتاز')
    else if (rec.behavior === 'good') add('behavior', p.behavior_good ?? 1, 'سلوك جيد')
    else if (rec.behavior === 'issue') add('behavior', p.behavior_bad ?? -2, 'ملاحظة سلوكية')
  }

  if (f.homework !== false && rec.homeworkStatus) {
    if (rec.homeworkStatus === 'done') add('homework', p.homework_done ?? 1, 'إنجاز الواجب')
    else if (rec.homeworkStatus === 'missing') add('homework', p.homework_notdone ?? -1, 'لم ينجز الواجب')
  }

  if (f.materials !== false && rec.materialsStatus) {
    if (rec.materialsStatus === 'brought') add('materials', p.materials_brought ?? 1, 'إحضار الأدوات')
    else if (rec.materialsStatus === 'missing') add('materials', p.materials_missing ?? -1, 'لم يحضر الأدوات')
  }

  if (f.participation !== false && rec.participationStatus) {
    if (rec.participationStatus === 'active') add('participation', p.participation_active ?? 2, 'مشاركة متفاعلة')
    else if (rec.participationStatus === 'inactive') add('participation', p.participation_inactive ?? 0, 'غير مشارك')
  }

  return out
}

/**
 * The most a pupil could have earned over `days` register days and `lessons`
 * teacher records — the denominator for any "how well is my child doing"
 * figure. A raw average per day is not one: lesson points arrive once per
 * teacher, so a class with six teachers reads twice as good as a class with
 * three for the same pupil.
 */
export function maxPossiblePoints(settings: SchoolSettings, days: number, lessons: number): number {
  const f = settings.features
  const p = settings.points
  const best = (...vals: (number | undefined)[]) => Math.max(0, ...vals.map((v) => v ?? 0))
  const perDay = f.attendance !== false ? best(p.attendance_present, p.attendance_late) : 0
  const perLesson =
    (f.behavior !== false ? best(p.behavior_excellent, p.behavior_good) : 0) +
    (f.homework !== false ? best(p.homework_done) : 0) +
    (f.materials !== false ? best(p.materials_brought) : 0) +
    (f.participation !== false ? best(p.participation_active, p.participation_inactive) : 0)
  return days * perDay + lessons * perLesson
}

/** Total points a day's record is worth — what gets stored in `pointsEarned`. */
export function totalPointsFor(rec: DailyStatuses, settings: SchoolSettings): number {
  return derivePointEntries(rec, settings).reduce((sum, e) => sum + e.points, 0)
}

/** What `daily_records.pointsEarned` holds: the attendance half only. */
export function attendancePointsFor(rec: DailyStatuses, settings: SchoolSettings): number {
  return deriveAttendanceEntries(rec, settings).reduce((sum, e) => sum + e.points, 0)
}

/** What `lesson_records.pointsEarned` holds: one teacher's half. */
export function lessonPointsFor(rec: DailyStatuses, settings: SchoolSettings): number {
  return deriveLessonEntries(rec, settings).reduce((sum, e) => sum + e.points, 0)
}

// ─── Keeping the stored total honest ─────────────────────────────────────────

/**
 * `daily_records.pointsEarned` is a cached copy of what `derivePointEntries`
 * would produce, so totals can be a plain SQL SUM instead of loading every
 * record. That cache goes stale the moment the school edits its point values —
 * the parent would see a breakdown that no longer adds up to the total.
 *
 * So we recompute it in the database itself: one UPDATE, no rows fetched, and
 * `IS DISTINCT FROM` skips records whose value didn't change, which keeps
 * Postgres from writing a new version of every row on every settings save.
 * The cost is the same whether the school has 300 students or 30,000.
 */
export async function resyncSchoolPoints(schoolId: string, settings: SchoolSettings): Promise<number> {
  const f = settings.features
  const p = settings.points

  // The register carries the attendance half…
  const attendanceExpr =
    f.attendance !== false
      ? sql`CASE ${dailyRecords.attendanceStatus}
          WHEN 'present' THEN ${p.attendance_present ?? 1}::int
          WHEN 'late'    THEN ${p.attendance_late ?? 0}::int
          WHEN 'absent'  THEN ${p.attendance_absent ?? -1}::int
          ELSE 0 END`
      : sql`0`

  // …and each teacher's row carries their own.
  const lessonTerms: SQL[] = []
  if (f.behavior !== false) {
    lessonTerms.push(sql`CASE ${lessonRecords.behavior}
      WHEN 'excellent' THEN ${p.behavior_excellent ?? 2}::int
      WHEN 'good'      THEN ${p.behavior_good ?? 1}::int
      WHEN 'issue'     THEN ${p.behavior_bad ?? -2}::int
      ELSE 0 END`)
  }
  if (f.homework !== false) {
    lessonTerms.push(sql`CASE ${lessonRecords.homeworkStatus}
      WHEN 'done'    THEN ${p.homework_done ?? 1}::int
      WHEN 'missing' THEN ${p.homework_notdone ?? -1}::int
      ELSE 0 END`)
  }
  if (f.materials !== false) {
    lessonTerms.push(sql`CASE ${lessonRecords.materialsStatus}
      WHEN 'brought' THEN ${p.materials_brought ?? 1}::int
      WHEN 'missing' THEN ${p.materials_missing ?? -1}::int
      ELSE 0 END`)
  }
  if (f.participation !== false) {
    lessonTerms.push(sql`CASE ${lessonRecords.participationStatus}
      WHEN 'active'   THEN ${p.participation_active ?? 2}::int
      WHEN 'inactive' THEN ${p.participation_inactive ?? 0}::int
      ELSE 0 END`)
  }
  const lessonExpr = lessonTerms.length ? sql.join(lessonTerms, sql` + `) : sql`0`

  const [attendanceRes, lessonRes] = await Promise.all([
    db.update(dailyRecords)
      .set({ pointsEarned: attendanceExpr })
      .where(and(
        eq(dailyRecords.schoolId, schoolId),
        sql`${dailyRecords.pointsEarned} IS DISTINCT FROM (${attendanceExpr})`,
      )),
    db.update(lessonRecords)
      .set({ pointsEarned: lessonExpr })
      .where(and(
        eq(lessonRecords.schoolId, schoolId),
        sql`${lessonRecords.pointsEarned} IS DISTINCT FROM (${lessonExpr})`,
      )),
  ])

  const rows = (r: unknown) => (r as { rowCount?: number }).rowCount ?? 0
  return rows(attendanceRes) + rows(lessonRes)
}

// ─── Totals ───────────────────────────────────────────────────────────────────
// Daily points live on daily_records; manual awards live on student_points.

/** One student's lifetime total. */
export async function getStudentPointsTotal(studentId: string): Promise<number> {
  const since = await yearStartForStudent(studentId)

  const [attendance, lessons, manual] = await Promise.all([
    db.select({ v: sql<number>`COALESCE(SUM(${dailyRecords.pointsEarned}), 0)`.mapWith(Number) })
      .from(dailyRecords).where(and(
        eq(dailyRecords.studentId, studentId),
        since ? gte(dailyRecords.date, since) : undefined,
      )),
    db.select({ v: sql<number>`COALESCE(SUM(${lessonRecords.pointsEarned}), 0)`.mapWith(Number) })
      .from(lessonRecords).where(and(
        eq(lessonRecords.studentId, studentId),
        since ? gte(lessonRecords.date, since) : undefined,
      )),
    db.select({ v: sql<number>`COALESCE(SUM(${studentPoints.points}), 0)`.mapWith(Number) })
      .from(studentPoints).where(and(
        eq(studentPoints.studentId, studentId),
        since ? gte(studentPoints.date, since) : undefined,
      )),
  ])
  return (attendance[0]?.v ?? 0) + (lessons[0]?.v ?? 0) + (manual[0]?.v ?? 0)
}

/** One student's total from a single teacher in a single class. */
export async function getStudentTeacherPointsTotal(
  studentId: string,
  classId: string,
  teacherUserId: string,
): Promise<number> {
  // Attendance is nobody's in particular — it belongs to the day, so a single
  // teacher's total is their own lesson score plus what they awarded by hand.
  const since = await yearStartForClass(classId)

  const [daily, manual] = await Promise.all([
    db.select({ v: sql<number>`COALESCE(SUM(${lessonRecords.pointsEarned}), 0)`.mapWith(Number) })
      .from(lessonRecords)
      .where(and(
        eq(lessonRecords.studentId, studentId),
        eq(lessonRecords.classId, classId),
        eq(lessonRecords.teacherUserId, teacherUserId),
        since ? gte(lessonRecords.date, since) : undefined,
      )),
    db.select({ v: sql<number>`COALESCE(SUM(${studentPoints.points}), 0)`.mapWith(Number) })
      .from(studentPoints)
      .where(and(
        eq(studentPoints.studentId, studentId),
        eq(studentPoints.classId, classId),
        eq(studentPoints.teacherUserId, teacherUserId),
        since ? gte(studentPoints.date, since) : undefined,
      )),
  ])
  return (daily[0]?.v ?? 0) + (manual[0]?.v ?? 0)
}

/** Totals for every student in a class, keyed by student id. */
export async function getClassPointsTotals(classId: string): Promise<Record<string, number>> {
  const since = await yearStartForClass(classId)

  const [attendance, lessons, manual] = await Promise.all([
    db.select({
        studentId: dailyRecords.studentId,
        v: sql<number>`COALESCE(SUM(${dailyRecords.pointsEarned}), 0)`.mapWith(Number),
      })
      .from(dailyRecords)
      .where(and(eq(dailyRecords.classId, classId), since ? gte(dailyRecords.date, since) : undefined))
      .groupBy(dailyRecords.studentId),
    db.select({
        studentId: lessonRecords.studentId,
        v: sql<number>`COALESCE(SUM(${lessonRecords.pointsEarned}), 0)`.mapWith(Number),
      })
      .from(lessonRecords)
      .where(and(eq(lessonRecords.classId, classId), since ? gte(lessonRecords.date, since) : undefined))
      .groupBy(lessonRecords.studentId),
    db.select({
        studentId: studentPoints.studentId,
        v: sql<number>`COALESCE(SUM(${studentPoints.points}), 0)`.mapWith(Number),
      })
      .from(studentPoints)
      .where(and(eq(studentPoints.classId, classId), since ? gte(studentPoints.date, since) : undefined))
      .groupBy(studentPoints.studentId),
  ])

  const totals: Record<string, number> = {}
  for (const row of [...attendance, ...lessons, ...manual]) {
    totals[row.studentId] = (totals[row.studentId] ?? 0) + row.v
  }
  return totals
}

export type { LeaderboardPeriod, PeriodStat }

export type LeaderboardRow = {
  id: string
  name: string
  classId: string | null
  className: string | null
  /** The stage the class belongs to. Two buildings can both have a «1\1». */
  gradeName: string | null
  /** Points since the year started — the plain total every board used before. */
  totalPoints: number
  periods: Record<LeaderboardPeriod, PeriodStat>
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return schoolDate(d)
}

/**
 * School leaderboard, optionally limited to certain classes (for scoped roles).
 *
 * Every active pupil is returned, highest year total first — including those
 * on zero or below, so a board can say how many it is not showing instead of
 * dropping them silently. Three windows come back from one pass (conditional
 * sums), and each carries the points that were possible in it, because raw
 * points only compare fairly inside one class: across classes a pupil with six
 * teachers recording has six chances a day where another has one.
 */
export async function getLeaderboard(schoolId: string, classIds?: string[] | null): Promise<LeaderboardRow[]> {
  const classFilter = classIds ? (classIds.length ? inArray(students.classId, classIds) : sql`false`) : undefined
  const since = await yearStartForSchool(schoolId)

  // Windows never reach back past the year boundary.
  const clamp = (from: string) => (since && since > from ? since : from)
  const monthFrom = clamp(daysAgo(29))
  const weekFrom = clamp(daysAgo(6))

  const yearFilter = (col: AnyPgColumn) => (since ? sql`FILTER (WHERE ${col} >= ${since})` : sql``)
  const sums = (col: SQL, dateCol: AnyPgColumn) => ({
    year: sql<number>`COALESCE(SUM(${col}) ${yearFilter(dateCol)}, 0)`.mapWith(Number),
    month: sql<number>`COALESCE(SUM(${col}) FILTER (WHERE ${dateCol} >= ${monthFrom}), 0)`.mapWith(Number),
    week: sql<number>`COALESCE(SUM(${col}) FILTER (WHERE ${dateCol} >= ${weekFrom}), 0)`.mapWith(Number),
  })
  const counts = (dateCol: AnyPgColumn) => ({
    nYear: sql<number>`COUNT(*) ${yearFilter(dateCol)}`.mapWith(Number),
    nMonth: sql<number>`COUNT(*) FILTER (WHERE ${dateCol} >= ${monthFrom})`.mapWith(Number),
    nWeek: sql<number>`COUNT(*) FILTER (WHERE ${dateCol} >= ${weekFrom})`.mapWith(Number),
  })

  const [roster, attendance, lessons, manual, settings] = await Promise.all([
    db.select({
        id: students.id,
        name: students.fullName,
        classId: students.classId,
        className: classes.name,
        gradeName: gradeLevels.name,
      })
      .from(students)
      .leftJoin(classes, eq(students.classId, classes.id))
      .leftJoin(gradeLevels, eq(classes.gradeLevelId, gradeLevels.id))
      // A pupil who has left does not compete on this year's board.
      .where(and(eq(students.schoolId, schoolId), eq(students.status, 'active'), classFilter)),

    db.select({
        studentId: dailyRecords.studentId,
        ...sums(sql`${dailyRecords.pointsEarned}`, dailyRecords.date),
        ...counts(dailyRecords.date),
      })
      .from(dailyRecords)
      .where(eq(dailyRecords.schoolId, schoolId))
      .groupBy(dailyRecords.studentId),

    db.select({
        studentId: lessonRecords.studentId,
        ...sums(sql`${lessonRecords.pointsEarned}`, lessonRecords.date),
        ...counts(lessonRecords.date),
      })
      .from(lessonRecords)
      .where(eq(lessonRecords.schoolId, schoolId))
      .groupBy(lessonRecords.studentId),

    db.select({
        studentId: studentPoints.studentId,
        ...sums(sql`${studentPoints.points}`, studentPoints.date),
      })
      .from(studentPoints)
      .where(eq(studentPoints.schoolId, schoolId))
      .groupBy(studentPoints.studentId),

    // Loaded lazily: the settings module imports this file for resyncSchoolPoints.
    import('@/app/admin/(dashboard)/settings/actions-settings').then((m) => m.getSchoolSettings(schoolId)),
  ])

  type Acc = { points: number; days: number; lessons: number }
  const blank = (): Record<LeaderboardPeriod, Acc> => ({
    year: { points: 0, days: 0, lessons: 0 },
    month: { points: 0, days: 0, lessons: 0 },
    week: { points: 0, days: 0, lessons: 0 },
  })
  const acc = new Map<string, Record<LeaderboardPeriod, Acc>>()
  const bucket = (id: string) => {
    let a = acc.get(id)
    if (!a) { a = blank(); acc.set(id, a) }
    return a
  }
  for (const r of attendance) {
    const a = bucket(r.studentId)
    a.year.points += r.year; a.month.points += r.month; a.week.points += r.week
    a.year.days += r.nYear; a.month.days += r.nMonth; a.week.days += r.nWeek
  }
  for (const r of lessons) {
    const a = bucket(r.studentId)
    a.year.points += r.year; a.month.points += r.month; a.week.points += r.week
    a.year.lessons += r.nYear; a.month.lessons += r.nMonth; a.week.lessons += r.nWeek
  }
  for (const r of manual) {
    const a = bucket(r.studentId)
    a.year.points += r.year; a.month.points += r.month; a.week.points += r.week
  }

  const stat = (a: Acc): PeriodStat => {
    const possible = maxPossiblePoints(settings, a.days, a.lessons)
    return {
      points: a.points,
      possible,
      pct: possible > 0 ? Math.round((a.points / possible) * 100) : null,
      days: a.days,
      lessons: a.lessons,
    }
  }

  return roster
    .map((s) => {
      const a = acc.get(s.id) ?? blank()
      const periods = { year: stat(a.year), month: stat(a.month), week: stat(a.week) }
      return { ...s, totalPoints: periods.year.points, periods }
    })
    .sort((a, b) => b.totalPoints - a.totalPoints)
}

// ─── History ──────────────────────────────────────────────────────────────────

/**
 * Manual awards only — for callers that already hold the daily records and can
 * derive the rest themselves with `derivePointEntries`.
 */
export async function getManualPoints(
  studentId: string,
  opts?: { teacherUserId?: string },
): Promise<PointEntry[]> {
  const since = await yearStartForStudent(studentId)
  const filters = [eq(studentPoints.studentId, studentId)]
  if (opts?.teacherUserId) filters.push(eq(studentPoints.teacherUserId, opts.teacherUserId))
  if (since) filters.push(gte(studentPoints.date, since))

  const rows = await db
    .select({ date: studentPoints.date, points: studentPoints.points, reason: studentPoints.reason })
    .from(studentPoints)
    .where(and(...filters))

  return rows.map((r) => ({ type: 'manual' as const, points: r.points, reason: r.reason, date: r.date }))
}

/**
 * A student's point history: each day's breakdown rebuilt from its record,
 * plus any manual awards, newest first.
 */
export async function getStudentPointsHistory(
  studentId: string,
  settings: SchoolSettings,
  opts?: { teacherUserId?: string; limit?: number },
): Promise<PointEntry[]> {
  const limit = opts?.limit ?? 100

  const since = await yearStartForStudent(studentId)
  const dailyFilters = [eq(dailyRecords.studentId, studentId)]
  const lessonFilters = [eq(lessonRecords.studentId, studentId)]
  const manualFilters = [eq(studentPoints.studentId, studentId)]
  if (since) {
    dailyFilters.push(gte(dailyRecords.date, since))
    lessonFilters.push(gte(lessonRecords.date, since))
    manualFilters.push(gte(studentPoints.date, since))
  }
  if (opts?.teacherUserId) {
    // Attendance has no owner, so narrowing to one teacher means their lessons.
    lessonFilters.push(eq(lessonRecords.teacherUserId, opts.teacherUserId))
    manualFilters.push(eq(studentPoints.teacherUserId, opts.teacherUserId))
  }

  const [days, lessons, manual] = await Promise.all([
    opts?.teacherUserId
      ? Promise.resolve([])
      : db.select({
          date: dailyRecords.date,
          attendanceStatus: dailyRecords.attendanceStatus,
        })
        .from(dailyRecords).where(and(...dailyFilters)),
    db.select({
        date: lessonRecords.date,
        behavior: lessonRecords.behavior,
        homeworkStatus: lessonRecords.homeworkStatus,
        materialsStatus: lessonRecords.materialsStatus,
        participationStatus: lessonRecords.participationStatus,
      })
      .from(lessonRecords).where(and(...lessonFilters)),
    db.select({ date: studentPoints.date, points: studentPoints.points, reason: studentPoints.reason })
      .from(studentPoints).where(and(...manualFilters)),
  ])

  const entries: PointEntry[] = [
    ...days.flatMap((d) => deriveAttendanceEntries(d, settings)),
    ...lessons.flatMap((l) => deriveLessonEntries(l, settings)),
  ]
  for (const m of manual) {
    entries.push({ type: 'manual', points: m.points, reason: m.reason, date: m.date })
  }

  return entries.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit)
}
