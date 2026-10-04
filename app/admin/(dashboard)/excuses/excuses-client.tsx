'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { ATTENDANCE_STATUS, formatDayGregorianAr, arabicDigits, schoolDate, SCHOOL_TIME_ZONE } from '@/lib/utils'
import { EXCUSE_STATUS_LABELS, type ExcuseStatus } from '@/lib/excuse-rules'
import { decideAbsenceExcuse } from './actions-excuses'

export type ExcuseRow = {
  id: string
  studentName: string
  gradeName: string | null
  className: string | null
  date: string
  reason: string
  status: ExcuseStatus
  parentPhone: string | null
  createdAt: string
  decisionNote: string | null
  decidedByName: string | null
  decidedAt: string | null
  /** What the register says about the day now; null = no row for it. */
  dayStatus: string | null
  /** false = this account reads the stage but may not answer for it. */
  canDecide: boolean
}

const CHIP: Record<ExcuseStatus, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  accepted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
}

const stageOf = (r: ExcuseRow) => [r.gradeName, r.className].filter(Boolean).join(' — ') || 'بلا فصل'

/**
 * A moment on the school's clock: «الأحد ٤ أكتوبر · ١٤:٠٥». Put together by
 * hand for the reason formatDayGregorianAr is — 'ar-SA' prints Hijri, and the
 * server and the browser do not write a localised time the same way.
 */
function momentAr(iso: string): string {
  const at = new Date(iso)
  const time = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: SCHOOL_TIME_ZONE,
  }).format(at)
  return `${formatDayGregorianAr(schoolDate(at))} · ${arabicDigits(time)}`
}

