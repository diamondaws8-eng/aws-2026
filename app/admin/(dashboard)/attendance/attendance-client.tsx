'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Save, Undo2, CheckCircle2, XCircle, CalendarX, UserCheck } from 'lucide-react'
import { ATTENDANCE_STATUS, wholePercents, formatDateAr, formatDayGregorianAr } from '@/lib/utils'
import { closedDayPhrase } from '@/lib/school-days'
import { periodOrdinal } from '@/lib/timetable-rules'
import { EmptyState } from '@/components/empty-state'
import { correctAttendance, type AttendanceStatus } from './actions-attendance'

export type RegisterRow = {
  id: string
  fullName: string
  /** null = nobody has recorded this pupil that day. */
  status: AttendanceStatus | null
  /** Who recorded the absence, already labelled («المعلم …» / «الإدارة (…)»). */
  owner: string | null
  ownerAt: string | null
}

/** One lesson of the picked teacher's day, as a chip that opens its class. */
export type LessonChip = {
  classId: string
  /** null = the class has no timetable yet, so the day cannot say which lesson. */
  period: number | null
  className: string
  subject: string
}

type Props = {
  /** Teachers holding a subject in a class this account may view, by name. */
  teachers: { id: string; name: string }[]
  /** The teacher whose day is shown; null = «الكل», every class as before. */
  teacherId: string | null
  /** That teacher's lessons on this date, in the order the day runs. Empty for «الكل». */
  lessons: LessonChip[]
  /** Every class in view — or, with a teacher picked, only that teacher's classes on this date. */
  classes: { id: string; label: string }[]
  classId: string | null
  date: string
  today: string
  /** Why this date is not a teaching day, when it is not. */
  dayOff: string | null
  rows: RegisterRow[]
  editable: boolean
}

const ORDER: AttendanceStatus[] = ['present', 'late', 'absent', 'excused']

