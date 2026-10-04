import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { buildHonorBoards } from '@/lib/ranking'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { getMyChildren, getStudentDashboard } from './actions'
import { ExcuseForm } from './excuse-form'
import { NotificationBell } from '@/components/notification-bell'
import { CalendarNotice } from '@/components/calendar-notice'
import { ParentWeekCard } from '@/components/parent-week-card'
import { RememberChild } from '@/components/remember-child'
import { HonorBoard } from './honor-board'
import { requireParent } from '@/lib/parent-access'
import { getChildWeek } from '@/lib/parent-portal'
import { excusesForStudent } from '@/lib/absence-excuses'
import { EXCUSE_WINDOW_DAYS } from '@/lib/excuse-rules'
import { getLeaderboard } from '@/lib/points'
import { getCalendarNotice } from '@/lib/school-holidays'
import { shiftDate } from '@/lib/school-days'
import { db } from '@/lib/db'
import { students } from '@/lib/db/schema'
import { and, count, eq } from 'drizzle-orm'
import { ATTENDANCE_STATUS, formatDayGregorianAr, today } from '@/lib/utils'

/**
 * Points earned as a share of the points that were possible. It used to be an
 * average per register day with fixed cut-offs — but lesson points come once
 * per teacher, so the same child rated "ممتاز" in a class with six teachers and
 * "جيد" in a class with two, and the bar never moved between the five steps.
 */
