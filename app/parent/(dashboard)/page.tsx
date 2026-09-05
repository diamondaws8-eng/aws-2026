import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getMyChildren, getStudentDashboard } from './actions'

function getPerformanceRating(points: number, totalSessions: number) {
  if (totalSessions === 0) {
    return { label: 'لا توجد بيانات', color: 'text-muted-foreground', bg: 'bg-muted', border: 'border-border', bar: 'bg-muted', pct: 0 }
  }
  const avg = points / totalSessions
  if (avg >= 2.5) return { label: 'ممتاز 🌟',        color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', bar: 'bg-emerald-500', pct: 100 }
  if (avg >= 1.5) return { label: 'جيد جداً ✅',     color: 'text-blue-600',   bg: 'bg-blue-50',   border: 'border-blue-200',   bar: 'bg-blue-500',   pct: 80  }
  if (avg >= 0.5) return { label: 'جيد 👍',           color: 'text-amber-600',  bg: 'bg-amber-50',  border: 'border-amber-200',  bar: 'bg-amber-500',  pct: 60  }
  if (avg >= -0.5)return { label: 'يحتاج متابعة ⚠️', color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200', bar: 'bg-orange-500', pct: 40  }
  return            { label: 'يحتاج اهتماماً 🔴',    color: 'text-red-600',    bg: 'bg-red-50',    border: 'border-red-200',    bar: 'bg-red-400',    pct: 20  }
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
  if (!dashboard) redirect('/parent/login')

  const { student, classInfo, gradeName, totalPoints, attendance, subjectCards } = dashboard
  const totalSessions = attendance.present + attendance.absent + attendance.late + attendance.excused
  const perf = getPerformanceRating(totalPoints, totalSessions)

  return (
    <div className="px-4 py-8 max-w-4xl mx-auto space-y-6">

      {/* ── Child Switcher ───────────────────────────────────────────────────── */}
      {children.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {children.map(child => (
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
              {child.fullName.split(' ')[0]}
            </a>
          ))}
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
        <div className={`px-4 py-2 rounded-2xl border text-sm font-bold ${perf.bg} ${perf.border} ${perf.color}`}>
          {perf.label}
        </div>
      </div>

      {/* ── Performance Card ─────────────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-3xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg">الأداء العام</h2>
          <div className="text-3xl font-black text-primary">
            {totalPoints > 0 ? '+' : ''}{totalPoints}
            <span className="text-sm font-normal text-muted-foreground mr-1">نقطة</span>
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
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'حضور حصة', value: attendance.present,  emoji: '✅', color: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
            { label: 'غياب حصة', value: attendance.absent,   emoji: '❌', color: 'text-red-600 bg-red-50 border-red-100' },
            { label: 'تأخر',     value: attendance.late,     emoji: '⏰', color: 'text-amber-600 bg-amber-50 border-amber-100' },
            { label: 'إذن',      value: attendance.excused,  emoji: '📋', color: 'text-blue-600 bg-blue-50 border-blue-100' },
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
            إجمالي الحصص المسجّلة: {totalSessions} حصة
          </p>
        )}
      </div>

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
              const hasData = sub.presentCount > 0 || sub.absentCount > 0 || subPts !== 0
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
                    <div className="flex gap-4 mb-3">
                      <div className="flex items-center gap-1 text-xs text-emerald-600">
                        <span>✅</span>
                        <span className="font-semibold">{sub.presentCount} حضور</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-red-600">
                        <span>❌</span>
                        <span className="font-semibold">{sub.absentCount} غياب</span>
                      </div>
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
