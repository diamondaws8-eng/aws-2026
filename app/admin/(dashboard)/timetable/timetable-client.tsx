'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle2, Eraser, Loader2, Minus, Plus, Save, XCircle } from 'lucide-react'
import { arabicDigits } from '@/lib/utils'
import {
  DEFAULT_PERIODS, MAX_PERIODS, WEEKDAY_NAMES, periodName, periodOrdinal, slotsFingerprint, type SlotInput,
} from '@/lib/timetable-rules'
import { saveClassTimetable } from './actions-timetable'

export type TimetableSubject = {
  id: string
  name: string
  teacherUserId: string | null
  teacherName: string | null
}

/** A lesson one of this class's teachers already has in another class. */
export type BusyElsewhere = { teacherUserId: string; weekday: number; period: number; classLabel: string }

type Props = {
  classes: { id: string; label: string; lessons: number }[]
  classId: string | null
  classLabel: string
  /** Weekday numbers, in the order the school week runs. */
  days: number[]
  subjects: TimetableSubject[]
  slots: SlotInput[]
  busy: BusyElsewhere[]
  editable: boolean
  /** How many of the listed classes already have a timetable. */
  scheduledCount: number
}

type Grid = Record<string, string>
const cellKey = (weekday: number, period: number) => `${weekday}|${period}`

function toGrid(slots: SlotInput[]): Grid {
  const g: Grid = {}
  for (const s of slots) g[cellKey(s.weekday, s.period)] = s.subjectId
  return g
}

function toSlots(g: Grid): SlotInput[] {
  return Object.keys(g).filter((k) => g[k]).map((k) => {
    const [weekday, period] = k.split('|').map(Number)
    return { weekday, period, subjectId: g[k] }
  })
}

/** The same grid always reads the same — and reads as the server reads the stored week. */
const fingerprint = (g: Grid) => slotsFingerprint(toSlots(g))

