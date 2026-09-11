import { db } from '@/lib/db'
import { students, teachers, classes, gradeLevels, notifications, parentWhatsappMessages, dailyRecords, lessonRecords, subjects } from '@/lib/db/schema'
import { eq, desc, and, isNull, count, or, gt, gte, sql, asc, inArray } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { today, wholePercents } from '@/lib/utils'
import { lastSchoolDays } from '@/lib/school-days'
import { getSchoolDaysConfig } from '@/lib/school-holidays'
import { requireAdminAccess } from '@/lib/admin-access'
import { getLeaderboard } from '@/lib/points'
import { LeaderboardClient } from './leaderboard-client'
import { ParentMessagesToday } from './parent-messages-today'
import { DailyPerformanceCards } from './daily-performance-cards'
import { HeroStats } from './hero-stats'
import { RecentNotifications } from './recent-notifications'
import { StageFilter } from './stage-filter'
import { getSchoolSettings } from './settings/actions-settings'
import { NotificationBell } from '@/components/notification-bell'
import { getDataHealth } from '@/lib/data-health'
import { DataHealthCard } from '@/components/data-health-card'
import { Suspense } from 'react'
import { AbsenceTodayCard, AbsenceTodayCardSkeleton } from '@/components/absence-today-card'

export const dynamic = 'force-dynamic'

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string | string[] }>
}) {
  const access = await requireAdminAccess()
  const school = access.school

  // Every stage this account is permitted to see. A quality manager or the
  // owner sees the school; everyone else sees only what was assigned to them.
  const allGradeRows = await db
    .select({ id: gradeLevels.id, name: gradeLevels.name })
    .from(gradeLevels)
    .where(eq(gradeLevels.schoolId, school.id))
    .orderBy(asc(gradeLevels.orderIndex))
  const permittedGrades = access.viewAllGrades
    ? allGradeRows
    : allGradeRows.filter((g) => access.gradeIds.includes(g.id))

  /**
   * The stage picker narrows what is on screen; it can never widen it.
   *
   * The ids arrive in the URL, where anyone can type anything, so they are
   * intersected with the permitted list above before they are used. A deputy
   * who pastes another stage's id gets their own stages back, not that one's —
   * the filter is a convenience for reading, never a way in.
   */
  const raw = (await searchParams).stage
  const requestedIds = (Array.isArray(raw) ? raw : raw ? [raw] : [])
    .flatMap((v) => v.split(','))
    .map((v) => v.trim())
    .filter(Boolean)
  const selectedGradeIds = requestedIds.filter((id) => permittedGrades.some((g) => g.id === id))

  // No selection = everything this account may see, exactly as before.
  const scopedGradeIds = selectedGradeIds.length
    ? selectedGradeIds
    : access.viewAllGrades ? null : access.gradeIds

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
  // Teaching days only. Fourteen *calendar* days always contain four weekend
  // days, so the panel reported "4 of 14 days with no recording" at a school
  // that had recorded every single school day — and stepping back through the
  // per-day history landed on empty Fridays.
  // Someone who answers for exactly one stage is shown that stage's calendar,
  // including any Saturday or holiday it keeps for itself. Anyone looking at
  // several stages at once gets the school's, since a single window cannot
  // honour two disagreeing calendars at the same time.
  const daysConfig = await getSchoolDaysConfig(
    school.id,
    scopedGradeIds?.length === 1 ? scopedGradeIds[0] : null,
  )
  const trendDays = lastSchoolDays(14, daysConfig, todayStr)
  const backNavDays = trendDays.slice(-8) // today + up to 7 previous school days, ascending

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
    todayClassStudentTotals,
    [todayPositive],
    [todayNegative],
    [todayStudentsMessaged],
    leaderboardData,
    settings,
    dailyTrendRows,
    lessonTrendRows,
    subjectRows,
    historyClassRows,
    historyLessonRows,
    recentNotifications,
  ] = await Promise.all([
    db.select({ value: count() }).from(students)
      .where(and(eq(students.schoolId, school.id), eq(students.status, 'active'), inScopeClasses(students.classId))),

    db.select({ value: count() }).from(teachers).where(eq(teachers.schoolId, school.id)),

    db.select({ value: count() }).from(classes)
      .where(and(eq(classes.schoolId, school.id), inScopeClasses(classes.id))),

    db.select({ value: count() }).from(gradeLevels)
      .where(and(
        eq(gradeLevels.schoolId, school.id),
        scopedGradeIds ? (scopedGradeIds.length ? inArray(gradeLevels.id, scopedGradeIds) : sql`false`) : undefined
      )),

    // Labelled with the stage: once a second building exists there are two
    // classes called «1\1», and a picker showing the bare name cannot tell
    // the deputy which one they are about to open.
    db.select({
        id: classes.id,
        name: sql<string>`COALESCE(${gradeLevels.name} || ' — ', '') || ${classes.name}`,
      })
      .from(classes)
      .leftJoin(gradeLevels, eq(classes.gradeLevelId, gradeLevels.id))
      .where(and(eq(classes.schoolId, school.id), inScopeClasses(classes.id)))
      .orderBy(gradeLevels.orderIndex, classes.name),

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

    // Counted per class without splitting by type: adding the positive and the
    // negative tallies would count a pupil who got both of them twice.
    db.select({
        classId: parentWhatsappMessages.classId,
        studentCount: sql<number>`COUNT(DISTINCT ${parentWhatsappMessages.studentId})`.mapWith(Number),
      })
      .from(parentWhatsappMessages)
      .where(and(
        eq(parentWhatsappMessages.schoolId, school.id),
        eq(parentWhatsappMessages.date, todayStr),
        inScopeClasses(parentWhatsappMessages.classId)
      ))
      .groupBy(parentWhatsappMessages.classId),

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

    db.select({ value: sql<number>`COUNT(DISTINCT ${parentWhatsappMessages.studentId})`.mapWith(Number) })
      .from(parentWhatsappMessages)
      .where(and(
        eq(parentWhatsappMessages.schoolId, school.id),
        eq(parentWhatsappMessages.date, todayStr),
        inScopeClasses(parentWhatsappMessages.classId)
      )),

    getLeaderboard(school.id, scopedClassIds),

    getSchoolSettings(school.id),

    // Attendance counts students: one register row per pupil per day.
    db.select({
        date: dailyRecords.date,
        present: sql<number>`COUNT(*) FILTER (WHERE ${dailyRecords.attendanceStatus} = 'present')`.mapWith(Number),
        absent: sql<number>`COUNT(*) FILTER (WHERE ${dailyRecords.attendanceStatus} = 'absent')`.mapWith(Number),
        late: sql<number>`COUNT(*) FILTER (WHERE ${dailyRecords.attendanceStatus} = 'late')`.mapWith(Number),
        excused: sql<number>`COUNT(*) FILTER (WHERE ${dailyRecords.attendanceStatus} = 'excused')`.mapWith(Number),
      })
      .from(dailyRecords)
      .where(and(
        eq(dailyRecords.schoolId, school.id),
        gte(dailyRecords.date, trendDays[0]),
        inScopeClasses(dailyRecords.classId)
      ))
      .groupBy(dailyRecords.date),

    // The lesson figures count ASSESSMENTS: one per pupil per teacher, so a
    // pupil who forgot their tools in one subject out of six shows as one
    // lapse out of six, not as a whole missing day.
    db.select({
        date: lessonRecords.date,
        entries: sql<number>`COUNT(*)`.mapWith(Number),
        homeworkDone: sql<number>`COUNT(*) FILTER (WHERE ${lessonRecords.homeworkStatus} = 'done')`.mapWith(Number),
        homeworkMissing: sql<number>`COUNT(*) FILTER (WHERE ${lessonRecords.homeworkStatus} = 'missing')`.mapWith(Number),
        materialsBrought: sql<number>`COUNT(*) FILTER (WHERE ${lessonRecords.materialsStatus} = 'brought')`.mapWith(Number),
        materialsMissing: sql<number>`COUNT(*) FILTER (WHERE ${lessonRecords.materialsStatus} = 'missing')`.mapWith(Number),
        participationActive: sql<number>`COUNT(*) FILTER (WHERE ${lessonRecords.participationStatus} = 'active')`.mapWith(Number),
        participationInactive: sql<number>`COUNT(*) FILTER (WHERE ${lessonRecords.participationStatus} = 'inactive')`.mapWith(Number),
        behaviorGood: sql<number>`COUNT(*) FILTER (WHERE ${lessonRecords.behavior} IN ('excellent','good'))`.mapWith(Number),
        // Everything below "good", so the percentage is good-or-better out of
        // every rating given. Counting only 'issue' dropped the 😐 middle
        // rating from the denominator: twenty 😐 and one 😊 read as 100%.
        behaviorIssue: sql<number>`COUNT(*) FILTER (WHERE ${lessonRecords.behavior} IN ('normal','issue'))`.mapWith(Number),
      })
      .from(lessonRecords)
      .where(and(
        eq(lessonRecords.schoolId, school.id),
        gte(lessonRecords.date, trendDays[0]),
        inScopeClasses(lessonRecords.classId)
      ))
      .groupBy(lessonRecords.date),

    // Subject by subject, for the day the user is looking at.
    db.select({
        date: lessonRecords.date,
        subjectId: lessonRecords.subjectId,
        subjectName: subjects.name,
        teacherName: teachers.fullName,
        className: classes.name,
        gradeName: gradeLevels.name,
        entries: sql<number>`COUNT(*)`.mapWith(Number),
        homeworkDone: sql<number>`COUNT(*) FILTER (WHERE ${lessonRecords.homeworkStatus} = 'done')`.mapWith(Number),
        homeworkMissing: sql<number>`COUNT(*) FILTER (WHERE ${lessonRecords.homeworkStatus} = 'missing')`.mapWith(Number),
        materialsBrought: sql<number>`COUNT(*) FILTER (WHERE ${lessonRecords.materialsStatus} = 'brought')`.mapWith(Number),
        materialsMissing: sql<number>`COUNT(*) FILTER (WHERE ${lessonRecords.materialsStatus} = 'missing')`.mapWith(Number),
        participationActive: sql<number>`COUNT(*) FILTER (WHERE ${lessonRecords.participationStatus} = 'active')`.mapWith(Number),
        participationInactive: sql<number>`COUNT(*) FILTER (WHERE ${lessonRecords.participationStatus} = 'inactive')`.mapWith(Number),
        behaviorGood: sql<number>`COUNT(*) FILTER (WHERE ${lessonRecords.behavior} IN ('excellent','good'))`.mapWith(Number),
        // Everything below "good", so the percentage is good-or-better out of
        // every rating given. Counting only 'issue' dropped the 😐 middle
        // rating from the denominator: twenty 😐 and one 😊 read as 100%.
        behaviorIssue: sql<number>`COUNT(*) FILTER (WHERE ${lessonRecords.behavior} IN ('normal','issue'))`.mapWith(Number),
      })
      .from(lessonRecords)
      .leftJoin(subjects, eq(subjects.id, lessonRecords.subjectId))
      .leftJoin(teachers, eq(teachers.userId, lessonRecords.teacherUserId))
      .leftJoin(classes, eq(classes.id, lessonRecords.classId))
      .leftJoin(gradeLevels, eq(gradeLevels.id, classes.gradeLevelId))
      .where(and(
        eq(lessonRecords.schoolId, school.id),
        gte(lessonRecords.date, backNavDays[0]),
        inScopeClasses(lessonRecords.classId)
      ))
      .groupBy(
        lessonRecords.date, lessonRecords.subjectId, subjects.name,
        teachers.fullName, classes.name, gradeLevels.name,
      ),

    db.select({
        date: dailyRecords.date,
        classId: dailyRecords.classId,
        present: sql<number>`COUNT(*) FILTER (WHERE ${dailyRecords.attendanceStatus} = 'present')`.mapWith(Number),
        absent: sql<number>`COUNT(*) FILTER (WHERE ${dailyRecords.attendanceStatus} = 'absent')`.mapWith(Number),
        late: sql<number>`COUNT(*) FILTER (WHERE ${dailyRecords.attendanceStatus} = 'late')`.mapWith(Number),
        excused: sql<number>`COUNT(*) FILTER (WHERE ${dailyRecords.attendanceStatus} = 'excused')`.mapWith(Number),
      })
      .from(dailyRecords)
      .where(and(
        eq(dailyRecords.schoolId, school.id),
        gte(dailyRecords.date, backNavDays[0]),
        inScopeClasses(dailyRecords.classId)
      ))
      .groupBy(dailyRecords.date, dailyRecords.classId),

    db.select({
        date: lessonRecords.date,
        classId: lessonRecords.classId,
        entries: sql<number>`COUNT(*)`.mapWith(Number),
        homeworkDone: sql<number>`COUNT(*) FILTER (WHERE ${lessonRecords.homeworkStatus} = 'done')`.mapWith(Number),
        homeworkMissing: sql<number>`COUNT(*) FILTER (WHERE ${lessonRecords.homeworkStatus} = 'missing')`.mapWith(Number),
        materialsBrought: sql<number>`COUNT(*) FILTER (WHERE ${lessonRecords.materialsStatus} = 'brought')`.mapWith(Number),
        materialsMissing: sql<number>`COUNT(*) FILTER (WHERE ${lessonRecords.materialsStatus} = 'missing')`.mapWith(Number),
        participationActive: sql<number>`COUNT(*) FILTER (WHERE ${lessonRecords.participationStatus} = 'active')`.mapWith(Number),
        participationInactive: sql<number>`COUNT(*) FILTER (WHERE ${lessonRecords.participationStatus} = 'inactive')`.mapWith(Number),
        teacherCount: sql<number>`COUNT(DISTINCT ${lessonRecords.teacherUserId})`.mapWith(Number),
      })
      .from(lessonRecords)
      .where(and(
        eq(lessonRecords.schoolId, school.id),
        gte(lessonRecords.date, backNavDays[0]),
        inScopeClasses(lessonRecords.classId)
      ))
      .groupBy(lessonRecords.date, lessonRecords.classId),

    db.select()
      .from(notifications)
      .where(and(
        eq(notifications.schoolId, school.id),
        or(isNull(notifications.expiresAt), gt(notifications.expiresAt, sql`now()`)),
        /**
         * The only query on this page that was not narrowed to the reader's own
         * classes — and it renders each notice's title and body. A notice aimed
         * at one class, or at a single pupil, would have been readable by a
         * deputy of another stage entirely. School-wide notices (no class) stay
         * visible to everyone, which is what they are for.
         *
         * The table is empty today, so nothing has leaked; it would have, the
         * first time somebody sent a notice to one class.
         */
        scopedClassIds
          ? or(
              isNull(notifications.classId),
              scopedClassIds.length ? inArray(notifications.classId, scopedClassIds) : sql`false`,
            )
          : undefined,
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

  const studentsByClass = new Map(todayClassStudentTotals.map((r) => [r.classId, r.studentCount]))

  const classStats = classRows.map((cls) => ({
    ...cls,
    positive: countsByClass.get(cls.id)?.positive ?? 0,
    negative: countsByClass.get(cls.id)?.negative ?? 0,
    studentsMessaged: studentsByClass.get(cls.id) ?? 0,
  }))

  const dailyTrendMap = new Map(dailyTrendRows.map((r) => [r.date, r]))
  const lessonTrendMap = new Map(lessonTrendRows.map((r) => [r.date, r]))
  const dailyTrend = trendDays.map((date) => {
    const r = dailyTrendMap.get(date)
    const l = lessonTrendMap.get(date)
    const present = r?.present ?? 0
    const absent = r?.absent ?? 0
    const late = r?.late ?? 0
    const excused = r?.excused ?? 0
    const attTotal = present + absent + late + excused

    const lessonEntries = l?.entries ?? 0
    const homeworkDone = l?.homeworkDone ?? 0
    const homeworkMissing = l?.homeworkMissing ?? 0
    const materialsBrought = l?.materialsBrought ?? 0
    const materialsMissing = l?.materialsMissing ?? 0
    const participationActive = l?.participationActive ?? 0
    const participationInactive = l?.participationInactive ?? 0
    const behaviorGood = l?.behaviorGood ?? 0
    const behaviorIssue = l?.behaviorIssue ?? 0

    const hwTotal = homeworkDone + homeworkMissing
    const matTotal = materialsBrought + materialsMissing
    const partTotal = participationActive + participationInactive
    const behTotal = behaviorGood + behaviorIssue

    // A student is either in school or not: a latecomer attended, and "إذن" is
    // an excused absence. Splitting them this way is what makes the two gauges
    // add up to exactly 100 — with the remainder shared so rounding can't
    // produce 99 or 101.
    const [attendancePct, absencePct] = wholePercents([present + late, absent + excused], attTotal)
    return {
      date,
      present, absent, late, excused, attTotal,
      inSchool: present + late,
      outOfSchool: absent + excused,
      lessonEntries,
      homeworkDone, homeworkMissing,
      materialsBrought, materialsMissing,
      participationActive, participationInactive,
      behaviorGood, behaviorIssue,
      attendancePct,
      absencePct,
      homeworkPct: hwTotal ? Math.round((homeworkDone / hwTotal) * 100) : 0,
      materialsPct: matTotal ? Math.round((materialsBrought / matTotal) * 100) : 0,
      participationPct: partTotal ? Math.round((participationActive / partTotal) * 100) : 0,
      behaviorPct: behTotal ? Math.round((behaviorGood / behTotal) * 100) : 0,
      hasAttendance: attTotal > 0,
      hasHomework: hwTotal > 0,
      hasMaterials: matTotal > 0,
      hasParticipation: partTotal > 0,
      hasBehavior: behTotal > 0,
    }
  })

  // Subject-by-subject detail, keyed by the day the navigator is showing.
  const subjectsByDay = new Map<string, typeof subjectRows>()
  for (const row of subjectRows) {
    if (!subjectsByDay.has(row.date)) subjectsByDay.set(row.date, [])
    subjectsByDay.get(row.date)!.push(row)
  }
  const subjectHistory = backNavDays.map((date) => ({
    date,
    subjects: (subjectsByDay.get(date) ?? []).map((row) => {
      const hwTotal = row.homeworkDone + row.homeworkMissing
      const matTotal = row.materialsBrought + row.materialsMissing
      const partTotal = row.participationActive + row.participationInactive
      const behTotal = row.behaviorGood + row.behaviorIssue
      return {
        key: `${row.subjectId ?? 'none'}-${row.className ?? ''}-${row.teacherName ?? ''}`,
        subjectName: row.subjectName,
        teacherName: row.teacherName,
        className: row.className,
        gradeName: row.gradeName,
        entries: row.entries,
        homeworkDone: row.homeworkDone,
        homeworkMissing: row.homeworkMissing,
        materialsBrought: row.materialsBrought,
        materialsMissing: row.materialsMissing,
        participationActive: row.participationActive,
        participationInactive: row.participationInactive,
        behaviorGood: row.behaviorGood,
        behaviorIssue: row.behaviorIssue,
        homeworkPct: hwTotal ? Math.round((row.homeworkDone / hwTotal) * 100) : null,
        materialsPct: matTotal ? Math.round((row.materialsBrought / matTotal) * 100) : null,
        participationPct: partTotal ? Math.round((row.participationActive / partTotal) * 100) : null,
        behaviorPct: behTotal ? Math.round((row.behaviorGood / behTotal) * 100) : null,
      }
    }).sort((a, b) => (a.gradeName ?? '').localeCompare(b.gradeName ?? '') || (a.className ?? '').localeCompare(b.className ?? '')),
  }))

  // Per-class breakdown for today and up to 7 days back (for the day-back navigator)
  const historyMap = new Map<string, Map<string, (typeof historyClassRows)[number]>>()
  for (const row of historyClassRows) {
    if (!historyMap.has(row.date)) historyMap.set(row.date, new Map())
    historyMap.get(row.date)!.set(row.classId, row)
  }
  const lessonHistoryMap = new Map<string, Map<string, (typeof historyLessonRows)[number]>>()
  for (const row of historyLessonRows) {
    if (!lessonHistoryMap.has(row.date)) lessonHistoryMap.set(row.date, new Map())
    lessonHistoryMap.get(row.date)!.set(row.classId, row)
  }

  const byClassHistory = backNavDays.map((date) => {
    const dayMap = historyMap.get(date)
    const lessonMap = lessonHistoryMap.get(date)
    const classesForDay = classRows.map((cls) => {
      const r = dayMap?.get(cls.id)
      const l = lessonMap?.get(cls.id)
      const present = r?.present ?? 0
      const absent = r?.absent ?? 0
      const late = r?.late ?? 0
      const excused = r?.excused ?? 0
      const homeworkDone = l?.homeworkDone ?? 0
      const homeworkMissing = l?.homeworkMissing ?? 0
      const materialsBrought = l?.materialsBrought ?? 0
      const materialsMissing = l?.materialsMissing ?? 0
      const participationActive = l?.participationActive ?? 0
      const participationInactive = l?.participationInactive ?? 0
      const attTotal = present + absent + late + excused
      const hwTotal = homeworkDone + homeworkMissing
      const matTotal = materialsBrought + materialsMissing
      const partTotal = participationActive + participationInactive
      return {
        id: cls.id,
        name: cls.name,
        gradeName: cls.gradeName,
        present, absent, late, excused, attTotal,
        inSchool: present + late,
        // Same definition as the school-wide gauges above, so a class total can
        // be checked against them.
        attendancePct: wholePercents([present + late, absent + excused], attTotal)[0],
        homeworkPct: hwTotal ? Math.round((homeworkDone / hwTotal) * 100) : 0,
        materialsPct: matTotal ? Math.round((materialsBrought / matTotal) * 100) : 0,
        participationPct: partTotal ? Math.round((participationActive / partTotal) * 100) : 0,
        /** How many teachers filled a roster for this class that day. */
        teacherCount: l?.teacherCount ?? 0,
        lessonEntries: l?.entries ?? 0,
        recorded: attTotal > 0 || (l?.entries ?? 0) > 0,
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
        <NotificationBell />
      </div>

      <StageFilter stages={permittedGrades} selected={selectedGradeIds} />

      {/* Streams on its own: the sheet's three round trips must not hold the page. Keeps the stage picker's choice. */}
      <Suspense fallback={<AbsenceTodayCardSkeleton />}>
        <AbsenceTodayCard schoolId={school.id} date={todayStr} classIds={scopedClassIds} href={selectedGradeIds.length ? `/admin/absence?${selectedGradeIds.map((id) => `stage=${id}`).join('&')}` : '/admin/absence'} />
      </Suspense>

      {/* Only whole-school accounts see the school's own gaps: a deputy cannot
          assign a counsellor or take a backup, so the list would only nag. */}
      {access.viewAllGrades && <DataHealthCard items={await getDataHealth(school.id)} />}

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
        todayStudentsMessaged={todayStudentsMessaged.value}
      />

      <DailyPerformanceCards
        attendanceEnabled={settings.features.attendance}
        homeworkEnabled={settings.features.homework}
        participationEnabled={settings.features.participation}
        materialsEnabled={settings.features.materials}
        behaviorEnabled={settings.features.behavior}
        trend={dailyTrend}
        byClassHistory={byClassHistory}
        subjectHistory={subjectHistory}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LeaderboardClient students={leaderboardData} classes={classList} />
        <RecentNotifications notifications={recentNotifications} />
      </div>
    </div>
  )
}