function getPerformanceRating(points: number, possible: number) {
  if (possible <= 0) {
    return { label: 'لا توجد بيانات', color: 'text-muted-foreground', bg: 'bg-muted', border: 'border-border', bar: 'bg-muted', pct: 0 }
  }
  const pct = Math.max(0, Math.min(100, Math.round((points / possible) * 100)))
  if (pct >= 85) return { label: 'ممتاز 🌟',        color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', bar: 'bg-emerald-500', pct }
  if (pct >= 70) return { label: 'جيد جداً ✅',     color: 'text-blue-600',   bg: 'bg-blue-50',   border: 'border-blue-200',   bar: 'bg-blue-500',   pct }
  if (pct >= 50) return { label: 'جيد 👍',           color: 'text-amber-600',  bg: 'bg-amber-50',  border: 'border-amber-200',  bar: 'bg-amber-500',  pct }
  if (pct >= 30) return { label: 'يحتاج متابعة ⚠️', color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200', bar: 'bg-orange-500', pct }
  return            { label: 'يحتاج اهتماماً 🔴',    color: 'text-red-600',    bg: 'bg-red-50',    border: 'border-red-200',    bar: 'bg-red-400',    pct }
}

const SUBJECT_ICONS: Record<string, string> = {
  'رياضيات': '📐', 'علوم': '🔬', 'لغة عربية': '📖', 'اللغة العربية': '📖',
  'لغة إنجليزية': '🌍', 'اللغة الإنجليزية': '🌍', 'تربية إسلامية': '🕌',
  'الدراسات الإسلامية': '🕌', 'تاريخ': '🏛️', 'جغرافيا': '🗺️',
  'حاسب آلي': '💻', 'تربية فنية': '🎨', 'تربية بدنية': '⚽',
  'الدراسات الاجتماعية': '🌏',
}

function subjectIcon(name: string) {
  for (const [key, icon] of Object.entries(SUBJECT_ICONS)) {
    if (name.includes(key)) return icon
  }
  return '📚'
}

export default async function ParentDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ child?: string }>
}) {
  // Still on the starter password: the layout shows the password card, and
  // nothing about any child is read underneath it.
  const access = await requireParent()
  if (access.mustChangePassword) return null

  const params    = await searchParams
  const children  = await getMyChildren()

  if (children.length === 0) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh] p-6">
        <div className="text-center max-w-sm">
          <div className="text-6xl mb-4">👨‍👧‍👦</div>
          <h2 className="text-xl font-bold mb-2">لا يوجد أبناء مرتبطون بحسابك</h2>
          <p className="text-muted-foreground text-sm">تواصل مع إدارة المدرسة لإضافة أبنائك.</p>
        </div>
      </div>
    )
  }

  // The id in the address is whatever was typed there. Only one of this
  // parent's own children is ever asked about — anything else goes back to
  // their own children, not to the login page.
  if (params.child && !children.some((c) => c.id === params.child)) redirect('/parent')

  // No child in the address: the one this device showed last, and failing that
  // the first still at the school. The cookie is only a hint — another family
  // may have signed in on the same phone — so it counts only when it names one
  // of this parent's own.
  const remembered    = (await cookies()).get('parent_child')?.value
  const activeChild   = children.find((c) => c.id === (params.child || remembered)) ?? children[0]
  const activeChildId = activeChild.id
  const graduated     = activeChild.status === 'graduated'

  const todayStr = today()
  // The oldest day the portal still takes an excuse for; the action refuses
  // anything before it.
  const excuseSince = shiftDate(todayStr, -EXCUSE_WINDOW_DAYS)
  // What was already sent is read much further back than that. «آخر الأيام» is
  // the last ten days on the register, and a break stretches those well past
  // the window — a day still listed must not lose its «قيد المراجعة», or the
  // school's answer, only because a fortnight went by.
  const excusesFrom = shiftDate(todayStr, -180)

  // The week and the excuses are asked for beside the dashboard, not after it:
  // parents are the largest group in the school and every wait in series is
  // theirs. Neither is asked for a graduate — there is no week to report, and
  // the excuse action refuses a pupil who is no longer on the rolls.
  const [dashboard, week, excuses] = await Promise.all([
    getStudentDashboard(activeChildId),
    graduated ? null : getChildWeek(activeChildId, access.id, todayStr),
    // The excuse line is an extra, and this is the page every family opens.
    // If it cannot be read the page still comes — without the line, rather
    // than with a form whose answer could not be saved either.
    graduated
      ? null
      : excusesForStudent(activeChildId, excusesFrom).catch((error) => {
          console.error('Parent Excuses Error:', error)
          return null
        }),
  ])
  if (!dashboard) redirect('/parent') // unlinked between the two reads — back to their own children
  const excuseOn = new Map((excuses ?? []).map((e) => [e.date, e]))

  const { student, classInfo, gradeName, totalPoints, attendance, subjectCards, possiblePoints, recentRecords, recentGrades } = dashboard
  const totalSessions = attendance.present + attendance.absent + attendance.late + attendance.excused
  const perf = getPerformanceRating(totalPoints, possiblePoints)
  // With attendance switched off the roster files every pupil as present; a
  // «حاضر» nobody took is not reported to the family as one. The week card
  // and the day page hold the same rule.
  const attendanceOn = dashboard.features.attendance !== false
  // Every figure here counts from the start of the current school year, and a
  // pupil who graduated before it has none: a card of zeros under his name
  // reads as a record that was wiped.
  const showPerformance = !(graduated && totalSessions === 0 && totalPoints === 0)

  // The calendar of the child's own stage. A child with no class — unassigned,
  // or graduated — has no stage to ask, so the whole school's calendar answers.
  // Started here and awaited beside the honour board, not after it: parents are
  // the largest group in the school and every wait in series is theirs.
  const noticePromise = getCalendarNotice(student.schoolId, classInfo?.gradeLevelId ?? null, todayStr)

  // The class honour board, scoped to the child's own class only — the same
  // figures the administration's board uses, from the same year boundary.
  const [honorRows, classSize, notice] = student.classId && !graduated
    ? await Promise.all([
        getLeaderboard(student.schoolId, [student.classId]),
        db.select({ n: count() }).from(students)
          .where(and(eq(students.classId, student.classId), eq(students.status, 'active')))
          .then((r) => r[0]?.n ?? 0),
        noticePromise,
      ])
    : [[], 0, await noticePromise]

  return (
    <div className="px-4 py-8 max-w-4xl mx-auto space-y-6">
      <RememberChild id={activeChildId} />

      {/* ── Child Switcher ───────────────────────────────────────────────────── */}
      {children.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {children.map(child => {
            // First name, unless another child shares it — then the father's
            // name too. Two chips both reading «طالب» told a family nothing.
            const first = child.fullName.split(' ')[0]
            const clash = children.some((o) => o.id !== child.id && o.fullName.split(' ')[0] === first)
            const label = clash ? child.fullName.split(' ').slice(0, 2).join(' ') : first
            return (
              <a
                key={child.id}
                href={`/parent?child=${child.id}`}
                className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all border ${
                  child.id === activeChildId
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                    : 'bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-foreground'
                }`}
              >
                <span>{child.gender === 'female' ? '👧' : '👦'}</span>
                {label}
                {/* A graduate has no class left to name; a bare name beside
                    the other children's classes would read as a child not
                    yet placed in one. */}
                {(child.status === 'graduated' || child.className) && (
                  <span className={`text-[11px] font-normal ${child.id === activeChildId ? 'opacity-80' : 'text-muted-foreground'}`}>
                    · {child.status === 'graduated' ? 'متخرّج' : child.className}
                  </span>
                )}
              </a>
            )
          })}
        </div>
      )}

      {/* ── Student Header ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{student.fullName}</h1>
          {classInfo && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {gradeName} — فصل {classInfo.name}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell />
          <div className={`px-4 py-2 rounded-2xl border text-sm font-bold ${perf.bg} ${perf.border} ${perf.color}`}>
            {perf.label}
          </div>
        </div>
      </div>

      {/* ── Graduate ─────────────────────────────────────────────────────────── */}
      {/* Said once, at the top: a graduate has no class, no subjects and no
          week, and without this a family reads the empty page as a fault. */}
      {graduated && (
        <div className="rounded-2xl border border-border bg-muted/40 p-4">
          <p className="text-sm font-bold">
            متخرّج{activeChild.graduationYear ? ` — عام ${activeChild.graduationYear}` : ''}
          </p>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            ما يظهر هنا يخص العام الدراسي الحالي فقط؛ سجلات أعوامه السابقة محفوظة لدى إدارة المدرسة.
          </p>
        </div>
      )}

      {/* ── Calendar ─────────────────────────────────────────────────────────── */}
      <CalendarNotice notice={notice} today={todayStr} />

      {/* ── This week ────────────────────────────────────────────────────────── */}
      {week && <ParentWeekCard week={week} childId={activeChildId} />}

      {/* ── Performance Card ─────────────────────────────────────────────────── */}
      {showPerformance && (
      <div className="bg-card border border-border rounded-3xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg">الأداء العام</h2>
          <div className="text-3xl font-black text-primary">
            {totalPoints > 0 ? '+' : ''}{totalPoints}
            <span className="text-sm font-normal text-muted-foreground mr-1">نقطة</span>
            {possiblePoints > 0 && (
              <span className="block text-xs font-normal text-muted-foreground text-left">
                من {possiblePoints} ممكنة ({perf.pct}%)
              </span>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-muted rounded-full h-3 mb-5 overflow-hidden">
          <div
            className={`h-3 rounded-full transition-all duration-700 ${perf.bar}`}
            style={{ width: `${perf.pct}%` }}
          />
        </div>

        {/* Attendance grid */}
        {/* Two across on a phone. Four tiles on a 375px screen leave about 76px
            each, and "حضور حصة" then breaks across two lines under the number.
            Parents read this on a phone almost exclusively. */}
        {attendanceOn && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            // Days, not lessons: the register is one row per pupil per day,
            // shared by every teacher. "حصة" here made a parent with three
            // teachers a day ask why only two lessons were counted.
            { label: 'أيام حضور', value: attendance.present,  emoji: '✅', color: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
            { label: 'أيام غياب', value: attendance.absent,   emoji: '❌', color: 'text-red-600 bg-red-50 border-red-100' },
            { label: 'أيام تأخر', value: attendance.late,     emoji: '⏰', color: 'text-amber-600 bg-amber-50 border-amber-100' },
            { label: 'أيام إذن',  value: attendance.excused,  emoji: '📋', color: 'text-blue-600 bg-blue-50 border-blue-100' },
          ].map(stat => (
            <div key={stat.label} className={`rounded-2xl border p-3 text-center ${stat.color}`}>
              <div className="text-lg">{stat.emoji}</div>
              <div className="text-xl font-black mt-1">{stat.value}</div>
              <div className="text-xs font-semibold mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>
        )}

        {attendanceOn && totalSessions > 0 && (
          <p className="text-xs text-muted-foreground text-center mt-3">
            أيام مسجَّلة في الحضور: {totalSessions} يوم
          </p>
        )}
      </div>
      )}

      {/* ── Last days and latest marks ───────────────────────────────────────── */}
      {/* Fetched from the first day, never shown: a parent had the totals but not
          the week. Ten days, newest first, and the last six marks. */}
      {(recentRecords.length > 0 || recentGrades.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-card border border-border rounded-3xl p-5 shadow-sm">
            <h2 className="font-bold text-lg mb-3">آخر الأيام</h2>
            {recentRecords.length === 0 ? (
              <p className="text-sm text-muted-foreground">لم يُسجَّل حضور بعد</p>
            ) : (
              // No gap between the rows: each one is a link the height of a
              // thumb, and that height is the spacing.
              <ul>
                {recentRecords.map((r) => {
                  const s = ATTENDANCE_STATUS[r.attendanceStatus as keyof typeof ATTENDANCE_STATUS]
                  // An absence still inside the window can be excused from
                  // here. A day that already has an excuse keeps its line
                  // whatever the register says now — accepting one turns the
                  // day into «إذن», and the answer belongs beside it.
                  const excuse = excuseOn.get(r.date) ?? null
                  const excusable = !!excuses && attendanceOn && r.attendanceStatus === 'absent' && r.date >= excuseSince
                  return (
                    <li key={r.id}>
                      <Link
                        href={`/parent/day/${r.date}?child=${activeChildId}`}
                        className="flex items-center justify-between gap-2 min-h-10 text-sm"
                      >
                        <span className="text-muted-foreground">{formatDayGregorianAr(r.date)}</span>
                        <span className="flex shrink-0 items-center gap-1">
                          {attendanceOn && (
                            <span className={`rounded-lg border px-2 py-0.5 text-xs font-bold ${s?.light ?? 'bg-muted text-muted-foreground border-border'}`}>
                              {s?.label ?? r.attendanceStatus}
                            </span>
                          )}
                          <ChevronLeft className="size-4 text-muted-foreground" />
                        </span>
                      </Link>
                      {/* Below the link, never inside it: a button in a link
                          would open the day instead of the form. */}
                      {(excuse || excusable) && (
                        <div className="pb-2">
                          <ExcuseForm studentId={activeChildId} date={r.date} excuse={excuse} canWrite={excusable} />
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
          <div className="bg-card border border-border rounded-3xl p-5 shadow-sm">
            <h2 className="font-bold text-lg mb-3">آخر الدرجات</h2>
            {recentGrades.length === 0 ? (
              <p className="text-sm text-muted-foreground">لم تُرصد درجات بعد</p>
            ) : (
              <ul className="space-y-1.5">
                {recentGrades.map((g) => {
                  const pct = g.maxScore > 0 ? Math.round((g.score / g.maxScore) * 100) : 0
                  return (
                    <li key={g.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate">
                        <span className="font-semibold">{g.subjectName ?? 'مادة'}</span>
                        <span className="text-muted-foreground"> · {g.examName}</span>
                      </span>
                      <span className={`shrink-0 rounded-lg px-2 py-0.5 text-xs font-black ${pct >= 80 ? 'bg-emerald-50 text-emerald-700' : pct >= 50 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>
                        {g.score}/{g.maxScore}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* ── Class honour board ───────────────────────────────────────────────── */}
      {student.classId && !graduated && (
        <HonorBoard
          boards={buildHonorBoards(honorRows, student.id)}
          childFirstName={student.fullName.split(' ')[0]}
          classSize={classSize}
        />
      )}

      {/* ── Subject Cards ────────────────────────────────────────────────────── */}
      <div>
        <h2 className="font-bold text-lg mb-4">المواد الدراسية</h2>

        {subjectCards.length === 0 ? (
          <div className="text-center py-12 bg-card border border-border rounded-3xl">
            <div className="text-4xl mb-2">📚</div>
            <p className="text-muted-foreground text-sm">
              {graduated
                ? 'تخرّج الطالب — لا مواد دراسية حالية'
                : !classInfo
                ? 'لم يُحدَّد فصل لهذا الطالب بعد'
                : 'لم تُضَف مواد لهذا الفصل بعد'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {subjectCards.map(sub => {
              const subPts = sub.points
              const hasData = sub.presentCount > 0 || sub.absentCount > 0 || sub.excusedCount > 0 || subPts !== 0
              const card = (
                <>
                  {/* Subject header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="text-3xl">{subjectIcon(sub.name)}</div>
                      <div>
                        <h3 className="font-bold text-base leading-tight">{sub.name}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {sub.teacherName ? `أ. ${sub.teacherName}` : 'لم يُسند معلم'}
                        </p>
                      </div>
                    </div>
                    {/* Points badge */}
                    <div className={`px-3 py-1.5 rounded-xl text-sm font-black border shrink-0 ${
                      subPts > 0  ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                      subPts < 0  ? 'bg-red-50 text-red-700 border-red-200' :
                                    'bg-muted text-muted-foreground border-border'
                    }`}>
                      {subPts > 0 ? '+' : ''}{subPts} 🏆
                    </div>
                  </div>

                  {/* Stats */}
                  {hasData ? (
                    <div className="flex flex-wrap gap-4 mb-3">
                      <div className="flex items-center gap-1 text-xs text-emerald-600">
                        <span>✅</span>
                        <span className="font-semibold">{sub.presentCount} حضور</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-red-600">
                        <span>❌</span>
                        <span className="font-semibold">{sub.absentCount} غياب</span>
                      </div>
                      {sub.excusedCount > 0 && (
                        <div className="flex items-center gap-1 text-xs text-blue-600">
                          <span>📋</span>
                          <span className="font-semibold">{sub.excusedCount} إذن</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground mb-3">لا توجد بيانات مسجّلة بعد</p>
                  )}

                  {/* Latest note */}
                  {sub.latestNote && (
                    <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 text-xs text-amber-800">
                      <span className="font-semibold">📝 ملاحظة المعلم: </span>
                      {sub.latestNote}
                    </div>
                  )}
                </>
              )
              // A subject's page is its teacher's records. With nobody assigned
              // it only sends the family straight back here, so the card is not
              // a link and does not lift like one.
              if (!sub.teacherName) {
                return (
                  <div
                    key={sub.id}
                    className={`bg-card border border-border rounded-3xl p-5 shadow-sm ${!hasData ? 'opacity-60' : ''}`}
                  >
                    {card}
                  </div>
                )
              }
              return (
                <Link
                  key={sub.id}
                  href={`/parent/subject/${sub.id}?child=${activeChildId}`}
                  className={`block bg-card border rounded-3xl p-5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 ${
                    !hasData ? 'opacity-60 border-border' : 'border-border hover:border-primary/30'
                  }`}
                >
                  {card}
                </Link>
              )
            })}
          </div>
        )}
      </div>

      <div className="h-4" />
    </div>
  )
}