export default function AttendanceClient({ teachers, teacherId, lessons, classes, classId, date, today, dayOff, rows, editable }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [changes, setChanges] = useState<Record<string, AttendanceStatus>>({})
  // null = the box has not been typed in, and shows whatever reason the screen
  // can honestly offer by itself (see offeredReason below).
  const [reason, setReason] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const teacher = teachers.find((t) => t.id === teacherId) ?? null
  // A closed day takes no new attendance — the action refuses it. What it does
  // take is a correction to a row written before the day was closed: a kept
  // register still counts, and an excuse can arrive after the fact.
  const hasRecorded = rows.some((r) => r.status !== null)
  const canCorrect = editable && (!dayOff || hasRecorded)
  // Nothing recorded on a teaching day: the office is not correcting anybody,
  // it is taking the register itself, and the screen says that instead.
  const taking = editable && !dayOff && rows.length > 0 && !hasRecorded

  const go = (next: { teacher?: string | null; classId?: string | null; date?: string }) => {
    const q = new URLSearchParams()
    const t = next.teacher === undefined ? teacherId : next.teacher
    const c = next.classId === undefined ? classId : next.classId
    const d = next.date ?? date
    if (t) q.set('teacher', t)
    // Kept across a change of teacher or day: the page stays on the class
    // when it is still on offer, and the server picks the first one when not.
    if (c) q.set('classId', c)
    q.set('date', d)
    // One tap on «تسجيل الكل حاضرين» makes thirty marks that exist only on
    // this screen. Leaving it throws them away, so leaving asks first.
    if (changed.length > 0 && !window.confirm(`لديك ${changed.length} تسجيلاً لم يُحفظ بعد في هذا الفصل. الانتقال يتركها — متابعة؟`)) return
    setChanges({})
    setMsg(null)
    startTransition(() => router.push(`/admin/attendance?${q.toString()}`))
  }

  const rowById = new Map(rows.map((r) => [r.id, r]))
  const counts = { present: 0, late: 0, absent: 0, excused: 0, none: 0 }
  for (const r of rows) {
    const s = changes[r.id] ?? r.status
    if (s) counts[s]++
    else counts.none++
  }
  const recorded = rows.length - counts.none
  const [inPct, outPct] = wholePercents([counts.present + counts.late, counts.absent + counts.excused], recorded)
  const changed = Object.keys(changes).filter((id) => {
    const row = rowById.get(id)
    return row && changes[id] !== row.status
  })

  /**
   * The reason the box opens with when the office takes a register for a
   * teacher: saying so is the whole reason, and typing it thirty times a term
   * is how a required field turns into «.».
   *
   * Offered only while it is true. Once a pending change touches a mark
   * somebody already recorded, this is a correction of that mark, and it needs
   * its own reason — the excuse that arrived, the pupil marked by mistake —
   * as it always did; a ready-made line there would file every correction
   * under a sentence nobody wrote.
   */
  const onlyNewMarks = changed.every((id) => rowById.get(id)?.status === null)
  const offeredReason = teacher && editable && !dayOff && rows.some((r) => r.status === null) && onlyNewMarks
    ? `تسجيل الحضور نيابةً عن المعلم ${teacher.name}`
    : ''
  const reasonText = reason ?? offeredReason

  const pick = (id: string, status: AttendanceStatus) => {
    const row = rowById.get(id)
    setChanges((c) => {
      const n = { ...c }
      if (row && row.status === status) delete n[id]
      else n[id] = status
      return n
    })
  }

  // The teacher's own first step: everyone present, then flip the few who are
  // not. Only pupils nobody has recorded, and not one the office has already
  // marked on this screen — a recorded absence is never swept back to present
  // by a button. Nothing is saved until «حفظ».
  const markRestPresent = () => {
    setChanges((c) => {
      const n = { ...c }
      for (const r of rows) if (r.status === null && n[r.id] === undefined) n[r.id] = 'present'
      return n
    })
  }

  const save = async () => {
    if (changed.length === 0) return
    // Read before the refresh: once the rows come back recorded, the screen is
    // a correction screen again and would thank the office for the wrong thing.
    const what = taking ? 'الحضور' : 'التصحيح'
    setBusy(true)
    setMsg(null)
    try {
      const res = await correctAttendance(
        classId!,
        date,
        changed.map((id) => ({ studentId: id, status: changes[id] })),
        reasonText,
        // Whom this screen showed as unrecorded: if a teacher recorded any of
        // them since it was loaded, the server leaves those as he wrote them.
        changed.filter((id) => rowById.get(id)?.status === null),
      )
      if (!res.ok) { setMsg({ ok: false, text: res.error }); return }
      setMsg({
        ok: true,
        text: `حُفظ ${what}: ${res.changed} طالب${res.notified ? ` — وأُبلغ ${res.notified} من أولياء الأمور` : ''}${res.skipped ? ` — و${res.skipped} سجّلهم المعلم في هذه الأثناء، فتُركوا كما سجّلهم` : ''}`,
      })
      setChanges({})
      setReason(null)
      startTransition(() => router.refresh())
    } catch {
      setMsg({ ok: false, text: `تعذّر حفظ ${what} — أعد المحاولة` })
    } finally {
      setBusy(false)
    }
  }

  // A teacher with nothing that day has no class to show a register for.
  const noLessons = !!teacher && classes.length === 0

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <label className="block text-sm font-semibold">
            المعلم
            <select
              value={teacherId ?? ''}
              onChange={(e) => go({ teacher: e.target.value || null })}
              className="mt-1.5 w-full h-11 rounded-xl border border-border bg-background px-3 text-sm"
            >
              <option value="">الكل</option>
              {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label className="block text-sm font-semibold">
            الفصل
            <select
              value={classId ?? ''}
              onChange={(e) => go({ classId: e.target.value || null })}
              disabled={noLessons}
              className="mt-1.5 w-full h-11 rounded-xl border border-border bg-background px-3 text-sm disabled:opacity-60"
            >
              {classes.length === 0 && <option value="">{teacher ? 'لا حصص في هذا اليوم' : 'لا توجد فصول ضمن صلاحيتك'}</option>}
              {classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
          <label className="block text-sm font-semibold">
            اليوم
            <input
              type="date"
              value={date}
              max={today}
              onChange={(e) => e.target.value && go({ date: e.target.value })}
              className="mt-1.5 w-full lg:w-48 h-11 rounded-xl border border-border bg-background px-3 text-sm"
            />
          </label>
        </div>

        {/* The picked teacher's day, lesson by lesson — a tap opens that class. */}
        {teacher && lessons.length > 0 && (
          <div className="border-t border-border pt-3">
            <p className="text-xs font-semibold text-muted-foreground">
              حصص المعلم {teacher.name} يوم {formatDayGregorianAr(date)} حسب الجدول
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {lessons.map((l) => {
                const active = l.classId === classId
                return (
                  <button
                    key={`${l.classId}|${l.period ?? 'none'}|${l.subject}`}
                    type="button"
                    aria-pressed={active}
                    onClick={() => { if (!active) go({ classId: l.classId }) }}
                    className={`min-h-10 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                      active
                        ? 'border-primary bg-primary/10 text-primary'
                        : `${l.period === null ? 'border-dashed ' : ''}border-border bg-background text-foreground hover:bg-muted`
                    }`}
                  >
                    {l.period === null ? 'بلا جدول' : periodOrdinal(l.period)} · {l.className} · {l.subject}
                  </button>
                )
              })}
            </div>
            {lessons.some((l) => l.period === null) && (
              <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                «بلا جدول»: فصل لم يُدخَل جدوله الأسبوعي بعد، فيبقى للمعلم في كل يوم دراسي.
              </p>
            )}
          </div>
        )}
      </div>

      {noLessons ? (
        <EmptyState
          icon={CalendarX}
          title={`لا حصص للمعلم ${teacher.name} في هذا اليوم حسب الجدول`}
          description={`${formatDayGregorianAr(date)} — غيِّر اليوم، أو اختر «الكل» في خانة المعلم لعرض كل الفصول.`}
        />
      ) : (
        <>
          {/* Day summary */}
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-bold">{formatDateAr(date)}{pending ? ' …' : ''}</p>
              <p className="text-sm text-muted-foreground">
                {recorded === 0
                  ? (dayOff ? `${closedDayPhrase(dayOff)} — لا سجل متوقع` : 'لم يسجّل أي معلم هذا اليوم بعد')
                  : `في المدرسة ${counts.present + counts.late} من ${recorded} (${inPct}%) · خارجها ${counts.absent + counts.excused} (${outPct}%)`}
              </p>
            </div>
            {/* The figures above take the place of the closed-day line once a row
                exists, and a day closed after it was recorded — a suspension
                declared at noon — would then read as an ordinary day with its
                correction column missing. */}
            {dayOff && recorded > 0 && (
              <p className="mt-3 text-sm rounded-xl p-3 inline-flex items-center gap-2 w-full bg-amber-50 text-amber-800">
                <CalendarX className="size-4 shrink-0" /> {closedDayPhrase(dayOff)} — يُصحَّح في هذا اليوم ما سُجِّل من قبل فقط، ولا يُضاف حضور جديد
              </p>
            )}
            <div className="flex flex-wrap gap-2 mt-3 text-xs font-semibold">
              {ORDER.map((s) => (
                <span key={s} className={`rounded-lg border px-2.5 py-1 ${ATTENDANCE_STATUS[s].light}`}>
                  {ATTENDANCE_STATUS[s].label} {counts[s]}
                </span>
              ))}
              {counts.none > 0 && (
                <span className="rounded-lg border border-border bg-muted px-2.5 py-1 text-muted-foreground">غير مسجَّل {counts.none}</span>
              )}
            </div>
          </div>

          {/* Register */}
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            {/* Only on an open day: a closed one takes no new attendance, and
                the action would refuse every row this button filled in. */}
            {editable && !dayOff && counts.none > 0 && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border p-3 sm:px-4">
                <p className="text-xs leading-6 text-muted-foreground">
                  {counts.none === rows.length ? 'لم يُسجَّل أحد في هذا الفصل بعد' : `${counts.none} لم يُسجَّلوا بعد`} — سجِّلهم حاضرين، ثم عدِّل الغائب والمتأخر واضغط «حفظ».
                </p>
                <button
                  type="button"
                  onClick={markRestPresent}
                  className="shrink-0 min-h-11 px-4 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm font-bold inline-flex items-center justify-center gap-2 hover:bg-emerald-100 transition-colors"
                >
                  <UserCheck className="size-4" /> تسجيل الكل حاضرين
                </button>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="hidden sm:table-cell px-3 py-3 text-center w-10">#</th>
                    <th className="px-3 py-3 text-right">الطالب</th>
                    <th className="px-3 py-3 text-right min-w-[180px]">المسجَّل</th>
                    {canCorrect && <th className="px-3 py-3 text-center min-w-[280px]">{taking ? 'التسجيل' : 'التصحيح'}</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.length === 0 && (
                    <tr><td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">لا يوجد طلاب في هذا الفصل</td></tr>
                  )}
                  {rows.map((r, i) => {
                    const next = changes[r.id]
                    const isChanged = next !== undefined && next !== r.status
                    return (
                      <tr key={r.id} className={isChanged ? 'bg-amber-50/40' : ''}>
                        <td className="hidden sm:table-cell px-3 py-2.5 text-center text-xs text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-2.5 font-semibold">{r.fullName}</td>
                        <td className="px-3 py-2.5">
                          {r.status ? (
                            <span className={`inline-block rounded-lg border px-2.5 py-1 text-xs font-semibold ${ATTENDANCE_STATUS[r.status].light}`}>
                              {ATTENDANCE_STATUS[r.status].label}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">غير مسجَّل</span>
                          )}
                          {r.owner && (
                            <p className="text-[11px] text-muted-foreground mt-1">
                              سجّله {r.owner}
                              {r.ownerAt ? ` · ${new Date(r.ownerAt).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Riyadh' })}` : ''}
                            </p>
                          )}
                        </td>
                        {canCorrect && dayOff && r.status === null && (
                          <td className="px-3 py-2.5 text-center text-xs text-muted-foreground">لا يُسجَّل في يوم مغلق</td>
                        )}
                        {canCorrect && !(dayOff && r.status === null) && (
                          <td className="px-3 py-2.5">
                            <div className="flex flex-wrap justify-center gap-1.5">
                              {ORDER.map((s) => {
                                const active = (next ?? r.status) === s
                                return (
                                  <button
                                    key={s}
                                    type="button"
                                    onClick={() => pick(r.id, s)}
                                    className={`rounded-lg border px-3 py-2 sm:py-1 min-h-10 sm:min-h-0 text-xs font-semibold transition-colors ${
                                      active ? ATTENDANCE_STATUS[s].light + ' ring-2 ring-offset-1 ring-primary/30' : 'border-border bg-background text-muted-foreground hover:bg-muted'
                                    }`}
                                  >
                                    {ATTENDANCE_STATUS[s].label}
                                  </button>
                                )
                              })}
                              {isChanged && (
                                <button
                                  type="button"
                                  onClick={() => setChanges((c) => { const n = { ...c }; delete n[r.id]; return n })}
                                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground underline underline-offset-2 min-h-10 sm:min-h-0"
                                >
                                  <Undo2 className="size-3" /> تراجع
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Save */}
          {canCorrect ? (
            <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <p className="text-xs leading-6 text-muted-foreground">
                {taking
                  ? 'لم يسجّل أحد هذا الفصل في هذا اليوم، فما تحفظه هنا هو سجل اليوم نفسه، ويُكتب باسمك في سجل التدقيق مع السبب. '
                  : 'تصحيح الإدارة هو الكلمة الأخيرة: يتجاوز قفل المعلم، ويُسجَّل باسمك في سجل التدقيق مع السبب. '}
                الغياب الذي تسجّله هنا لا يستطيع أي معلم إلغاءه، ويبقى له فقط تسجيل وصول الطالب متأخراً إن رآه.
                في يوم اليوم يصل ولي الأمر إشعار الغياب أو التصحيح كما يصله من المعلمين.
              </p>
              <label className="block text-sm font-semibold">
                {taking ? 'سبب التسجيل من الإدارة' : 'سبب التصحيح'} {changed.length > 0 && <span className="text-red-600">(مطلوب)</span>}
                <textarea
                  value={reasonText}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  maxLength={300}
                  placeholder={taking
                    ? 'مثال: المعلم غائب اليوم — أو: تعذّر على المعلم فتح النظام'
                    : 'مثال: وصل عذر طبي من ولي الأمر — أو: المعلم سجّل الطالب الخطأ'}
                  className="mt-1.5 w-full p-3 rounded-xl border border-border bg-background text-sm"
                />
              </label>
              {msg && (
                <p className={`text-sm rounded-xl p-3 inline-flex items-center gap-2 w-full ${msg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                  {msg.ok ? <CheckCircle2 className="size-4 shrink-0" /> : <XCircle className="size-4 shrink-0" />} {msg.text}
                </p>
              )}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <button
                  type="button"
                  onClick={save}
                  disabled={busy || changed.length === 0 || !reasonText.trim()}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl bg-primary text-primary-foreground font-bold disabled:opacity-50 inline-flex items-center justify-center gap-2"
                >
                  {busy
                    ? <><Loader2 className="size-4 animate-spin" /> جاري الحفظ...</>
                    : <><Save className="size-4" /> {taking ? 'حفظ الحضور' : 'حفظ التصحيحات'}{changed.length ? ` (${changed.length})` : ''}</>}
                </button>
                {/* One tap on «تسجيل الكل حاضرين» in the wrong class is thirty
                    pending marks; this is the way back that is not thirty taps. */}
                {changed.length > 1 && !busy && (
                  <button
                    type="button"
                    onClick={() => setChanges({})}
                    className="min-h-10 inline-flex items-center justify-center gap-1.5 text-sm text-muted-foreground underline underline-offset-2"
                  >
                    <Undo2 className="size-3.5" /> تراجع عن الكل
                  </button>
                )}
              </div>
            </div>
          ) : !editable && (
            <p className="text-xs text-muted-foreground">حسابك للاطلاع فقط على هذه المرحلة — التصحيح متاح لمن يملك صلاحية التعديل.</p>
          )}
        </>
      )}
    </div>
  )
}
