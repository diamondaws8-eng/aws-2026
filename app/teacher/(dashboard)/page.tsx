import { db } from '@/lib/db'
import { classes, gradeLevels, lessonRecords, subjects } from '@/lib/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { ArrowLeft, CalendarCheck, CalendarDays, CircleDashed, History } from 'lucide-react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { formatDateAr, today } from '@/lib/utils'
import { requireTeacher, getTeacherVisibleClassIds } from '@/lib/teacher-access'
import { getSchoolDaysConfig } from '@/lib/school-holidays'
import { nonSchoolDayReason, closedTodayHeading, isWeeklyRest } from '@/lib/school-days'
import { missedDaysForTeacher } from '@/lib/missed-days'
import { getSchoolTimetable } from '@/lib/timetable'
import { getLeaderboard } from '@/lib/points'
import { LeaderboardClient } from '@/app/admin/(dashboard)/leaderboard-client'
import { classDays } from './today-lessons'
import { MyWeek } from './my-week'

import { StatCard } from '@/components/stat-card'
import { NotificationBell } from '@/components/notification-bell'

export const dynamic = 'force-dynamic'

/**
 * The teacher's home page: where things stand, at a glance.
 *
 * It answers «what is on me?» in numbers — today's classes, how many are
 * still unrecorded, what was left unfinished — shows the week they belong to,
 * and points at the classes page. It does not list today's classes a second
 * time: it used to, each one a link straight into the roster, beside a third
 * list of the same classes as stage cards, and the classes page listed them
 * again with their status. Three lists of one set of classes, and only one of
 * them stopped to warn before a record already sent to families was reopened.
 * Entering a class is the classes page's job alone now; this page counts, and
 * sends the teacher there.
 */
