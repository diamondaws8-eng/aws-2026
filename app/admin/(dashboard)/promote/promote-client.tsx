'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { NotificationBell } from '@/components/notification-bell'
import { transferStudents } from './actions'
import { setPromotionTarget, runAnnualPromotion, undoGraduation } from './actions-annual'
import {
  ArrowLeft, Users, CheckSquare, Square, Loader2, AlertTriangle,
  GraduationCap, Map as MapIcon, ArrowRightLeft, RotateCcw, ChevronDown,
} from 'lucide-react'

type ClassOption = {
  id: string
  name: string
  gradeName: string
  gradeOrder: number
  canEdit: boolean
  promotesToClassId: string | null
  isTerminal: boolean
}

type Student = { id: string; fullName: string; classId: string }
type Graduated = { id: string; fullName: string; graduationYear: string | null; graduatedAt: string | null }
type Tab = 'annual' | 'manual' | 'graduated'

export function PromoteClient({
  classes,
  students,
  canEdit,
  canRunAnnual,
  allClassLabels,
  studentsPerClass,
  graduated,
  unassignedCount,
}: {
  classes: ClassOption[]
  students: Student[]
  canEdit: boolean
  canRunAnnual: boolean
  allClassLabels: { id: string; label: string }[]
  studentsPerClass: Record<string, number>
  graduated: Graduated[]
  unassignedCount: number
}) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>(canRunAnnual ? 'annual' : 'manual')
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)

  const label = (c: ClassOption) => `${c.gradeName} — ${c.name}`
  const labelById = useMemo(
    () => new Map(allClassLabels.map((c) => [c.id, c.label])),
    [allClassLabels],
  )

  // ── Manual transfer ────────────────────────────────────────────────────────
  const [sourceId, setSourceId] = useState('')
  const [targetId, setTargetId] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  const inSource = useMemo(
    () => (sourceId ? students.filter((s) => s.classId === sourceId) : []),
    [students, sourceId],
  )

  const pickSource = (id: string) => {
    setSourceId(id)
    setSelected(new Set(students.filter((s) => s.classId === id).map((s) => s.id)))
    setNote(null)
    if (id === targetId) setTargetId('')
  }

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const allPicked = inSource.length > 0 && inSource.every((s) => selected.has(s.id))
  const source = classes.find((c) => c.id === sourceId)
  const target = classes.find((c) => c.id === targetId)

  const submitManual = async () => {
    if (!targetId || selected.size === 0) return
    setBusy(true)
    setNote(null)
    try {
      const res = await transferStudents([...selected], targetId)
      if (res.ok) {
        setNote({ ok: true, text: `تم نقل ${res.moved} طالباً إلى ${target ? label(target) : 'الفصل الجديد'} ✅` })
        setSelected(new Set()); setSourceId(''); setTargetId('')
        router.refresh()
      } else setNote({ ok: false, text: res.error })
    } catch {
      setNote({ ok: false, text: 'حدث خطأ غير متوقع' })
    } finally {
      setBusy(false)
    }
  }

  // ── The map ────────────────────────────────────────────────────────────────
  const [map, setMap] = useState(() =>
    Object.fromEntries(classes.map((c) => [c.id, { to: c.promotesToClassId, terminal: c.isTerminal }])),
  )
  const [savingRow, setSavingRow] = useState<string | null>(null)

  const saveRow = async (classId: string, to: string | null, terminal: boolean) => {
    setMap((m) => ({ ...m, [classId]: { to: terminal ? null : to, terminal } }))
    setSavingRow(classId)
    const revert = () => {
      const was = classes.find((c) => c.id === classId)
      setMap((m) => ({ ...m, [classId]: { to: was?.promotesToClassId ?? null, terminal: was?.isTerminal ?? false } }))
    }
    try {
      const res = await setPromotionTarget(classId, terminal ? null : to, terminal)
      if (!res.ok) {
        revert()
        setNote({ ok: false, text: res.error })
      } else {
        setNote(null)
        router.refresh()
      }
    } catch {
      revert()
      setNote({ ok: false, text: 'حدث خطأ غير متوقع — لم تُحفظ الوجهة' })
    } finally {
      setSavingRow(null)
    }
  }

  // ── Hold-backs and the run ─────────────────────────────────────────────────
  const [held, setHeld] = useState<Set<string>>(new Set())
  const [openClass, setOpenClass] = useState<string | null>(null)
  const [confirmPhrase, setConfirmPhrase] = useState('')
  const [running, setRunning] = useState(false)

  const plan = useMemo(() => {
    let moving = 0, graduating = 0, stuck = 0
    const noDestination: ClassOption[] = []
    for (const c of classes) {
      const n = (studentsPerClass[c.id] ?? 0) - students.filter((s) => s.classId === c.id && held.has(s.id)).length
      const m = map[c.id]
      if (m?.terminal) graduating += n
      else if (m?.to) moving += n
      else { stuck += n; if ((studentsPerClass[c.id] ?? 0) > 0) noDestination.push(c) }
    }
    return { moving, graduating, stuck, noDestination }
  }, [classes, map, studentsPerClass, students, held])

  const runReady = confirmPhrase.trim().toLowerCase() === 'ترحيل' || confirmPhrase.trim().toLowerCase() === 'tarheel'

  const doRun = async () => {
    setRunning(true)
    setNote(null)
    try {
      const res = await runAnnualPromotion([...held])
      if (res.ok) {
        setNote({
          ok: true,
          text: `انتهى الترحيل السنوي: انتقل ${res.moved} طالباً، وتخرّج ${res.graduated}، وبقي ${res.untouched} دون تغيير.`,
        })
        setHeld(new Set()); setConfirmPhrase('')
        router.refresh()
      } else setNote({ ok: false, text: res.error })
    } catch {
      setNote({ ok: false, text: 'حدث خطأ غير متوقع' })
    } finally {
      setRunning(false)
    }
  }

  const TABS: { key: Tab; label: string; icon: typeof MapIcon; show: boolean }[] = [
    { key: 'annual', label: 'الترحيل السنوي', icon: MapIcon, show: canRunAnnual },
    { key: 'manual', label: 'نقل يدوي', icon: ArrowRightLeft, show: true },
    { key: 'graduated', label: `المتخرجون (${graduated.length})`, icon: GraduationCap, show: true },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">ترحيل الطلاب</h1>
          <p className="text-muted-foreground mt-1">
            نقل الطلاب بين الفصول وترقيتهم في نهاية العام — سجلّ الأعوام السابقة لا يتحرك معهم.
          </p>
        </div>
        <NotificationBell />
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.filter((t) => t.show).map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setNote(null) }}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold ${
              tab === t.key ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/70'
            }`}
          >
            <t.icon className="size-4" />
            {t.label}
          </button>
        ))}
      </div>

      {!canEdit && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          حسابك للقراءة فقط — يمكنك الاطلاع دون تنفيذ أي نقل.
        </p>
      )}

      {note && (
        <p className={`rounded-2xl border p-4 text-sm ${
          note.ok ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'
        }`}>
          {note.text}
        </p>
      )}

      {/* ══ ANNUAL ══════════════════════════════════════════════════════════ */}
      {tab === 'annual' && canRunAnnual && (
        <>
          <div className="rounded-3xl border border-border bg-card p-6">
            <h2 className="text-lg font-bold mb-1.5">خريطة الترقية</h2>
            <p className="text-sm text-muted-foreground mb-5 leading-7">
              لكل فصل وجهة واحدة: الفصل الذي ينتقل إليه طلابه في نهاية العام. والوجهة قد تكون في مرحلة أخرى
              أو مبنى آخر — الثالث المتوسط إلى الأول الثانوي مثلاً. والفصل الأخير في المسار (الثالث الثانوي)
              يُعلَّم <span className="font-semibold text-foreground">«تخرّج»</span> فيغادر طلابه المدرسة بسجلّهم كاملاً.
              <br />
              تُضبط مرة واحدة، ثم تُستخدم كل عام.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead className="bg-muted text-muted-foreground text-xs">
                  <tr>
                    <th className="p-3 font-semibold">الفصل</th>
                    <th className="p-3 font-semibold">الطلاب</th>
                    <th className="p-3 font-semibold">ينتقلون إلى</th>
                    <th className="p-3 font-semibold text-center">تخرّج</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {classes.map((c) => {
                    const m = map[c.id] ?? { to: null, terminal: false }
                    const missing = !m.terminal && !m.to && (studentsPerClass[c.id] ?? 0) > 0
                    return (
                      <tr key={c.id} className={missing ? 'bg-amber-50/50' : ''}>
                        <td className="p-3 font-semibold whitespace-nowrap">{label(c)}</td>
                        <td className="p-3 text-muted-foreground">{studentsPerClass[c.id] ?? 0}</td>
                        <td className="p-3">
                          <select
                            value={m.to ?? ''}
                            disabled={m.terminal || savingRow === c.id}
                            onChange={(e) => saveRow(c.id, e.target.value || null, false)}
                            className="w-full min-w-56 p-2 rounded-lg border border-border bg-background text-sm disabled:opacity-40"
                          >
                            <option value="">— لم تُحدَّد —</option>
                            {allClassLabels.filter((o) => o.id !== c.id).map((o) => (
                              <option key={o.id} value={o.id}>{o.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            disabled={savingRow === c.id}
                            onClick={() => saveRow(c.id, null, !m.terminal)}
                            className="inline-flex items-center justify-center"
                            aria-label="تعليم الفصل كآخر صف"
                          >
                            {m.terminal
                              ? <CheckSquare className="size-5 text-primary" />
                              : <Square className="size-5 text-muted-foreground" />}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {plan.noDestination.length > 0 && (
              <p className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                <span>
                  {plan.noDestination.length} فصلاً فيه طلاب ولم تُحدَّد وجهته:{' '}
                  <span className="font-semibold">{plan.noDestination.map(label).join('، ')}</span>.
                  طلابه سيبقون مكانهم عند الترحيل.
                </span>
              </p>
            )}
          </div>

          {/* Hold-backs */}
          <div className="rounded-3xl border border-border bg-card p-6">
            <h2 className="text-lg font-bold mb-1.5">
              الطلاب المستثنون {held.size > 0 && <span className="text-primary">({held.size})</span>}
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              من يعيد السنة يبقى في فصله. افتح الفصل وحدّد أسماءهم — والباقي يُرحَّل.
            </p>
            <div className="space-y-2">
              {classes.filter((c) => (studentsPerClass[c.id] ?? 0) > 0).map((c) => {
                const open = openClass === c.id
                const inClass = students.filter((s) => s.classId === c.id)
                const heldHere = inClass.filter((s) => held.has(s.id)).length
                return (
                  <div key={c.id} className="rounded-2xl border border-border">
                    <button
                      type="button"
                      onClick={() => setOpenClass(open ? null : c.id)}
                      className="flex w-full items-center justify-between gap-3 p-3 text-right"
                    >
                      <span className="font-semibold text-sm">{label(c)}</span>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        {heldHere > 0 && <span className="font-bold text-primary">{heldHere} مستثنى</span>}
                        <ChevronDown className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} />
                      </span>
                    </button>
                    {open && (
                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 border-t border-border p-3">
                        {inClass.map((s) => {
                          const on = held.has(s.id)
                          return (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => setHeld((prev) => {
                                const next = new Set(prev)
                                if (next.has(s.id)) next.delete(s.id); else next.add(s.id)
                                return next
                              })}
                              className={`flex items-center gap-2 rounded-xl border p-2.5 text-right text-sm ${
                                on ? 'border-primary/40 bg-primary/5' : 'border-border hover:bg-muted/40'
                              }`}
                            >
                              {on ? <CheckSquare className="size-4 shrink-0 text-primary" /> : <Square className="size-4 shrink-0 text-muted-foreground" />}
                              <span className="truncate">{s.fullName}</span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Run */}
          <div className="rounded-3xl border border-border bg-card p-6">
            <h2 className="text-lg font-bold mb-4">تنفيذ الترحيل السنوي</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
              {[
                { label: 'سينتقلون', value: plan.moving, cls: 'text-emerald-600' },
                { label: 'سيتخرّجون', value: plan.graduating, cls: 'text-violet-600' },
                { label: 'سيبقون مكانهم', value: plan.stuck, cls: 'text-amber-600' },
                { label: 'مستثنون يدوياً', value: held.size, cls: 'text-muted-foreground' },
              ].map((s) => (
                <div key={s.label} className="rounded-2xl border border-border p-4">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className={`mt-1 text-2xl font-bold ${s.cls}`}>{s.value}</p>
                </div>
              ))}
            </div>

            <p className="mb-4 rounded-xl bg-muted/50 p-4 text-xs leading-7 text-muted-foreground">
              يُنفَّذ في عملية واحدة: إما أن ينجح كله أو لا يتغيّر شيء. وجهات كل الطلاب تُحسب من الوضع الحالي
              <span className="font-semibold text-foreground"> قبل </span>
              أي تعديل، فلا يُجَرّ صف عبر سلسلة الترقيات في نفس التنفيذ. والمتخرجون يحتفظون بكل سجلّهم.
              <br />
              <span className="font-semibold text-foreground">نفّذه مرة واحدة في نهاية العام فقط</span> — تنفيذه مرتين يرقّي الجميع مرتين.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                value={confirmPhrase}
                onChange={(e) => setConfirmPhrase(e.target.value)}
                placeholder="اكتب: ترحيل"
                className="w-48 p-3 rounded-xl border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                type="button"
                onClick={doRun}
                disabled={!canEdit || running || !runReady}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground disabled:opacity-40"
              >
                {running
                  ? <><Loader2 className="size-4 animate-spin" /> جاري التنفيذ...</>
                  : <><GraduationCap className="size-4" /> تنفيذ الترحيل السنوي</>}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ══ MANUAL ══════════════════════════════════════════════════════════ */}
      {tab === 'manual' && (
        <>
          <div className="rounded-3xl border border-border bg-card p-6">
            <div className="grid sm:grid-cols-[1fr_auto_1fr] gap-4 items-end">
              <div>
                <label className="block text-sm font-semibold mb-1.5">من فصل</label>
                <select
                  value={sourceId}
                  onChange={(e) => pickSource(e.target.value)}
                  className="w-full p-3 rounded-xl border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">— اختر الفصل الحالي —</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {label(c)} ({students.filter((s) => s.classId === c.id).length})
                    </option>
                  ))}
                </select>
              </div>
              <div className="hidden sm:flex items-center justify-center pb-3 text-muted-foreground">
                <ArrowLeft className="size-5" />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1.5">إلى فصل</label>
                <select
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  disabled={!sourceId}
                  className="w-full p-3 rounded-xl border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                >
                  <option value="">— اختر الفصل الجديد —</option>
                  {classes.filter((c) => c.id !== sourceId).map((c) => (
                    <option key={c.id} value={c.id}>{label(c)}</option>
                  ))}
                </select>
              </div>
            </div>

            {((source && !source.canEdit) || (target && !target.canEdit)) && (
              <p className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                <span>أحد الفصلين خارج المراحل التي تملك تعديلها — الخادم سيرفض النقل.</span>
              </p>
            )}
          </div>

          {sourceId && (
            <div className="rounded-3xl border border-border bg-card p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-lg font-bold">طلاب {source ? label(source) : ''}</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    الكل محدَّد. أزل تحديد من يبقى في فصله.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(allPicked ? new Set() : new Set(inSource.map((s) => s.id)))}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-sm font-semibold hover:bg-muted/70"
                >
                  {allPicked ? <Square className="size-4" /> : <CheckSquare className="size-4" />}
                  {allPicked ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
                </button>
              </div>

              {inSource.length === 0 ? (
                <p className="rounded-xl bg-muted/40 p-6 text-center text-sm text-muted-foreground">
                  لا يوجد طلاب في هذا الفصل.
                </p>
              ) : (
                <>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {inSource.map((s, i) => {
                      const on = selected.has(s.id)
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => toggle(s.id)}
                          className={`flex items-center gap-2.5 rounded-xl border p-3 text-right text-sm transition-colors ${
                            on ? 'border-primary/40 bg-primary/5' : 'border-border hover:bg-muted/40'
                          }`}
                        >
                          {on ? <CheckSquare className="size-4 shrink-0 text-primary" /> : <Square className="size-4 shrink-0 text-muted-foreground" />}
                          <span className="text-xs text-muted-foreground shrink-0">{i + 1}</span>
                          <span className="truncate font-semibold">{s.fullName}</span>
                        </button>
                      )
                    })}
                  </div>

                  <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border pt-5">
                    <span className="inline-flex items-center gap-2 text-sm">
                      <Users className="size-4 text-muted-foreground" />
                      <span className="font-bold">{selected.size}</span> من {inSource.length} محدَّد
                    </span>
                    <button
                      type="button"
                      onClick={submitManual}
                      disabled={!canEdit || busy || !targetId || selected.size === 0}
                      className="ms-auto inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
                    >
                      {busy
                        ? <><Loader2 className="size-4 animate-spin" /> جاري النقل...</>
                        : <>نقل {selected.size} طالباً {target ? `إلى ${label(target)}` : ''}</>}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}

      {/* ══ GRADUATED ═══════════════════════════════════════════════════════ */}
      {tab === 'graduated' && (
        <div className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-lg font-bold mb-1.5">المتخرجون</h2>
          <p className="text-sm text-muted-foreground mb-5 leading-7">
            غادروا الفصول ولم تُحذف بياناتهم: كل درجة وكل غياب وكل حالة سلوكية ما زالت محفوظة، ويمكن الرجوع
            إليها في أي وقت. ولا يظهرون في الفصول ولا في لوحة الصدارة ولا تصلهم إشعارات المدرسة.
          </p>

          {graduated.length === 0 ? (
            <p className="rounded-xl bg-muted/40 p-6 text-center text-sm text-muted-foreground">
              لا يوجد متخرجون بعد.
            </p>
          ) : (
            <div className="space-y-2">
              {graduated.map((g) => (
                <div key={g.id} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{g.fullName}</p>
                    <p className="text-xs text-muted-foreground">
                      تخرّج في العام {g.graduationYear ?? '—'}
                    </p>
                  </div>
                  {canRunAnnual && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const res = await undoGraduation(g.id)
                          setNote(res.ok
                            ? { ok: true, text: `أُعيد ${g.fullName} إلى فصله` }
                            : { ok: false, text: res.error })
                          if (res.ok) router.refresh()
                        } catch {
                          setNote({ ok: false, text: 'حدث خطأ غير متوقع' })
                        }
                      }}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-xs font-semibold hover:bg-muted/70"
                    >
                      <RotateCcw className="size-3.5" /> تراجع
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="rounded-2xl bg-muted/40 p-4 text-xs leading-7 text-muted-foreground">
        <span className="font-bold">ما الذي يتحرك وما الذي يبقى:</span> يتحرك مكان الطالب الحالي فقط.
        أما سجل الحضور والدرجات والنقاط للأعوام والفصول السابقة فيبقى مرتبطاً بالفصل الذي حدث فيه —
        فسجل العام الماضي يظل يُقرأ على أنه فصل العام الماضي.
        {unassignedCount > 0 && (
          <> <span className="font-bold text-amber-700">
            وهناك {unassignedCount} طالباً بلا فصل مسنَد لا يظهرون هنا — راجعهم في صفحة الطلاب.
          </span></>
        )}
      </p>
    </div>
  )
}
