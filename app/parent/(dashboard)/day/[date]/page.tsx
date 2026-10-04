import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { requireParent } from '@/lib/parent-access'
import { getChildDay, type ChildDay } from '@/lib/parent-portal'
import { closedDayPhrase } from '@/lib/school-days'
import { ATTENDANCE_STATUS, formatDayGregorianAr, isValidDateString, today } from '@/lib/utils'

export const dynamic = 'force-dynamic'

type Pill = { label: string; emoji: string; tone: string }

// The subject page's words and tones, and the roster's for the two marks that
// page never showed. «na» has no entry on purpose: not asked for is not a mark.
const BEHAVIOR: Record<string, Pill> = {
  excellent: { label: 'سلوك ممتاز', emoji: '🌟', tone: 'text-emerald-700' },
  good:      { label: 'سلوك جيد', emoji: '👍', tone: 'text-blue-700' },
  normal:    { label: 'سلوك عادي', emoji: '😐', tone: 'text-muted-foreground' },
  issue:     { label: 'مشكلة سلوكية', emoji: '⚠️', tone: 'text-red-700' },
}
const HOMEWORK: Record<string, Pill> = {
  done:    { label: 'أنجز الواجب', emoji: '📝', tone: 'text-emerald-700' },
  missing: { label: 'لم ينجز الواجب', emoji: '❌', tone: 'text-red-700' },
}
const MATERIALS: Record<string, Pill> = {
  brought: { label: 'أحضر الأدوات', emoji: '🎒', tone: 'text-emerald-700' },
  missing: { label: 'لم يحضر الأدوات', emoji: '❌', tone: 'text-red-700' },
}
const PARTICIPATION: Record<string, Pill> = {
  active:   { label: 'مشارك', emoji: '🌟', tone: 'text-emerald-700' },
  inactive: { label: 'غير مشارك', emoji: '😴', tone: 'text-muted-foreground' },
}

/** One teacher's marks as pills — only for what the school has switched on. */
function pillsFor(lesson: ChildDay['lessons'][number], f: ChildDay['features']): Pill[] {
  const pills: (Pill | undefined)[] = [
    f.behavior !== false && lesson.behavior ? BEHAVIOR[lesson.behavior] : undefined,
    f.homework !== false && lesson.homeworkStatus ? HOMEWORK[lesson.homeworkStatus] : undefined,
    f.materials !== false && lesson.materialsStatus ? MATERIALS[lesson.materialsStatus] : undefined,
    f.participation !== false && lesson.participationStatus ? PARTICIPATION[lesson.participationStatus] : undefined,
  ]
  return pills.filter((p): p is Pill => !!p)
}

const signed = (n: number) => (n > 0 ? `+${n}` : String(n))

const pointsTone = (n: number) =>
  n > 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
  : n < 0 ? 'bg-red-50 text-red-700 border-red-200'
  : 'bg-muted text-muted-foreground border-border'

/**
 * One day of one child, as each teacher recorded it.
 *
 * The home page says «غائب» or «حاضر» beside a date and stops there. What a
 * parent asks next is what happened in that day — whose homework was missing,
 * who wrote the note — and every teacher's answer is already on file.
 */
