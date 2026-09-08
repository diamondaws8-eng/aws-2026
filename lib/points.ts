import { db } from '@/lib/db'
import { dailyRecords, studentPoints, students, classes } from '@/lib/db/schema'
import { eq, and, inArray, sql, type SQL } from 'drizzle-orm'
import type { SchoolSettings } from '@/app/admin/(dashboard)/settings/settings-types'

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
  const f = settings.features
  const p = settings.points
  const out: PointEntry[] = []
  const add = (type: PointType, points: number, reason: string) => {
    // A zero-point outcome isn't worth listing.
    if (points !== 0) out.push({ type, points, reason, date: rec.date })
  }

  if (f.attendance !== false) {
    if (rec.attendanceStatus === 'present') add('attendance', p.attendance_present ?? 1, 'حضور الحصة')
    else if (rec.attendanceStatus === 'late') add('attendance', p.attendance_late ?? 0, 'تأخر')
    else if (rec.attendanceStatus === 'absent') add('attendance', p.attendance_absent ?? -1, 'غياب بدون عذر')
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

/** Total points a day's record is worth — what gets stored in `pointsEarned`. */
export function totalPointsFor(rec: DailyStatuses, settings: SchoolSettings): number {
  return derivePointEntries(rec, settings).reduce((sum, e) => sum + e.points, 0)
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
  const terms: SQL[] = []

  if (f.attendance !== false) {
    terms.push(sql`CASE ${dailyRecords.attendanceStatus}
      WHEN 'present' THEN ${p.attendance_present ?? 1}::int
      WHEN 'late'    THEN ${p.attendance_late ?? 0}::int
      WHEN 'absent'  THEN ${p.attendance_absent ?? -1}::int
      ELSE 0 END`)
  }
  if (f.behavior !== false) {
    terms.push(sql`CASE ${dailyRecords.behavior}
      WHEN 'excellent' THEN ${p.behavior_excellent ?? 2}::int
      WHEN 'good'      THEN ${p.behavior_good ?? 1}::int
      WHEN 'issue'     THEN ${p.behavior_bad ?? -2}::int
      ELSE 0 END`)
  }
  if (f.homework !== false) {
    terms.push(sql`CASE ${dailyRecords.homeworkStatus}
      WHEN 'done'    THEN ${p.homework_done ?? 1}::int
      WHEN 'missing' THEN ${p.homework_notdone ?? -1}::int
      ELSE 0 END`)
  }
  if (f.materials !== false) {
    terms.push(sql`CASE ${dailyRecords.materialsStatus}
      WHEN 'brought' THEN ${p.materials_brought ?? 1}::int
      WHEN 'missing' THEN ${p.materials_missing ?? -1}::int
      ELSE 0 END`)
  }
  if (f.participation !== false) {
    terms.push(sql`CASE ${dailyRecords.participationStatus}
      WHEN 'active'   THEN ${p.participation_active ?? 2}::int
      WHEN 'inactive' THEN ${p.participation_inactive ?? 0}::int
      ELSE 0 END`)
  }

  const expr = terms.length ? sql.join(terms, sql` + `) : sql`0`

  const res = await db
    .update(dailyRecords)
    .set({ pointsEarned: expr })
    .where(and(
      eq(dailyRecords.schoolId, schoolId),
      sql`${dailyRecords.pointsEarned} IS DISTINCT FROM (${expr})`,
    ))

  return (res as unknown as { rowCount?: number }).rowCount ?? 0
}

// ─── Totals ───────────────────────────────────────────────────────────────────
// Daily points live on daily_records; manual awards live on student_points.

/** One student's lifetime total. */
export async function getStudentPointsTotal(studentId: string): Promise<number> {
  const [daily, manual] = await Promise.all([
    db.select({ v: sql<number>`COALESCE(SUM(${dailyRecords.pointsEarned}), 0)`.mapWith(Number) })
      .from(dailyRecords).where(eq(dailyRecords.studentId, studentId)),
    db.select({ v: sql<number>`COALESCE(SUM(${studentPoints.points}), 0)`.mapWith(Number) })
      .from(studentPoints).where(eq(studentPoints.studentId, studentId)),
  ])
  return (daily[0]?.v ?? 0) + (manual[0]?.v ?? 0)
}

/** One student's total from a single teacher in a single class. */
export async function getStudentTeacherPointsTotal(
  studentId: string,
  classId: string,
  teacherUserId: string,
): Promise<number> {
  const [daily, manual] = await Promise.all([
    db.select({ v: sql<number>`COALESCE(SUM(${dailyRecords.pointsEarned}), 0)`.mapWith(Number) })
      .from(dailyRecords)
      .where(and(
        eq(dailyRecords.studentId, studentId),
        eq(dailyRecords.classId, classId),
        eq(dailyRecords.teacherUserId, teacherUserId),
      )),
    db.select({ v: sql<number>`COALESCE(SUM(${studentPoints.points}), 0)`.mapWith(Number) })
      .from(studentPoints)
      .where(and(
        eq(studentPoints.studentId, studentId),
        eq(studentPoints.classId, classId),
        eq(studentPoints.teacherUserId, teacherUserId),
      )),
  ])
  return (daily[0]?.v ?? 0) + (manual[0]?.v ?? 0)
}

/** Totals for every student in a class, keyed by student id. */
export async function getClassPointsTotals(classId: string): Promise<Record<string, number>> {
  const [daily, manual] = await Promise.all([
    db.select({
        studentId: dailyRecords.studentId,
        v: sql<number>`COALESCE(SUM(${dailyRecords.pointsEarned}), 0)`.mapWith(Number),
      })
      .from(dailyRecords).where(eq(dailyRecords.classId, classId)).groupBy(dailyRecords.studentId),
    db.select({
        studentId: studentPoints.studentId,
        v: sql<number>`COALESCE(SUM(${studentPoints.points}), 0)`.mapWith(Number),
      })
      .from(studentPoints).where(eq(studentPoints.classId, classId)).groupBy(studentPoints.studentId),
  ])

  const totals: Record<string, number> = {}
  for (const row of daily) totals[row.studentId] = (totals[row.studentId] ?? 0) + row.v
  for (const row of manual) totals[row.studentId] = (totals[row.studentId] ?? 0) + row.v
  return totals
}

export type LeaderboardRow = {
  id: string
  name: string
  classId: string | null
  className: string | null
  totalPoints: number
}

/**
 * School leaderboard, optionally limited to certain classes (for scoped roles).
 * Only students with a positive score appear, highest first.
 */
export async function getLeaderboard(schoolId: string, classIds?: string[] | null): Promise<LeaderboardRow[]> {
  const classFilter = classIds ? (classIds.length ? inArray(students.classId, classIds) : sql`false`) : undefined

  const [roster, daily, manual] = await Promise.all([
    db.select({
        id: students.id,
        name: students.fullName,
        classId: students.classId,
        className: classes.name,
      })
      .from(students)
      .leftJoin(classes, eq(students.classId, classes.id))
      .where(and(eq(students.schoolId, schoolId), classFilter)),

    db.select({
        studentId: dailyRecords.studentId,
        v: sql<number>`COALESCE(SUM(${dailyRecords.pointsEarned}), 0)`.mapWith(Number),
      })
      .from(dailyRecords).where(eq(dailyRecords.schoolId, schoolId)).groupBy(dailyRecords.studentId),

    db.select({
        studentId: studentPoints.studentId,
        v: sql<number>`COALESCE(SUM(${studentPoints.points}), 0)`.mapWith(Number),
      })
      .from(studentPoints).where(eq(studentPoints.schoolId, schoolId)).groupBy(studentPoints.studentId),
  ])

  const totals: Record<string, number> = {}
  for (const row of daily) totals[row.studentId] = (totals[row.studentId] ?? 0) + row.v
  for (const row of manual) totals[row.studentId] = (totals[row.studentId] ?? 0) + row.v

  return roster
    .map((s) => ({ ...s, totalPoints: totals[s.id] ?? 0 }))
    .filter((s) => s.totalPoints > 0)
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
  const filters = [eq(studentPoints.studentId, studentId)]
  if (opts?.teacherUserId) filters.push(eq(studentPoints.teacherUserId, opts.teacherUserId))

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

  const dailyFilters = [eq(dailyRecords.studentId, studentId)]
  const manualFilters = [eq(studentPoints.studentId, studentId)]
  if (opts?.teacherUserId) {
    dailyFilters.push(eq(dailyRecords.teacherUserId, opts.teacherUserId))
    manualFilters.push(eq(studentPoints.teacherUserId, opts.teacherUserId))
  }

  const [days, manual] = await Promise.all([
    db.select({
        date: dailyRecords.date,
        attendanceStatus: dailyRecords.attendanceStatus,
        behavior: dailyRecords.behavior,
        homeworkStatus: dailyRecords.homeworkStatus,
        materialsStatus: dailyRecords.materialsStatus,
        participationStatus: dailyRecords.participationStatus,
      })
      .from(dailyRecords).where(and(...dailyFilters)),
    db.select({ date: studentPoints.date, points: studentPoints.points, reason: studentPoints.reason })
      .from(studentPoints).where(and(...manualFilters)),
  ])

  const entries: PointEntry[] = days.flatMap((d) => derivePointEntries(d, settings))
  for (const m of manual) {
    entries.push({ type: 'manual', points: m.points, reason: m.reason, date: m.date })
  }

  return entries.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit)
}