export default function TimetableClient({
  classes, classId, classLabel, days, subjects, slots, busy, editable, scheduledCount,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [grid, setGrid] = useState<Grid>(() => toGrid(slots))
  const [savedPrint, setSavedPrint] = useState(() => fingerprint(toGrid(slots)))
  const [periods, setPeriods] = useState(() => Math.max(DEFAULT_PERIODS, ...slots.map((s) => s.period)))
  const [day, setDay] = useState(days[0] ?? 0)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [clashes, setClashes] = useState<string[]>([])

  const dirty = fingerprint(grid) !== savedPrint

  // A week half typed in is easy to lose to a stray tap on another page. The
  // browser's own question covers a reload or a closed tab; a tap on the menu
  // is a move inside the app and never reaches it, so links are asked here.
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault() }
    const onLink = (e: MouseEvent) => {
      const link = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!link || link.target === '_blank' || e.defaultPrevented) return
      if (!window.confirm('في الجدول تعديلات لم تُحفظ. مغادرة الصفحة تتركها — متابعة؟')) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    window.addEventListener('beforeunload', warn)
    document.addEventListener('click', onLink, true)
    return () => {
      window.removeEventListener('beforeunload', warn)
      document.removeEventListener('click', onLink, true)
    }
  }, [dirty])

  const subjectById = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects])
  const busyAt = useMemo(() => {
    const m = new Map<string, string>()
    for (const b of busy) {
      const k = `${b.teacherUserId}|${b.weekday}|${b.period}`
      m.set(k, m.has(k) ? `${m.get(k)}، ${b.classLabel}` : b.classLabel)
    }
    return m
  }, [busy])

  const periodRows = Array.from({ length: periods }, (_, i) => i + 1)
  const filled = Object.keys(grid).filter((k) => grid[k])
  const lessonsOf = new Map<string, number>()
  for (const k of filled) lessonsOf.set(grid[k], (lessonsOf.get(grid[k]) ?? 0) + 1)
  // Subjects with a teacher that sit in no lesson. Two different cases: a
  // teacher the week never names at all — the timetable then says nothing
  // about them and the class stays theirs every day, which is rarely what was
  // meant — and a teacher who has other lessons in the class, for whom only
  // this one subject is missing.
  const leftOut = filled.length > 0 ? subjects.filter((s) => s.teacherUserId && !lessonsOf.has(s.id)) : []
  const named = new Set(filled.map((k) => subjectById.get(grid[k])?.teacherUserId).filter((v): v is string => !!v))
  const unnamedTeachers = leftOut.filter((s) => !named.has(s.teacherUserId as string))
  const missingSubjects = leftOut.filter((s) => named.has(s.teacherUserId as string))
  // A day with nothing written is a day the timetable is silent on.
  const emptyDays = filled.length > 0 ? days.filter((d) => !filled.some((k) => k.startsWith(`${d}|`))) : []
  const lastRowEmpty = days.every((d) => !grid[cellKey(d, periods)])

  const go = (nextClassId: string) => {
    if (nextClassId === classId) return
    if (dirty && !window.confirm('في الجدول تعديلات لم تُحفظ. الانتقال إلى فصل آخر يتركها — متابعة؟')) return
    startTransition(() => router.push(`/admin/timetable?classId=${nextClassId}`))
  }

  const setCell = (weekday: number, period: number, subjectId: string) => {
    setMsg(null)
    setGrid((g) => {
      const n = { ...g }
      if (subjectId) n[cellKey(weekday, period)] = subjectId
      else delete n[cellKey(weekday, period)]
      return n
    })
  }

  const clearAll = () => {
    if (filled.length === 0) return
    if (!window.confirm('تُمسح كل خانات الجدول من الشاشة. لا يتغيّر المحفوظ حتى تضغط «حفظ الجدول» — متابعة؟')) return
    setGrid({})
    setMsg(null)
  }

  const save = async () => {
    if (!classId) return
    setSaving(true)
    setMsg(null)
    setClashes([])
    try {
      const payload: SlotInput[] = toSlots(grid).filter((s) => s.period <= periods)
      const res = await saveClassTimetable(classId, payload, savedPrint)
      if (!res.ok) { setMsg({ ok: false, text: res.error }); return }
      setSavedPrint(fingerprint(toGrid(payload)))
      setGrid(toGrid(payload))
      setClashes(res.clashes)
      setMsg({
        ok: true,
        text: res.saved > 0
          ? `حُفظ جدول ${classLabel}: ${arabicDigits(res.saved)} حصة في الأسبوع`
          : `أُفرغ جدول ${classLabel} — يظهر الفصل لمعلميه كل يوم دراسي كما كان`,
      })
      startTransition(() => router.refresh())
    } catch {
      setMsg({ ok: false, text: 'تعذّر حفظ الجدول — أعد المحاولة' })
    } finally {
      setSaving(false)
    }
  }

  /** One lesson of the week: what is taught, by whom, and whether that teacher is elsewhere then. */
  const cell = (weekday: number, period: number) => {
    const subjectId = grid[cellKey(weekday, period)] ?? ''
    const subject = subjectById.get(subjectId)
    const elsewhere = subject?.teacherUserId ? busyAt.get(`${subject.teacherUserId}|${weekday}|${period}`) : undefined
    return (
      <div className="min-w-0">
        {editable ? (
          <select
            value={subjectId}
            onChange={(e) => setCell(weekday, period, e.target.value)}
            // A cell changed while the week is on its way to the server would
            // be overwritten by what was sent, and shown as saved.
            disabled={saving}
            aria-label={`${WEEKDAY_NAMES[weekday]} — ${periodName(period)}`}
            className={`w-full h-10 rounded-lg border px-2 text-sm bg-background ${subjectId ? 'border-primary/40 font-semibold' : 'border-border text-muted-foreground'}`}
          >
            <option value="">—</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.name}{s.teacherName ? ` — ${s.teacherName}` : ' — بلا معلم'}</option>
            ))}
          </select>
        ) : (
          <p className={`text-sm ${subject ? 'font-semibold' : 'text-muted-foreground'}`}>{subject?.name ?? '—'}</p>
        )}
        {subject && (
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {subject.teacherName ? `أ. ${subject.teacherName}` : 'بلا معلم مسند'}
          </p>
        )}
        {elsewhere && (
          <p className="mt-0.5 text-[11px] leading-4 text-amber-700">له حصة في {elsewhere}</p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Which class */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <label className="block text-sm font-semibold">
          الفصل
          <select
            value={classId ?? ''}
            onChange={(e) => e.target.value && go(e.target.value)}
            className="mt-1.5 w-full h-11 rounded-xl border border-border bg-background px-3 text-sm"
          >
            {classes.length === 0 && <option value="">لا توجد فصول ضمن صلاحيتك</option>}
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label} · {c.lessons > 0 ? `${arabicDigits(c.lessons)} حصة` : 'بلا جدول'}
              </option>
            ))}
          </select>
        </label>
        {classes.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {arabicDigits(scheduledCount)} من {arabicDigits(classes.length)} فصلاً لها جدول{pending ? ' …' : ''}
          </p>
        )}
      </div>

      {classId && subjects.length === 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-900">
          لا مواد في هذا الفصل بعد. أضف مواده وأسند لكل مادة معلمها من{' '}
          <Link href="/admin/grade-levels" className="font-bold underline underline-offset-4">المراحل والفصول</Link>
          ، ثم عُد لتوزيعها على حصص الأسبوع.
        </div>
      )}

      {classId && subjects.length > 0 && (
        <>
          {filled.length === 0 && savedPrint === '' && (
            <p className="rounded-2xl border border-border bg-muted/40 p-4 text-sm leading-7 text-muted-foreground">
              هذا الفصل بلا جدول بعد، فيظهر لكل معلميه في كل يوم دراسي. بعد حفظ جدوله يظهر لكل معلم في أيام حصصه فقط.
            </p>
          )}

          {/* Phone: one day at a time. A six-column grid of menus cannot be used at 375px. */}
          <div className="md:hidden rounded-2xl border border-border bg-card p-4">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {days.map((d) => {
                const count = periodRows.filter((p) => grid[cellKey(d, p)]).length
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDay(d)}
                    className={`shrink-0 min-h-10 rounded-xl border px-3 text-sm font-semibold ${d === day ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground'}`}
                  >
                    {WEEKDAY_NAMES[d]}
                    <span className="mr-1 text-[11px] font-normal opacity-80">{arabicDigits(count)}</span>
                  </button>
                )
              })}
            </div>
            <ul className="mt-3 space-y-3">
              {periodRows.map((p) => (
                <li key={p} className="grid grid-cols-[5.75rem_1fr] items-start gap-2">
                  <span className="pt-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">{periodName(p)}</span>
                  {cell(day, p)}
                </li>
              ))}
            </ul>
          </div>

          {/* Wider screens: the whole week at once. */}
          <div className="hidden md:block rounded-2xl border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm table-fixed">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="w-24 px-3 py-3 text-right">الحصة</th>
                    {days.map((d) => <th key={d} className="px-2 py-3 text-right">{WEEKDAY_NAMES[d]}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {periodRows.map((p) => (
                    <tr key={p} className="align-top">
                      <td className="px-3 py-3 text-xs font-semibold text-muted-foreground">{periodOrdinal(p)}</td>
                      {days.map((d) => <td key={d} className="px-2 py-2">{cell(d, p)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* What the week adds up to */}
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-sm font-bold">
              حصص الأسبوع: {arabicDigits(filled.length)}
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
              {subjects.map((s) => {
                const n = lessonsOf.get(s.id) ?? 0
                return (
                  <span key={s.id} className={`rounded-lg border px-2.5 py-1 ${n > 0 ? 'border-primary/30 bg-primary/5 text-foreground' : 'border-border bg-muted text-muted-foreground'}`}>
                    {s.name} {arabicDigits(n)}
                  </span>
                )
              })}
            </div>
            {unnamedTeachers.length > 0 && (
              <p className="mt-3 text-xs leading-6 rounded-xl p-3 inline-flex items-start gap-2 w-full bg-amber-50 text-amber-800">
                <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                <span>
                  مواد لها معلم ولم تُدرَج في أي حصة: {unnamedTeachers.map((s) => `${s.name}${s.teacherName ? ` (${s.teacherName})` : ''}`).join('، ')}.
                  الجدول لا يذكر معلميها في هذا الفصل، فيبقى يظهر لهم كل يوم كما كان حتى تُدرَج حصصهم.
                </span>
              </p>
            )}
            {missingSubjects.length > 0 && (
              <p className="mt-3 text-xs leading-6 text-muted-foreground">
                مواد لم تُدرَج في أي حصة (لمعلمها حصص أخرى في الفصل): {missingSubjects.map((s) => s.name).join('، ')}.
              </p>
            )}
            {emptyDays.length > 0 && (
              <p className="mt-3 text-xs leading-6 rounded-xl p-3 inline-flex items-start gap-2 w-full bg-amber-50 text-amber-800">
                <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                <span>
                  أيام بلا حصص مكتوبة: {emptyDays.map((d) => WEEKDAY_NAMES[d]).join('، ')}.
                  في هذه الأيام يبقى الفصل لكل معلميه كما كان قبل الجدول — أكمِلها ليرى كلٌّ حصته فقط.
                </span>
              </p>
            )}
          </div>

          {editable ? (
            <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setPeriods((n) => Math.min(MAX_PERIODS, n + 1))}
                  disabled={periods >= MAX_PERIODS || saving}
                  className="inline-flex items-center gap-1.5 min-h-10 rounded-xl border border-border bg-background px-3 text-sm font-semibold disabled:opacity-50"
                >
                  <Plus className="size-4" /> حصة
                </button>
                <button
                  type="button"
                  onClick={() => setPeriods((n) => Math.max(1, n - 1))}
                  disabled={periods <= 1 || !lastRowEmpty || saving}
                  title={lastRowEmpty ? undefined : 'أفرغ خانات الحصة الأخيرة أولاً'}
                  className="inline-flex items-center gap-1.5 min-h-10 rounded-xl border border-border bg-background px-3 text-sm font-semibold disabled:opacity-50"
                >
                  <Minus className="size-4" /> حصة
                </button>
                <button
                  type="button"
                  onClick={clearAll}
                  disabled={filled.length === 0 || saving}
                  className="inline-flex items-center gap-1.5 min-h-10 rounded-xl border border-border bg-background px-3 text-sm font-semibold text-red-600 disabled:opacity-50"
                >
                  <Eraser className="size-4" /> مسح الجدول
                </button>
              </div>

              {msg && (
                <p className={`text-sm rounded-xl p-3 inline-flex items-center gap-2 w-full ${msg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                  {msg.ok ? <CheckCircle2 className="size-4 shrink-0" /> : <XCircle className="size-4 shrink-0" />} {msg.text}
                </p>
              )}
              {clashes.length > 0 && (
                <div className="text-sm rounded-xl p-3 bg-amber-50 text-amber-800">
                  <p className="font-bold inline-flex items-center gap-2"><AlertTriangle className="size-4 shrink-0" /> معلم في فصلين في الحصة نفسها — حُفظ الجدول، فراجعه إن لم يكن مقصوداً:</p>
                  <ul className="mt-1.5 list-disc pr-5 space-y-0.5 text-xs leading-6">
                    {clashes.map((c) => <li key={c}>{c}</li>)}
                  </ul>
                </div>
              )}

              <button
                type="button"
                onClick={save}
                disabled={saving || !dirty}
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-primary text-primary-foreground font-bold disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {saving ? <><Loader2 className="size-4 animate-spin" /> جاري الحفظ...</> : <><Save className="size-4" /> حفظ الجدول</>}
              </button>
              {dirty && !saving && <p className="text-xs text-amber-700">تعديلات لم تُحفظ بعد.</p>}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">حسابك للاطلاع فقط على هذه المرحلة — كتابة الجدول متاحة لمن يملك صلاحية التعديل عليها.</p>
          )}
        </>
      )}
    </div>
  )
}