export default async function ParentDayPage({
  params,
  searchParams,
}: {
  params: Promise<{ date: string }>
  searchParams: Promise<{ child?: string }>
}) {
  const { date } = await params
  const { child } = await searchParams

  const access = await requireParent()
  // Still on the starter password: the layout shows the password card, and
  // nothing about any child is read underneath it.
  if (access.mustChangePassword) return null

  if (typeof child !== 'string' || !isValidDateString(date) || date > today()) redirect('/parent')
  const day = await getChildDay(child, access.id, date)
  if (!day) redirect('/parent') // not their child — back to their own children

  const f = day.features
  // With attendance switched off the roster files every pupil as present; a
  // «حاضر» nobody took is not shown as one.
  const status = f.attendance !== false ? day.attendanceStatus : null
  const att = status ? ATTENDANCE_STATUS[status as keyof typeof ATTENDANCE_STATUS] : undefined

  // A row that says nothing — the empty one an absent day leaves behind, or
  // one holding only the marks of a feature since switched off — is not a
  // lesson to put in front of a parent.
  const lessons = day.lessons
    .map((l) => ({ ...l, pills: pillsFor(l, f) }))
    .filter((l) => l.pills.length > 0 || l.teacherNote || l.pointsEarned !== 0)

  // What is left of the total once the teachers' and the hand-given points are
  // taken out is the register's own point, so the page adds up to its total.
  const attendancePoints =
    day.totalPoints -
    day.lessons.reduce((sum, l) => sum + l.pointsEarned, 0) -
    day.manualPoints.reduce((sum, m) => sum + m.points, 0)
  const recorded = !!status || lessons.length > 0 || day.manualPoints.length > 0

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">

      {/* Back to the child they were looking at — bare /parent opens the first
          child, which for a family with several is usually somebody else. */}
      <Link
        href={`/parent?child=${child}`}
        className="inline-flex items-center gap-1 min-h-10 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowRight className="size-4" />
        العودة
      </Link>

      <div>
        <h1 className="text-2xl font-bold">{day.studentName}</h1>
        <p className="text-sm text-muted-foreground mt-1">{formatDayGregorianAr(day.date, true)}</p>
      </div>

      {/* ── Attendance, or why there is none ─────────────────────────────────── */}
      {status ? (
        <div className="bg-card border border-border rounded-3xl p-5 shadow-sm flex items-center justify-between gap-3">
          <h2 className="font-bold text-lg">الحضور</h2>
          <span className={`rounded-lg border px-3 py-1 text-sm font-bold ${att?.light ?? 'bg-muted text-muted-foreground border-border'}`}>
            {att?.label ?? status}
          </span>
        </div>
      ) : day.closedReason ? (
        <div className="bg-card border border-border rounded-3xl p-5 shadow-sm">
          <p className="text-sm font-semibold break-words">{closedDayPhrase(day.closedReason)}</p>
        </div>
      ) : f.attendance !== false ? (
        <div className="bg-card border border-border rounded-3xl p-5 shadow-sm">
          <p className="text-sm text-muted-foreground">لم يُسجَّل حضور هذا اليوم</p>
        </div>
      ) : null}

      {/* ── One card per teacher ─────────────────────────────────────────────── */}
      {lessons.map((l, i) => (
        <div key={i} className="bg-card border border-border rounded-3xl p-5 shadow-sm space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-bold text-base leading-tight">
                {l.teacherName ? `أ. ${l.teacherName}` : 'معلم غير محدد'}
              </h2>
              {l.subjects.length > 0 && (
                <p className="text-xs text-muted-foreground mt-0.5 break-words">{l.subjects.join('، ')}</p>
              )}
            </div>
            <div className={`px-3 py-1.5 rounded-xl text-sm font-black border shrink-0 ${pointsTone(l.pointsEarned)}`}>
              <span dir="ltr">{signed(l.pointsEarned)}</span> 🏆
            </div>
          </div>

          {l.pills.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {l.pills.map((p) => (
                <div key={p.label} className="px-2 py-1 rounded-lg border border-border bg-background text-xs font-semibold flex items-center gap-1">
                  <span>{p.emoji}</span>
                  <span className={p.tone}>{p.label}</span>
                </div>
              ))}
            </div>
          )}

          {l.teacherNote && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 text-sm leading-relaxed text-amber-800 whitespace-pre-wrap break-words">
              <span className="font-semibold">📝 ملاحظة المعلم: </span>
              {l.teacherNote}
            </div>
          )}
        </div>
      ))}

      {/* A closed day with nothing on it has already said why; «the teachers
          recorded nothing» under «يوم إجازة» would read as a complaint. */}
      {lessons.length === 0 && (status || !day.closedReason) && (
        <div className="text-center py-10 bg-card border border-border rounded-3xl">
          <div className="text-4xl mb-2">📭</div>
          <p className="text-muted-foreground text-sm">لم يسجّل المعلمون تقييماً في هذا اليوم</p>
        </div>
      )}

      {/* ── Points given by hand ─────────────────────────────────────────────── */}
      {day.manualPoints.length > 0 && (
        <div className="bg-card border border-border rounded-3xl p-5 shadow-sm">
          <h2 className="font-bold text-lg mb-3">نقاط إضافية</h2>
          <ul className="space-y-2">
            {day.manualPoints.map((m, i) => (
              <li key={i} className="flex items-start justify-between gap-3 text-sm">
                <span className="min-w-0">
                  <span className="block font-semibold break-words">{m.reason}</span>
                  {m.teacherName && (
                    <span className="block text-xs text-muted-foreground mt-0.5">أ. {m.teacherName}</span>
                  )}
                </span>
                <span dir="ltr" className={`shrink-0 font-black ${m.points > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {signed(m.points)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── The day's total ──────────────────────────────────────────────────── */}
      {recorded && (
        <div className="bg-card border border-border rounded-3xl p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-bold text-lg">مجموع نقاط اليوم</h2>
            <span dir="ltr" className="text-2xl font-black text-primary">{signed(day.totalPoints)}</span>
          </div>
          {attendancePoints !== 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              منها نقاط الحضور: <span dir="ltr">{signed(attendancePoints)}</span>
            </p>
          )}
        </div>
      )}

      <div className="h-4" />
    </div>
  )
}
