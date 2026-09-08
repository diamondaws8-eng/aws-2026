import { db } from '@/lib/db'
import { students, teachers, classes, gradeLevels, notifications, parentWhatsappMessages, dailyRecords } from '@/lib/db/schema'
import { eq, desc, and, isNull, count, or, gt, gte, sql, asc, inArray } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { today, schoolDate } from '@/lib/utils'
import { requireAdminAccess } from '@/lib/admin-access'
import { getLeaderboard } from '@/lib/points'
import { LeaderboardClient } from './leaderboard-client'
import { ParentMessagesToday } from './parent-messages-today'
import { DailyPerformanceCards } from './daily-performance-cards'
import { HeroStats } from './hero-stats'
import { RecentNotifications } from './recent-notifications'
import { getSchoolSettings } from './settings/actions-settings'

export const dynamic = 'force-dynamic'

export default async function AdminDashboardPage() {
  const access = await requireAdminAccess()
  const school = access.school

  // A deputy only sees the grades assigned to them.
  const scopedGradeIds = access.viewAllGrades ? null : access.gradeIds
  const scopedClassRows = scopedGradeIds
    ? await db.select({ id: classes.id }).from(classes).where(
        and(eq(classes.schoolId, school.id), scopedGradeIds.length ? inArray(classes.gradeLevelId, scopedGradeIds) : sql`false`)
      )
    : null
  const scopedClassIds = scopedClassRows?.map((c) => c.id) ?? null
  const inScopeClasses = (column: AnyPgColumn) =>
    scopedClassIds ? (scopedClassIds.length ? inArray(column, scopedClassIds) : sql`false`) : undefined

  const todayStr = today()

  // ── Daily performance window (14-day trend, 8-day per-class history) ────────
  const trendDays: string[] = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    trendDays.push(schoolDate(d))
  }
  const backNavDays = trendDays.slice(-8) // today + up to 7 previous days, ascending

  // None of these depend on each other, so they run in parallel — the dashboard
  // used to wait for a dozen sequential round trips to the database.
  const [
    [studentCount],
    [teacherCount],
    [classCount],
    [gradeCount],
    classList,
    classRows,
    todayMessageCounts,
    [todayPositive],
    [todayNegative],
    leaderboardData,
    settings,
    dailyTrendRows,
    historyClassRows,
    recentNotifications,
  ] = await Promise.all([
    db.select({ value: count() }).from(students)
      .where(and(eq(students.schoolId, school.id), inScopeClasses(students.classId))),

    db.select({ value: count() }).from(teachers).where(eq(teachers.schoolId, school.id)),

    db.select({ value: count() }).from(classes)
      .where(and(eq(classes.schoolId, school.id), inScopeClasses(classes.id))),

    db.select({ value: count() }).from(gradeLevels)
      .where(and(
        eq(gradeLevels.schoolId, school.id),
        scopedGradeIds ? (scopedGradeIds.length ? inArray(gradeLevels.id, scopedGradeIds) : sql`false`) : undefined
      )),

    db.select({ id: classes.id, name: classes.name })
      .from(classes)
      .where(and(eq(classes.schoolId, school.id), inScopeClasses(classes.id))),

    db.select({
        id: classes.id,
        name: classes.name,
        gradeName: gradeLevels.name,
        gradeOrder: gradeLevels.orderIndex,
      })
      .from(classes)
      .leftJoin(gradeLevels, eq(classes.gradeLevelId, gradeLevels.id))
      .where(and(eq(classes.schoolId, school.id), inScopeClasses(classes.id)))
      .orderBy(asc(gradeLevels.orderIndex), asc(classes.name)),

    db.select({
        classId: parentWhatsappMessages.classId,
        type: parentWhatsappMessages.type,
        studentCount: sql<number>`COUNT(DISTINCT ${parentWhatsappMessages.studentId})`.mapWith(Number),
      })
      .from(parentWhatsappMessages)
      .where(and(
        eq(parentWhatsappMessages.schoolId, school.id),
        eq(parentWhatsappMessages.date, todayStr),
        inScopeClasses(parentWhatsappMessages.classId)
      ))
      .groupBy(parentWhatsappMessages.classId, parentWhatsappMessages.type),

    db.select({ value: sql<number>`COUNT(DISTINCT ${parentWhatsappMessages.studentId})`.mapWith(Number) })
      .from(parentWhatsappMessages)
      .where(and(
        eq(parentWhatsappMessages.schoolId, school.id),
        eq(parentWhatsappMessages.date, todayStr),
        eq(parentWhatsappMessages.type, 'positive'),
        inScopeClasses(parentWhatsappMessages.classId)
      )),

    db.select({ value: sql<number>`COUNT(DISTINCT ${parentWhatsappMessages.studentId})`.mapWith(Number) })
      .from(parentWhatsappMessages)
      .where(and(
        eq(parentWhatsappMessages.schoolId, school.id),
        eq(parentWhatsappMessages.date, todayStr),
        eq(parentWhatsappMessages.type, 'negative'),
        inScopeClasses(parentWhatsappMessages.classId)
      )),

    getLeaderboard(school.id, scopedClassIds),

    getSchoolSettings(school.id),

    db.select({
        date: dailyRecords.date,
        present: sql<number>`COUNT(*) FILTER (WHERE ${dailyRecords.attendanceStatus} = 'present')`.mapWith(Number),
        absent: sql<number>`COUNT(*) FILTER (WHERE ${dailyRecords.attendanceStatus} = 'absent')`.mapWith(Number),
        late: sql<number>`COUNT(*) FILTER (WHERE ${dailyRecords.attendanceStatus} = 'late')`.mapWith(Number),
        excused: sql<number>`COUNT(*) FILTER (WHERE ${dailyRecords.attendanceStatus} = 'excused')`.mapWith(Number),
        homeworkDone: sql<number>`COUNT(*) FILTER (WHERE ${dailyRecords.homeworkStatus} = 'done')`.mapWith(Number),
        homeworkMissing: sql<number>`COUNT(*) FILTER (WHERE ${dailyRecords.homeworkStatus} = 'missing')`.mapWith(Number),
        participationActive: sql<number>`COUNT(*) FILTER (WHERE ${dailyRecords.participationStatus} = 'active')`.mapWith(Number),
        participationInactive: sql<number>`COUNT(*) FILTER (WHERE ${dailyRecords.participationStatus} = 'inactive')`.mapWith(Number),
      })
      .from(dailyRecords)
      .where(and(
        eq(dailyRecords.schoolId, school.id),
        gte(dailyRecords.date, trendDays[0]),
        inScopeClasses(dailyRecords.classId)
      ))
      .groupBy(dailyRecords.date),

    db.select({
        date: dailyRecords.date,
        classId: dailyRecords.classId,
        present: sql<number>`COUNT(*) FILTER (WHERE ${dailyRecords.attendanceStatus} = 'present')`.mapWith(Number),
        absent: sql<number>`COUNT(*) FILTER (WHERE ${dailyRecords.attendanceStatus} = 'absent')`.mapWith(Number),
        late: sql<number>`COUNT(*) FILTER (WHERE ${dailyRecords.attendanceStatus} = 'late')`.mapWith(Number),
        excused: sql<number>`COUNT(*) FILTER (WHERE ${dailyRecords.attendanceStatus} = 'excused')`.mapWith(Number),
        homeworkDone: sql<number>`COUNT(*) FILTER (WHERE ${dailyRecords.homeworkStatus} = 'done')`.mapWith(Number),
        homeworkMissing: sql<number>`COUNT(*) FILTER (WHERE ${dailyRecords.homeworkStatus} = 'missing')`.mapWith(Number),
        participationActive: sql<number>`COUNT(*) FILTER (WHERE ${dailyRecords.participationStatus} = 'active')`.mapWith(Number),
        participationInactive: sql<number>`COUNT(*) FILTER (WHERE ${dailyRecords.participationStatus} = 'inactive')`.mapWith(Number),
      })
      .from(dailyRecords)
      .where(and(
        eq(dailyRecords.schoolId, school.id),
        gte(dailyRecords.date, backNavDays[0]),
        inScopeClasses(dailyRecords.classId)
      ))
      .groupBy(dailyRecords.date, dailyRecords.classId),

    db.select()
      .from(notifications)
      .where(and(
        eq(notifications.schoolId, school.id),
        or(isNull(notifications.expiresAt), gt(notifications.expiresAt, sql`now()`))
      ))
      .orderBy(desc(notifications.createdAt))
      .limit(5),
  ])

  const countsByClass = new Map<string, { positive: number; negative: number }>()
  for (const row of todayMessageCounts) {
    const current = countsByClass.get(row.classId) ?? { positive: 0, negative: 0 }
    if (row.type === 'positive') current.positive = row.studentCount
    if (row.type === 'negative') current.negative = row.studentCount
    countsByClass.set(row.classId, current)
  }

  const classStats = classRows.map((cls) => ({
    ...cls,
    positive: countsByClass.get(cls.id)?.positive ?? 0,
    negative: countsByClass.get(cls.id)?.negative ?? 0,
  }))

  const dailyTrendMap = new Map(dailyTrendRows.map((r) => [r.date, r]))
  const dailyTrend = trendDays.map((date) => {
    const r = dailyTrendMap.get(date)
    const present = r?.present ?? 0
    const absent = r?.absent ?? 0
    const late = r?.late ?? 0
    const excused = r?.excused ?? 0
    const homeworkDone = r?.homeworkDone ?? 0
    const homeworkMissing = r?.homeworkMissing ?? 0
    const participationActive = r?.participationActive ?? 0
    const participationInactive = r?.participationInactive ?? 0
    const attTotal = present + absent + late + excused
    const hwTotal = homeworkDone + homeworkMissing
    const partTotal = participationActive + participationInactive
    return {
      date,
      present, absent, late, excused, attTotal,
      homeworkDone, homeworkMissing,
      participationActive, participationInactive,
      attendancePct: attTotal ? Math.round((present / attTotal) * 100) : 0,
      absencePct: attTotal ? Math.round((absent / attTotal) * 100) : 0,
      homeworkPct: hwTotal ? Math.round((homeworkDone / hwTotal) * 100) : 0,
      participationPct: partTotal ? Math.round((participationActive / partTotal) * 100) : 0,
      hasAttendance: attTotal > 0,
      hasHomework: hwTotal > 0,
      hasParticipation: partTotal > 0,
    }
  })

  // Per-class breakdown for today and up to 7 days back (for the day-back navigator)
  const historyMap = new Map<string, Map<string, (typeof historyClassRows)[number]>>()
  for (const row of historyClassRows) {
    if (!historyMap.has(row.date)) historyMap.set(row.date, new Map())
    historyMap.get(row.date)!.set(row.classId, row)
  }

  const byClassHistory = backNavDays.map((date) => {
    const dayMap = historyMap.get(date)
    const classesForDay = classRows.map((cls) => {
      const r = dayMap?.get(cls.id)
      const present = r?.present ?? 0
      const absent = r?.absent ?? 0
      const late = r?.late ?? 0
      const excused = r?.excused ?? 0
      const homeworkDone = r?.homeworkDone ?? 0
      const homeworkMissing = r?.homeworkMissing ?? 0
      const participationActive = r?.participationActive ?? 0
      const participationInactive = r?.participationInactive ?? 0
      const attTotal = present + absent + late + excused
      const hwTotal = homeworkDone + homeworkMissing
      const partTotal = participationActive + participationInactive
      return {
        id: cls.id,
        name: cls.name,
        gradeName: cls.gradeName,
        present, absent, late, excused, attTotal,
        attendancePct: attTotal ? Math.round((present / attTotal) * 100) : 0,
        homeworkPct: hwTotal ? Math.round((homeworkDone / hwTotal) * 100) : 0,
        participationPct: partTotal ? Math.round((participationActive / partTotal) * 100) : 0,
        recorded: attTotal > 0 || hwTotal > 0 || partTotal > 0,
      }
    })
    return { date, classes: classesForDay }
  })

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground">لوحة التحكم</h1>
          <p className="text-muted-foreground mt-1">{school.name} — {school.academicYear}</p>
        </div>
      </div>

      <HeroStats
        studentCount={studentCount.value}
        teacherCount={teacherCount.value}
        classCount={classCount.value}
        gradeCount={gradeCount.value}
      />

      <ParentMessagesToday
        classStats={classStats}
        todayPositive={todayPositive.value}
        todayNegative={todayNegative.value}
      />

      <DailyPerformanceCards
        attendanceEnabled={settings.features.attendance}
        homeworkEnabled={settings.features.homework}
        participationEnabled={settings.features.participation}
        trend={dailyTrend}
        byClassHistory={byClassHistory}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LeaderboardClient students={leaderboardData} classes={classList} />
        <RecentNotifications notifications={recentNotifications} />
      </div>
    </div>
  )
}
