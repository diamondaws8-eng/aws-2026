'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eraser, Loader2, AlertTriangle, CheckCircle2, XCircle, Search } from 'lucide-react'
import { resetOperationalData, previewReset, type ResetScope } from '@/app/admin/(dashboard)/settings/actions-settings'
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
  students: 'الطلاب',
  parentAccounts: 'حسابات أولياء الأمور',
  teachers: 'المعلمون',
  staff: 'أعضاء فريق الإدارة',
  subjects: 'المواد',
  classes: 'الفصول',
  gradeLevels: 'المراحل',
  accounts: 'حسابات الدخول المحذوفة',
}

const SCOPE_OPTIONS: { key: keyof ResetScope; label: string; hint: string }[] = [
  { key: 'pupils', label: 'الطلاب وحسابات أولياء الأمور', hint: 'كل طالب مسجَّل الآن، ومعه حساب ولي أمره' },
  { key: 'teachers', label: 'المعلمون وحساباتهم', hint: 'تبقى أسماء المواد في الفصول بلا معلم مسند' },
  { key: 'staff', label: 'فريق الإدارة والموجهون (عدا المالك)', hint: 'الوكلاء والمديرون ومديرو الجودة والموجهون وحساباتهم' },
  { key: 'structure', label: 'المراحل والفصول والمواد', hint: 'يُعاد بناء الهيكل من الصفر — وتقويم المراحل الخاص يُحذف معها' },
]

/**
 * The switch from the trial to real use. Records always go; the owner picks
 * what else — the stand-in pupils, teachers, staff, even the structure — and
 * sees the exact counts before typing the phrase. One transaction: all or
 * nothing.
 */
export function ResetTestData() {
  const router = useRouter()
  const [scope, setScope] = useState<ResetScope>({ pupils: true, teachers: true, staff: false, structure: false })
  const [counts, setCounts] = useState<Record<string, number> | null>(null)
  const [phrase, setPhrase] = useState('')
  const [busy, setBusy] = useState<'preview' | 'run' | null>(null)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  const toggle = (k: keyof ResetScope) => { setScope((s) => ({ ...s, [k]: !s[k] })); setCounts(null) }

  const preview = async () => {
    setBusy('preview'); setResult(null)
    try {
      const res = await previewReset(scope)
      if (!res.ok) { setResult({ ok: false, text: res.error }); return }
      setCounts(res.counts)
    } catch { setResult({ ok: false, text: 'تعذّرت المعاينة' }) } finally { setBusy(null) }
  }

  const run = async () => {
    if (phrase.trim() !== RESET_PHRASE || !counts) return
    if (!window.confirm('سيُمسح ما ظهر في المعاينة ولا يمكن التراجع. هل حمّلت نسخة احتياطية أولاً؟')) return
    setBusy('run'); setResult(null)
    try {
      const res = await resetOperationalData(phrase, scope)
      if (!res.ok) { setResult({ ok: false, text: res.error }); return }
      const parts = Object.entries(res.removed).filter(([, n]) => n > 0).map(([k, n]) => `${LABELS[k] ?? k}: ${n}`)
      setResult({ ok: true, text: parts.length ? `تم المسح — ${parts.join('، ')}` : 'لم يكن هناك ما يُمسح' })
      setPhrase(''); setCounts(null)
      router.refresh()
    } catch { setResult({ ok: false, text: 'تعذّر المسح — أعد المحاولة' }) } finally { setBusy(null) }
  }

  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
      <h3 className="font-bold flex items-center gap-2 mb-1.5 text-red-800">
        <Eraser className="size-4" /> الانتقال من التجربة إلى التشغيل الفعلي
      </h3>
      <p className="text-sm leading-7 text-red-900/80">
        تُمسح دائماً سجلات التجربة: الحضور والحصص والنقاط والدرجات والحالات والتنبيهات والإشعارات.
        واختر ما يُمسح معها. يبقى في كل الأحوال: حساب المالك، وإعدادات النقاط والقوالب، والإجازات العامة، وسجل التدقيق.
      </p>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {SCOPE_OPTIONS.map((o) => (
          <label key={o.key} className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer ${scope[o.key] ? 'border-red-300 bg-white' : 'border-red-100 bg-white/60'}`}>
            <input type="checkbox" checked={scope[o.key]} onChange={() => toggle(o.key)} className="mt-1 size-4 accent-red-600" />
            <span>
              <span className="block text-sm font-semibold text-red-900">{o.label}</span>
              <span className="block text-xs text-red-900/70 mt-0.5">{o.hint}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={preview}
          disabled={busy !== null}
          className="inline-flex items-center gap-2 rounded-xl bg-white border border-red-300 px-4 py-2.5 text-sm font-bold text-red-800 disabled:opacity-50"
        >
          {busy === 'preview' ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} معاينة ما سيُمسح
        </button>
        <span className="text-xs text-red-900/70 inline-flex items-center gap-1.5">
          <AlertTriangle className="size-3.5" /> حمّل نسخة احتياطية أولاً — لا تراجع بعد المسح.
        </span>
      </div>

      {counts && (
        <div className="mt-4 rounded-xl bg-white border border-red-200 p-3">
          <p className="text-xs font-bold text-red-900 mb-2">سيُمسح بالضبط:</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(counts).map(([k, n]) => (
              <span key={k} className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-900">
                {LABELS[k] ?? k}: {n}
              </span>
            ))}
          </div>
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
          <button
            type="button"
            onClick={run}
            disabled={busy !== null || phrase.trim() !== RESET_PHRASE}
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-40"
          >
            {busy === 'run' ? <><Loader2 className="size-4 animate-spin" /> جاري المسح...</> : <><Eraser className="size-4" /> امسح الآن</>}
          </button>
        </div>
      )}

      {result && (
        <p className={`mt-3 text-sm rounded-xl p-3 inline-flex items-center gap-2 w-full ${result.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
          {result.ok ? <CheckCircle2 className="size-4 shrink-0" /> : <XCircle className="size-4 shrink-0" />} {result.text}
        </p>
      )}
    </div>
  )
}
