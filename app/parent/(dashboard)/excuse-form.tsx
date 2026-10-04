'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { EXCUSE_MAX_LENGTH, EXCUSE_MIN_LENGTH, EXCUSE_STATUS_LABELS, type ExcuseStatus } from '@/lib/excuse-rules'
import { submitAbsenceExcuse } from './excuse-actions'

const CHIP: Record<ExcuseStatus, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  accepted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
}

/**
 * The excuse for one absent day, beside that day: sent, waiting, or answered.
 *
 * Kept on the day itself rather than on a page of its own — a parent who has
 * just read «غائب» is already looking at the place where the reason belongs.
 * Until the office answers, the reason can be rewritten; after that the answer
 * is shown and nothing here can change it.
 */
export function ExcuseForm({
  studentId,
  date,
  excuse,
  canWrite,
}: {
  studentId: string
  date: string
  excuse: { status: ExcuseStatus; reason: string; decisionNote: string | null } | null
  /**
   * false = the day can no longer take an excuse (it is past the window, or
   * the register no longer holds it as a plain absence): what was sent is
   * shown, and no button that the server could only refuse.
   */
  canWrite: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const decided = excuse?.status === 'accepted' || excuse?.status === 'rejected'

  const start = () => {
    setReason(excuse?.reason ?? '')
    setMsg(null)
    setOpen(true)
  }

  const send = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const res = await submitAbsenceExcuse(studentId, date, reason)
      if (!res.ok) {
        setMsg({ ok: false, text: res.error })
        // A refusal nearly always means this screen is behind — the office has
        // answered, or the day was corrected — so show the day as it is now.
        router.refresh()
        return
      }
      setOpen(false)
      setMsg({ ok: true, text: 'أُرسل العذر — سيصلك الرد في الإشعارات' })
      router.refresh()
    } catch {
      setMsg({ ok: false, text: 'حدث خطأ غير متوقع' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center gap-x-2">
        {excuse && (
          <span className={`rounded-lg border px-2 py-0.5 text-xs font-bold ${CHIP[excuse.status]}`}>
            {EXCUSE_STATUS_LABELS[excuse.status]}
          </span>
        )}
        {!decided && !open && canWrite && (
          <button
            type="button"
            onClick={start}
            className="inline-flex items-center min-h-10 px-1 text-xs font-bold text-primary underline underline-offset-4"
          >
            {excuse ? 'تعديل' : 'تقديم عذر'}
          </button>
        )}
      </div>

      {decided && excuse?.decisionNote && (
        <p className="mt-1 text-xs leading-5 text-muted-foreground whitespace-pre-wrap">رد المدرسة: {excuse.decisionNote}</p>
      )}

      {open && !decided && (
        <div className="mt-2 space-y-2">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={EXCUSE_MAX_LENGTH}
            aria-label="سبب الغياب"
            placeholder="مثال: مراجعة طبية — مرفق التقرير مع الطالب"
            className="w-full p-3 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={send}
              disabled={busy || reason.trim().length < EXCUSE_MIN_LENGTH}
              className="flex-1 min-h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-bold disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {busy ? <><Loader2 className="size-4 animate-spin" /> جاري الإرسال...</> : 'إرسال العذر'}
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); setMsg(null) }}
              disabled={busy}
              className="min-h-10 px-4 rounded-xl bg-muted text-sm font-semibold disabled:opacity-50"
            >
              إلغاء
            </button>
          </div>
        </div>
      )}

      {msg && !decided && (
        <p className={`mt-2 text-xs leading-5 rounded-xl p-2.5 ${msg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
          {msg.text}
        </p>
      )}
    </div>
  )
}