export default async function TeacherDashboard() {
  let teacher
  try {
    teacher = await requireTeacher()
  } catch {
    redirect('/teacher/login')
  }

  const todayStr = today()
  const [gradesData, classesData, visibleClassIds, slots] = await Promise.all([
    db.select({ id: gradeLevels.id, name: gradeLevels.name }).from(gradeLevels).where(eq(gradeLevels.schoolId, teacher.schoolId)).orderBy(gradeLevels.orderIndex),
    db.select({ id: classes.id, name: classes.name, gradeLevelId: classes.gradeLevelId }).from(classes).where(eq(classes.schoolId, teacher.schoolId)),
    getTeacherVisibleClassIds(teacher.schoolId, teacher.userId),
    // The school's week in one read, cached for the request: today's count,
    // «جدولي الأسبوعي» and lib/missed-days.ts below all ask it their questions.
    getSchoolTimetable(teacher.schoolId),
  ])
  const gradeNameOf = new Map(gradesData.map((g) => [g.id, g.name]))
  const visibleClasses = classesData
    .filter((c) => visibleClassIds.has(c.id))
    .sort((a, b) => (gradeNameOf.get(a.gradeLevelId) ?? '').localeCompare(gradeNameOf.get(b.gradeLevelId) ?? '') || a.name.localeCompare(b.name))
  const boardClasses = visibleClasses.map((c) => ({ id: c.id, name: `${gradeNameOf.get(c.gradeLevelId) ?? ''} — ${c.name}` }))

  const myClassIds = visibleClasses.map((c) => c.id)
  const [mySubjectRows, recordedRows, boardRows] = await Promise.all([
    myClassIds.length
      ? db.select({ classId: subjects.classId }).from(subjects)
          .where(and(eq(subjects.teacherUserId, teacher.userId), inArray(subjects.classId, myClassIds)))
      : Promise.resolve([] as { classId: string }[]),
    myClassIds.length
      ? db.selectDistinct({ classId: lessonRecords.classId }).from(lessonRecords)
          .where(and(eq(lessonRecords.teacherUserId, teacher.userId), eq(lessonRecords.date, todayStr), inArray(lessonRecords.classId, myClassIds)))
      : Promise.resolve([] as { classId: string }[]),
    // The honour board for this teacher's own classes — the same figures the
    // administration sees, cut to the classes this account may open.
    myClassIds.length ? getLeaderboard(teacher.schoolId, myClassIds) : Promise.resolve([]),
  ])
  const recordedToday = new Set(recordedRows.map((r) => r.classId))
  const withSubject = new Set(mySubjectRows.map((s) => s.classId))
  // "My classes" are the ones with a subject in this teacher's name. Classes
  // nobody has been assigned to yet are reachable (the rollout fallback) but
  // are not this teacher's daily duty, so they are not counted — unless the
  // teacher has no assignment at all, when what is open is what there is.
  const mine = visibleClasses.filter((c) => withSubject.has(c.id))
  const myBase = mine.length ? mine : visibleClasses
  // A Friday, a Saturday the stage does not teach on, or a holiday is not a
  // day with eight classes still waiting — it is a day off, and the page
  // says so instead of pressing the teacher to record it.
  const offReason = new Map<string, string | null>()
  for (const gid of new Set(myBase.map((c) => c.gradeLevelId))) {
    offReason.set(gid, nonSchoolDayReason(todayStr, await getSchoolDaysConfig(teacher.schoolId, gid)))
  }
  /**
   * Which of those classes are today's. Where the timetable governs, a class
   * counts only when it gives this teacher a lesson in it today; everywhere
   * else it counts every school day, as it always did. The rule itself is in
   * ./today-lessons — the classes page lists by it, so the number here and
   * the cards there are one answer.
   */
  const days = classDays({
    slots,
    teacherUserId: teacher.userId,
    classIds: myBase.map((c) => c.id),
    date: todayStr,
    recorded: recordedToday,
    followsTimetable: mine.length > 0,
  })
  const todays = myBase
    .filter((c) => days.get(c.id)?.today)
    .map((c) => ({ id: c.id, done: recordedToday.has(c.id), off: offReason.get(c.gradeLevelId) ?? null }))
  const doneCount = todays.filter((c) => c.done).length
  const pendingCount = todays.filter((c) => !c.done && !c.off).length
  // The day-off label is read off today's classes. When the timetable leaves
  // none — a Friday holds no lesson for anybody — it is read off all the
  // teacher's classes instead, so a day off is still called a day off and not
  // «لا حصص لك اليوم».
  const offScope = todays.length ? todays.map((c) => c.off) : myBase.map((c) => offReason.get(c.gradeLevelId) ?? null)
  const allOff = offScope.length > 0 && offScope.every((reason) => !!reason)
  const offToday = allOff ? offScope[0] : null
  const offLabel = offToday ? (isWeeklyRest(offToday) ? `${closedTodayHeading(offToday)} — لا تسجيل` : closedTodayHeading(offToday)) : null
  // A school day on which the timetable gives this teacher no lesson at all.
  // Said in so many words: «كل فصولك مسجَّلة» would be untrue.
  const noLessonsToday = myBase.length > 0 && todays.length === 0 && !allOff
  // Classes of theirs the timetable keeps off today — the page says where
  // they went, or the first morning with a timetable looks like a loss.
  const restCount = myBase.length - todays.length
  // «جدولي الأسبوعي» prints a class in a narrow row, so it goes by its own
  // name — with its stage in front only where this teacher has two classes of
  // the same name, which happens across stages («1/2» in each of them).
  const sameName = new Map<string, number>()
  for (const c of visibleClasses) sameName.set(c.name, (sameName.get(c.name) ?? 0) + 1)
  const weekClassNames = new Map(visibleClasses.map((c) => [
    c.id,
    (sameName.get(c.name) ?? 0) > 1 ? `${gradeNameOf.get(c.gradeLevelId) ?? ''} — ${c.name}` : c.name,
  ]))
  // The day that was never opened — see lib/missed-days.ts for why it is only
  // the last school day and not the last week.
  const missed = await missedDaysForTeacher(teacher.schoolId, teacher.userId, todayStr)
  // Two different asks: a register nobody took, and a lesson this teacher has
  // not marked. The first is urgent and only ever the last school day.
  const missedRegister = missed.filter((m) => m.kind === 'register')
  const missedAssessment = missed.filter((m) => m.kind === 'assessment')

  // Today in one sentence, for the card that sends the teacher to the classes page.
  const todayLine = offLabel
    ?? (myBase.length === 0 ? 'لا توجد فصول مسندة إليك بعد — تواصل مع الإدارة'
    : noLessonsToday ? 'لا حصص لك اليوم حسب الجدول. فصولك كلها في صفحة الفصول إن احتجت إكمال يوم سابق.'
    : pendingCount === 0 ? `سجّلت فصول اليوم كلها (${todays.length}).`
    : `سجّلت ${doneCount} من ${todays.length} — بقي ${pendingCount}.`)

  return (
    <div className="p-6 space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">أهلاً، {teacher.fullName}</h1>
          <p className="text-muted-foreground mt-1">{formatDateAr(todayStr)}</p>
        </div>
        <NotificationBell />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          label="فصول اليوم"
          value={todays.length}
          icon={CalendarDays}
          accent="blue"
          trend={{
            value: 0,
            label: offLabel
              ?? (noLessonsToday ? 'لا حصص لك اليوم حسب الجدول'
              : mine.length === 0 && myBase.length > 0 ? 'لم تُسند إليك مادة بعد — تظهر الفصول المفتوحة'
              : restCount > 0 ? `من ${myBase.length} فصلاً لك — البقية ليست في جدول اليوم`
              : 'كل فصولك'),
          }}
        />
        <StatCard
          label="لم تُسجَّل اليوم"
          value={pendingCount}
          icon={pendingCount ? CircleDashed : CalendarCheck}
          accent={pendingCount ? 'amber' : 'emerald'}
          trend={{ value: 0, label: pendingCount ? 'سجّلها من صفحة الفصول' : offLabel ?? (noLessonsToday ? 'لا شيء عليك اليوم' : 'كل فصول اليوم مسجَّلة') }}
        />
        <StatCard
          label="أيام لم تكتمل"
          value={missed.length}
          icon={History}
          accent={missed.length ? 'amber' : 'emerald'}
          trend={{ value: 0, label: missed.length ? 'فصول كانت لك فيها حصة ولم تكتمل' : 'لا شيء متأخر' }}
        />
      </div>

      {/* The one way from here into today's work: the classes page, where each
          class says whether it is recorded and asks before it is reopened. */}
      <div className="bg-card border border-border rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-bold">حصص اليوم</h2>
          <p className="text-sm text-muted-foreground mt-1 leading-7">{todayLine}</p>
          {!offLabel && todays.length > 0 && restCount > 0 && (
            <p className="text-xs text-muted-foreground mt-1">بقية فصولك ({restCount}) ليست في جدول اليوم — تجدها مطويّة في صفحة الفصول.</p>
          )}
        </div>
        {myBase.length > 0 && (
          <Link
            href="/teacher/classes"
            className="shrink-0 inline-flex items-center justify-center gap-2 min-h-11 px-5 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-colors"
          >
            {pendingCount > 0 ? 'تسجيل حصص اليوم' : 'فتح الفصول'}
            <ArrowLeft className="size-4" />
          </Link>
        )}
      </div>

      {missed.length > 0 && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 dark:border-red-900/50 dark:bg-red-950/20">
          <div className="flex items-center gap-3 mb-1">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-900/40">
              <History className="size-4" />
            </span>
            <h2 className="text-lg font-bold text-red-800 dark:text-red-300">أيام لم تكتمل</h2>
          </div>

          {missedRegister.length > 0 && (
            <div className="mt-3">
              <p className="text-sm font-bold text-red-800 dark:text-red-300">
                لم يُسجَّل الحضور — {formatDateAr(missedRegister[0].date)}
              </p>
              <p className="text-xs text-red-800/80 dark:text-red-300/80 mb-2 leading-6">
                لم يفتح هذا الفصل أحد في ذلك اليوم، فلم يصل أهل الطلاب شيء. سجّله الآن وأنت تذكره.
              </p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {missedRegister.map((m) => (
                  <li key={`${m.classId}|${m.date}`}>
                    <Link
                      href={`/teacher/classes/${m.classId}?date=${m.date}`}
                      className="flex items-center gap-3 rounded-xl border border-red-300 bg-card p-3 transition-colors hover:bg-red-100/50 dark:border-red-900/50 dark:hover:bg-red-950/40"
                    >
                      <CircleDashed className="size-4 shrink-0 text-red-500" />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{m.className}</span>
                        {m.gradeName && <span className="block truncate text-xs text-muted-foreground">{m.gradeName}</span>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {missedAssessment.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-bold text-amber-800 dark:text-amber-300">ينقص تقييمك لهذه الحصص</p>
              <p className="text-xs text-amber-800/80 dark:text-amber-300/80 mb-2 leading-6">
                الحضور مسجَّل من زميل أو من الإدارة، فلن تحتاج أن تتذكّره — يبقى عليك الواجب والأدوات والمشاركة والسلوك.
              </p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {missedAssessment.map((m) => (
                  <li key={`${m.classId}|${m.date}`}>
                    <Link
                      href={`/teacher/classes/${m.classId}?date=${m.date}`}
                      className="flex items-center justify-between gap-2 rounded-xl border border-amber-300 bg-card p-3 transition-colors hover:bg-amber-100/50 dark:border-amber-900/50 dark:hover:bg-amber-950/40"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{m.className}</span>
                        {m.gradeName && <span className="block truncate text-xs text-muted-foreground">{m.gradeName}</span>}
                      </span>
                      <span className="shrink-0 text-xs font-semibold text-amber-700 dark:text-amber-400">{m.date.slice(5).replace('-', '/')}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="mt-3 text-[11px] text-red-800/70 dark:text-red-300/70">
            ما هو أقدم من ذلك تصحّحه الإدارة بسبب مكتوب — لا تسجّل من الذاكرة ما لم تره.
          </p>
        </div>
      )}

      <MyWeek slots={slots} teacherUserId={teacher.userId} classNames={weekClassNames} today={todayStr} />

      {boardClasses.length > 0 && (
        <LeaderboardClient
          students={boardRows}
          classes={boardClasses}
          title="لوحة الشرف — فصولي"
          allLabel="كل فصولي"
          showAll={boardClasses.length > 1}
          defaultClassId={boardClasses[0].id}
        />
      )}
    </div>
  )
}
