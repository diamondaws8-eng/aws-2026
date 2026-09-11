'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eraser, Loader2, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import { resetOperationalData } from '@/app/admin/(dashboard)/settings/actions-settings'
import { RESET_PHRASE } from '@/app/admin/(dashboard)/settings/settings-types'

const LABELS: Record<string, string> = {
  dailyRecords: 'سجلات الحضور',
  lessonRecords: 'سجلات الحصص',
  studentPoints: 'النقاط اليدوية',
  gradeEntries: 'الدرجات',
  behaviorCases: 'الحالات السلوكية',
  userNotifications: 'إشعارات الجرس',
  notifications: 'التنبيهات',
  parentWhatsappMessages: 'رسائل الواتساب المسجَّلة',
  parentActivationLog: 'سجل التفعيل',
  attendance: 'الحضور القديم',
}

/**
 * The one-time switch from practising to real use. Owner only; the phrase
 * must be typed, not pasted from a tooltip, and the result lists exactly what
 * went so nobody wonders.
 */
export function ResetTestData() {
  const router = useRouter()
  const [phrase, setPhrase] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  const run = async () => {
    if (phrase.trim() !== RESET_PHRASE) return
    if (!window.confirm('سيُمسح كل ما سُجّل أثناء التجربة ولا يمكن التراجع. هل حمّلت نسخة احتياطية أولاً؟')) return
    setBusy(true)
    setResult(null)
    try {
      const res = await resetOperationalData(phrase)
      if (!res.ok) { setResult({ ok: false, text: res.error }); return }
      const parts = Object.entries(res.removed).filter(([, n]) => n > 0).map(([k, n]) => `${LABELS[k] ?? k}: ${n}`)
      setResult({ ok: true, text: parts.length ? `تم المسح — ${parts.join('، ')}` : 'لم يكن هناك ما يُمسح' })
      setPhrase('')
      router.refresh()
    } catch {
      setResult({ ok: false, text: 'تعذّر المسح — أعد المحاولة' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
      <h3 className="font-bold flex items-center gap-2 mb-1.5 text-red-800">
        <Eraser className="size-4" /> مسح بيانات التجربة قبل التشغيل الفعلي
      </h3>
      <p className="text-sm leading-7 text-red-900/80">
        يمسح كل ما سُجّل أثناء التجربة: الحضور والحصص والنقاط والدرجات والحالات السلوكية والتنبيهات والإشعارات.
        يبقى الهيكل كما هو: المراحل والفصول والطلاب والمعلمون وفريق الإدارة والتقويم والإعدادات وحسابات الدخول.
        للمالك وحده، ويُسجَّل في سجل التدقيق.
      </p>
      <p className="mt-3 text-xs font-semibold text-red-800 inline-flex items-center gap-1.5">
        <AlertTriangle className="size-3.5" /> حمّل نسخة احتياطية أولاً — لا تراجع بعد المسح.
      </p>
      <label className="block mt-4 text-sm font-semibold text-red-900">
        اكتب العبارة التالية للتأكيد: <span className="font-mono">{RESET_PHRASE}</span>
        <input
          type="text"
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          className="mt-2 w-full h-11 rounded-xl border border-red-200 bg-background px-3 text-sm"
          placeholder={RESET_PHRASE}
        />
      </label>
      {result && (
        <p className={`mt-3 text-sm rounded-xl p-3 inline-flex items-center gap-2 w-full ${result.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
          {result.ok ? <CheckCircle2 className="size-4 shrink-0" /> : <XCircle className="size-4 shrink-0" />} {result.text}
        </p>
      )}
      <button
        type="button"
        onClick={run}
        disabled={busy || phrase.trim() !== RESET_PHRASE}
        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-40"
      >
        {busy ? <><Loader2 className="size-4 animate-spin" /> جاري المسح...</> : <><Eraser className="size-4" /> امسح بيانات التجربة</>}
      </button>
    </div>
  )
}