export default function ExcusesClient({ rows }: { rows: ExcuseRow[] }) {
  const [done, setDone] = useState('')
  const pending = rows.filter((r) => r.status === 'pending')
  const decided = rows.filter((r) => r.status !== 'pending')

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="font-bold">بانتظار الرد</h2>
          <span className="text-sm text-muted-foreground">العدد: {arabicDigits(pending.length)}</span>
        </div>
        {/* Held here, not on the card: an answered excuse leaves this list, and
            its card with it. A refusal stays on the card, beside its buttons. */}
        {done && (
          <p className="mb-3 text-sm rounded-xl p-3 inline-flex items-center gap-2 w-full bg-emerald-50 text-emerald-700">
            <CheckCircle2 className="size-4 shrink-0" /> {done}
          </p>
        )}
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد أعذار بانتظار الرد</p>
        ) : (
          <div className="space-y-3">
            {pending.map((r) => (
              <PendingExcuse key={r.id} row={r} onDecided={setDone} />
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="font-bold mb-3">آخر ما رُدَّ عليه</h2>
        {decided.length === 0 ? (
          <p className="text-sm text-muted-foreground">لم يُرَدَّ على أي عذر بعد</p>
        ) : (
          <div className="space-y-2">
            {decided.map((r) => (
              <div key={r.id} className="rounded-xl border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-sm">{r.studentName}</span>
                  <span className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${CHIP[r.status]}`}>
                    {EXCUSE_STATUS_LABELS[r.status]}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {stageOf(r)} · {formatDayGregorianAr(r.date, true)}
                </p>
                <p className="text-sm mt-1.5 text-foreground/90 whitespace-pre-wrap">{r.reason}</p>
                {r.decisionNote && (
                  <p className="text-sm mt-1.5 whitespace-pre-wrap">
                    <span className="font-semibold">رد المدرسة: </span>{r.decisionNote}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  {r.decidedByName ? `ردّ عليه ${r.decidedByName}` : 'رُدَّ عليه'}
                  {r.decidedAt ? ` · ${momentAr(r.decidedAt)}` : ''}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function PendingExcuse({ row, onDecided }: { row: ExcuseRow; onDecided: (text: string) => void }) {
  const router = useRouter()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<'accept' | 'reject' | null>(null)
  const [error, setError] = useState('')

  const decide = async (accept: boolean) => {
    // The note is the family's only explanation of a refusal, so the refusal
    // does not leave without one. The action holds the same rule.
    if (!accept && !note.trim()) {
      setError('اكتب سبب عدم القبول — يصل لولي الأمر')
      return
    }
    setBusy(accept ? 'accept' : 'reject')
    setError('')
    try {
      const res = await decideAbsenceExcuse(row.id, accept, note, row.reason)
      if (!res.ok) {
        setError(res.error)
        // The family rewrote it: bring the new words onto the card.
        if (res.changed) router.refresh()
        return
      }
      onDecided(
        !accept ? `سُجِّل عدم قبول عذر ${row.studentName}`
        : res.excused ? `قُبل عذر ${row.studentName} وسُجِّل الغياب بعذر`
        : `قُبل عذر ${row.studentName} — اليوم لم يعد مسجَّلاً غياباً، فلم يتغيّر سجل الحضور`,
      )
      router.refresh()
    } catch {
      setError('حدث خطأ غير متوقع')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="rounded-xl border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-bold text-sm">{row.studentName}</span>
        <span className="text-xs text-muted-foreground">{stageOf(row)}</span>
      </div>
      <p className="text-sm font-semibold mt-1.5">غياب {formatDayGregorianAr(row.date, true)}</p>
      {/* The excuse was written about an absence; the day may not be one any
          more. Said before the buttons, so nobody accepts a day into «إذن»
          that the register has since moved somewhere else. */}
      {row.dayStatus !== 'absent' && (
        <p className="mt-1.5 text-xs leading-5 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 px-2.5 py-1.5">
          {row.dayStatus === 'excused'
            ? 'اليوم مسجَّل الآن «إذن» في سجل الحضور — القبول يُبلّغ ولي الأمر فقط.'
            : row.dayStatus
            ? `اليوم مسجَّل الآن «${ATTENDANCE_STATUS[row.dayStatus as keyof typeof ATTENDANCE_STATUS]?.label ?? row.dayStatus}» وليس غياباً — القبول لن يغيّر سجل الحضور.`
            : 'لا يوجد سجل حضور لهذا اليوم الآن — القبول لن يغيّر شيئاً في السجل.'}
        </p>
      )}
      <p className="text-sm mt-1.5 leading-7 text-foreground/90 whitespace-pre-wrap">{row.reason}</p>
      <p className="text-xs text-muted-foreground mt-2">
        أُرسل {momentAr(row.createdAt)}
        {row.parentPhone && <> · جوال ولي الأمر: <span dir="ltr">{row.parentPhone}</span></>}
      </p>

      {row.canDecide ? (
        <div className="mt-3 space-y-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={300}
            aria-label="رد المدرسة"
            placeholder="رد المدرسة — يصل لولي الأمر"
            className="w-full p-3 rounded-xl border border-border bg-background text-sm"
          />
          {error && (
            <p className="text-sm text-red-600 bg-red-50 p-3 rounded-xl inline-flex items-center gap-2 w-full">
              <XCircle className="size-4 shrink-0" /> {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => decide(true)}
              disabled={busy !== null}
              className="px-4 py-2.5 min-h-10 rounded-xl bg-emerald-600 text-white text-sm font-bold disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {busy === 'accept' ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} قبول العذر
            </button>
            <button
              type="button"
              onClick={() => decide(false)}
              disabled={busy !== null}
              className="px-4 py-2.5 min-h-10 rounded-xl border border-red-300 text-red-600 text-sm font-bold disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {busy === 'reject' ? <Loader2 className="size-4 animate-spin" /> : <XCircle className="size-4" />} عدم القبول
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground mt-3">
          حسابك للاطلاع فقط على هذه المرحلة — الرد متاح لمن يملك صلاحية التعديل.
        </p>
      )}
    </div>
  )
}
