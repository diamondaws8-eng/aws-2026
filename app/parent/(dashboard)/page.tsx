import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getMyChildren, getStudentDashboard } from './actions'
import { NotificationBell } from '@/components/notification-bell'
import { HonorBoard } from './honor-board'
import { getLeaderboard } from '@/lib/points'
import { db } from '@/lib/db'
import { students } from '@/lib/db/schema'
import { and, count, eq } from 'drizzle-orm'
import { ATTENDANCE_STATUS, formatDateAr } from '@/lib/utils'

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

  const activeChildId = params.child || children[0].id
  const dashboard     = await getStudentDashboard(activeChildId)
  if (!dashboard) redirect('/parent') // a child id that is not theirs — back to their own children, not to the login page

  const { student, classInfo, gradeName, totalPoints, attendance, subjectCards, possiblePoints, recentRecords, recentGrades } = dashboard
  const totalSessions = attendance.present + attendance.absent + attendance.late + attendance.excused
  const perf = getPerformanceRating(totalPoints, possiblePoints)

  // The class honour board, scoped to the child's own class only — the same
  // figures the administration's board uses, from the same year boundary.
  const [honorRows, classSize] = student.classId
    ? await Promise.all([
        getLeaderboard(student.schoolId, [student.classId]),
        db.select({ n: count() }).from(students)
          .where(and(eq(students.classId, student.classId), eq(students.status, 'active')))
          .then((r) => r[0]?.n ?? 0),
      ])
    : [[], 0]

  return (
    <div className="px-4 py-8 max-w-4xl mx-auto space-y-6">

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
                {child.className && (
                  <span className={`text-[11px] font-normal ${child.id === activeChildId ? 'opacity-80' : 'text-muted-foreground'}`}>
                    · {child.className}
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

      {/* ── Performance Card ─────────────────────────────────────────────────── */}
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

        {totalSessions > 0 && (
          <p className="text-xs text-muted-foreground text-center mt-3">
            أيام مسجَّلة في الحضور: {totalSessions} يوم
          </p>
        )}
      </div>

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
              <ul className="space-y-1.5">
                {recentRecords.map((r) => {
                  const s = ATTENDANCE_STATUS[r.attendanceStatus as keyof typeof ATTENDANCE_STATUS]
                  return (
                    <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-muted-foreground">{formatDateAr(r.date)}</span>
                      <span className={`rounded-lg border px-2 py-0.5 text-xs font-bold ${s?.light ?? 'bg-muted text-muted-foreground border-border'}`}>
                        {s?.label ?? r.attendanceStatus}
                      </span>
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
      {student.classId && (
        <HonorBoard
          rows={honorRows}
          childId={student.id}
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
              {!classInfo
                ? 'لم يُحدَّد فصل لهذا الطالب بعد'
                : 'لم تُضَف مواد لهذا الفصل بعد'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {subjectCards.map(sub => {
              const subPts = sub.points
              const hasData = sub.presentCount > 0 || sub.absentCount > 0 || sub.excusedCount > 0 || subPts !== 0
              return (
                <Link
                  key={sub.id}
                  href={`/parent/subject/${sub.id}?child=${activeChildId}`}
                  className={`block bg-card border rounded-3xl p-5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 ${
                    !hasData ? 'opacity-60 border-border' : 'border-border hover:border-primary/30'
                  }`}
                >
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
