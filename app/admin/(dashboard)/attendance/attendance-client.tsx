'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Save, Undo2, CheckCircle2, XCircle } from 'lucide-react'
import { ATTENDANCE_STATUS, wholePercents, formatDateAr } from '@/lib/utils'
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

type Props = {
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

export default function AttendanceClient({ classes, classId, date, today, dayOff, rows, editable }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [changes, setChanges] = useState<Record<string, AttendanceStatus>>({})
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const go = (next: { classId?: string | null; date?: string }) => {
    const q = new URLSearchParams()
    const c = next.classId === undefined ? classId : next.classId
    const d = next.date ?? date
    if (c) q.set('classId', c)
    q.set('date', d)
    setChanges({})
    setMsg(null)
    startTransition(() => router.push(`/admin/attendance?${q.toString()}`))
  }

  const counts = { present: 0, late: 0, absent: 0, excused: 0, none: 0 }
  for (const r of rows) {
    const s = changes[r.id] ?? r.status
    if (s) counts[s]++
    else counts.none++
  }
  const recorded = rows.length - counts.none
  const [inPct, outPct] = wholePercents([counts.present + counts.late, counts.absent + counts.excused], recorded)
  const changed = Object.keys(changes).filter((id) => {
    const row = rows.find((r) => r.id === id)
    return row && changes[id] !== row.status
  })

  const pick = (id: string, status: AttendanceStatus) => {
    const row = rows.find((r) => r.id === id)
    setChanges((c) => {
      const n = { ...c }
      if (row && row.status === status) delete n[id]
      else n[id] = status
      return n
    })
  }

  const save = async () => {
    if (changed.length === 0) return
    setBusy(true)
    setMsg(null)
    try {
      const res = await correctAttendance(
        classId!,
        date,
        changed.map((id) => ({ studentId: id, status: changes[id] })),
        reason,
      )
      if (!res.ok) { setMsg({ ok: false, text: res.error }); return }
      setMsg({
        ok: true,
        text: `حُفظ التصحيح: ${res.changed} طالب${res.notified ? ` — وأُبلغ ${res.notified} من أولياء الأمور` : ''}`,
      })
      setChanges({})
      setReason('')
      startTransition(() => router.refresh())
    } catch {
      setMsg({ ok: false, text: 'تعذّر حفظ التصحيح — أعد المحاولة' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="rounded-2xl border border-border bg-card p-4 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
        <label className="block text-sm font-semibold">
          الفصل
          <select
            value={classId ?? ''}
            onChange={(e) => go({ classId: e.target.value || null })}
            className="mt-1.5 w-full h-11 rounded-xl border border-border bg-background px-3 text-sm"
          >
            {classes.length === 0 && <option value="">لا توجد فصول ضمن صلاحيتك</option>}
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
            className="mt-1.5 w-full sm:w-48 h-11 rounded-xl border border-border bg-background px-3 text-sm"
          />
        </label>
      </div>

      {/* Day summary */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-bold">{formatDateAr(date)}{pending ? ' …' : ''}</p>
          <p className="text-sm text-muted-foreground">
            {recorded === 0
              ? (dayOff ? `يوم إجازة (${dayOff}) — لا سجل متوقع` : 'لم يسجّل أي معلم هذا اليوم بعد')
              : `في المدرسة ${counts.present + counts.late} من ${recorded} (${inPct}%) · خارجها ${counts.absent + counts.excused} (${outPct}%)`}
          </p>
        </div>
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
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="hidden sm:table-cell px-3 py-3 text-center w-10">#</th>
                <th className="px-3 py-3 text-right">الطالب</th>
                <th className="px-3 py-3 text-right min-w-[180px]">المسجَّل</th>
                {editable && <th className="px-3 py-3 text-center min-w-[280px]">التصحيح</th>}
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
                    {editable && (
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
      {editable ? (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <p className="text-xs leading-6 text-muted-foreground">
            تصحيح الإدارة هو الكلمة الأخيرة: يتجاوز قفل المعلم، ويُسجَّل باسمك في سجل التدقيق مع السبب.
            الغياب الذي تسجّله هنا لا يستطيع أي معلم إلغاءه، ويبقى له فقط تسجيل وصول الطالب متأخراً إن رآه.
            في يوم اليوم يصل ولي الأمر إشعار الغياب أو التصحيح كما يصله من المعلمين.
          </p>
          <label className="block text-sm font-semibold">
            سبب التصحيح {changed.length > 0 && <span className="text-red-600">(مطلوب)</span>}
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              maxLength={300}
              placeholder="مثال: وصل عذر طبي من ولي الأمر — أو: المعلم سجّل الطالب الخطأ"
              className="mt-1.5 w-full p-3 rounded-xl border border-border bg-background text-sm"
            />
          </label>
          {msg && (
            <p className={`text-sm rounded-xl p-3 inline-flex items-center gap-2 w-full ${msg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
              {msg.ok ? <CheckCircle2 className="size-4 shrink-0" /> : <XCircle className="size-4 shrink-0" />} {msg.text}
            </p>
          )}
          <button
            type="button"
            onClick={save}
            disabled={busy || changed.length === 0 || !reason.trim()}
            className="w-full sm:w-auto px-6 py-3 rounded-xl bg-primary text-primary-foreground font-bold disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {busy ? <><Loader2 className="size-4 animate-spin" /> جاري الحفظ...</> : <><Save className="size-4" /> حفظ التصحيحات{changed.length ? ` (${changed.length})` : ''}</>}
          </button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">حسابك للاطلاع فقط على هذه المرحلة — التصحيح متاح لمن يملك صلاحية التعديل.</p>
      )}
    </div>
  )
}
