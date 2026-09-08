'use client'

import { useState } from 'react'
import {
  resolveCasePrivately,
  dismissCase,
  informParent,
  escalateCase,
  getEscalationTargets,
} from './actions'
import { AlertTriangle, Clock, MessageSquare, ShieldCheck, ArrowUpCircle, XCircle, Loader2 } from 'lucide-react'

export type InboxCase = {
  id: string
  studentId: string
  studentName: string
  className: string | null
  gradeName: string | null
  subjectName: string | null
  teacherName: string
  teacherNote: string
  date: string
  createdAt: string
  isStale: boolean
  repeatCount: number
  repeatTeachers: number
}

type Decision = 'private' | 'parent' | 'escalate' | 'dismiss'

const DECISIONS: { key: Decision; label: string; hint: string; className: string }[] = [
  { key: 'private', label: 'أعالجها مع الطالب', hint: 'لن يُبلَّغ ولي الأمر', className: 'border-emerald-300 bg-emerald-50 text-emerald-800' },
  { key: 'parent', label: 'أبلغ ولي الأمر', hint: 'تكتب أنت نص الرسالة', className: 'border-amber-300 bg-amber-50 text-amber-800' },
  { key: 'escalate', label: 'أصعّدها', hint: 'تختار المسؤول بالاسم', className: 'border-blue-300 bg-blue-50 text-blue-800' },
  { key: 'dismiss', label: 'أغلقها', hint: 'لا يوجد ما يستدعي', className: 'border-slate-300 bg-slate-50 text-slate-700' },
]

export function CaseInbox({ cases }: { cases: InboxCase[] }) {
  const [openCase, setOpenCase] = useState<InboxCase | null>(null)

  return (
    <>
      <div className="space-y-3">
        {cases.map((c) => (
          <button
            key={c.id}
            onClick={() => setOpenCase(c)}
            className={`w-full text-right rounded-2xl border p-4 transition-colors hover:border-primary/40 ${
              c.isStale ? 'border-red-200 bg-red-50/50' : 'border-border bg-card'
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">{c.studentName}</span>
                  {c.className && (
                    <span className="text-xs text-muted-foreground">
                      {c.gradeName ? `${c.gradeName} — ` : ''}فصل {c.className}
                    </span>
                  )}
                  {c.repeatCount > 1 && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">
                      <AlertTriangle className="size-3" />
                      {c.repeatCount} حالات{c.repeatTeachers > 1 ? ` من ${c.repeatTeachers} معلمين` : ''}
                    </span>
                  )}
                  {c.isStale && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                      <Clock className="size-3" /> متأخرة
                    </span>
                  )}
                </div>
                <p className="text-sm text-foreground/90 mt-2 line-clamp-2">{c.teacherNote}</p>
                <p className="text-xs text-muted-foreground mt-1.5">
                  رفعها {c.teacherName}
                  {c.subjectName ? ` · ${c.subjectName}` : ''} · {c.date}
                </p>
              </div>
              <span className="shrink-0 text-xs font-bold text-primary">افتح القرار ←</span>
            </div>
          </button>
        ))}
      </div>

      {openCase && <CaseDecision c={openCase} onClose={() => setOpenCase(null)} />}
    </>
  )
}

function CaseDecision({ c, onClose }: { c: InboxCase; onClose: () => void }) {
  const [decision, setDecision] = useState<Decision | null>(null)
  const [note, setNote] = useState('')
  const [message, setMessage] = useState(
    `السلام عليكم ورحمة الله وبركاته\nولي أمر الطالب: ${c.studentName}\nنود إحاطتكم بملاحظة على سلوك الطالب اليوم، ونرجو المتابعة معه.\nوتقبلوا تحياتنا.`
  )
  const [targets, setTargets] = useState<{ userId: string; fullName: string; role: string }[]>([])
  const [targetId, setTargetId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const pick = async (d: Decision) => {
    setDecision(d)
    setError('')
    if (d === 'escalate' && targets.length === 0) {
      setBusy(true)
      try {
        setTargets(await getEscalationTargets(c.id))
      } catch {
        setError('تعذّر جلب قائمة المسؤولين')
      } finally {
        setBusy(false)
      }
    }
  }

  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      let res: { ok: boolean; error?: string }
      if (decision === 'private') res = await resolveCasePrivately(c.id, note)
      else if (decision === 'dismiss') res = await dismissCase(c.id, note)
      else if (decision === 'parent') res = await informParent(c.id, message, note)
      else if (decision === 'escalate') res = await escalateCase(c.id, targetId, note)
      else return

      if (!res.ok) {
        setError(res.error || 'تعذّر حفظ القرار')
        return
      }
      onClose()
    } catch {
      setError('حدث خطأ غير متوقع')
    } finally {
      setBusy(false)
    }
  }

  const ROLE_AR: Record<string, string> = {
    deputy: 'وكيل',
    principal: 'مدير مدرسة',
    quality_manager: 'مدير الجودة',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-background rounded-3xl border border-border shadow-xl w-full max-w-2xl max-h-[92vh] overflow-auto">
        <div className="p-4 border-b border-border flex items-center justify-between sticky top-0 bg-background">
          <div className="min-w-0">
            <h3 className="font-bold text-lg truncate">{c.studentName}</h3>
            <p className="text-xs text-muted-foreground">
              {c.gradeName ? `${c.gradeName} — ` : ''}{c.className ? `فصل ${c.className}` : ''} · رفعها {c.teacherName} · {c.date}
            </p>
          </div>
          <button onClick={onClose} className="size-8 rounded-full hover:bg-muted text-xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-5">
          <div className="rounded-2xl bg-muted/50 border border-border p-4">
            <p className="text-xs font-bold text-muted-foreground mb-1.5">ما كتبه المعلم</p>
            <p className="text-sm leading-7 whitespace-pre-wrap">{c.teacherNote}</p>
          </div>

          {c.repeatCount > 1 && (
            <div className="rounded-xl bg-violet-50 border border-violet-200 p-3 text-sm text-violet-900">
              هذا الطالب لديه <span className="font-bold">{c.repeatCount} حالات</span>
              {c.repeatTeachers > 1 ? ` رفعها ${c.repeatTeachers} معلمين مختلفين` : ''} — تعامل مع النمط لا مع الحادثة.
            </div>
          )}

          <div>
            <p className="text-sm font-bold mb-2">قرارك</p>
            <div className="grid grid-cols-2 gap-2">
              {DECISIONS.map((d) => (
                <button
                  key={d.key}
                  onClick={() => pick(d.key)}
                  className={`rounded-xl border p-3 text-right transition-all ${
                    decision === d.key ? `${d.className} ring-2 ring-primary/40` : 'border-border bg-card hover:bg-muted/50'
                  }`}
                >
                  <span className="block text-sm font-bold">{d.label}</span>
                  <span className="block text-[11px] text-muted-foreground mt-0.5">{d.hint}</span>
                </button>
              ))}
            </div>
          </div>

          {decision === 'escalate' && (
            <div>
              <label className="block text-sm font-bold mb-1.5">إلى مَن؟</label>
              <p className="text-xs text-muted-foreground mb-2">
                للمرحلة قد يكون أكثر من مسؤول — اختر الشخص الذي ستحال إليه الحالة بالاسم.
              </p>
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="w-full p-3 rounded-xl border border-border bg-background text-sm"
              >
                <option value="">— اختر المسؤول —</option>
                {targets.map((t) => (
                  <option key={t.userId} value={t.userId}>
                    {t.fullName} — {ROLE_AR[t.role] ?? t.role}
                  </option>
                ))}
              </select>
              {targets.length === 0 && !busy && (
                <p className="text-xs text-red-600 mt-1.5">لا يوجد مسؤول مسند لمرحلة هذا الطالب — راجع الإدارة.</p>
              )}
            </div>
          )}

          {decision === 'parent' && (
            <div>
              <label className="block text-sm font-bold mb-1.5">نص الرسالة لولي الأمر</label>
              <p className="text-xs text-muted-foreground mb-2">
                اكتبها بصياغتك. هذه هي الفائدة من مرور الحالة عليك.
              </p>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={6}
                className="w-full p-3 rounded-xl border border-border bg-background text-sm leading-7"
              />
            </div>
          )}

          {decision && (
            <div>
              <label className="block text-sm font-bold mb-1.5">
                ملاحظتك {decision === 'private' || decision === 'dismiss' ? '(مطلوبة)' : '(اختيارية)'}
              </label>
              <p className="text-xs text-muted-foreground mb-2">
                سرّية — لا يراها المعلم ولا ولي الأمر ولا الوكيل.
              </p>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="ما تم مع الطالب، وما يحتاج متابعة لاحقاً..."
                className="w-full p-3 rounded-xl border border-border bg-background text-sm"
              />
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 p-3 rounded-xl inline-flex items-center gap-2 w-full">
              <XCircle className="size-4 shrink-0" /> {error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              onClick={submit}
              disabled={!decision || busy || (decision === 'escalate' && !targetId)}
              className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-bold disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {busy ? <><Loader2 className="size-4 animate-spin" /> جاري الحفظ...</> : (
                <>
                  {decision === 'private' && <ShieldCheck className="size-4" />}
                  {decision === 'parent' && <MessageSquare className="size-4" />}
                  {decision === 'escalate' && <ArrowUpCircle className="size-4" />}
                  تأكيد القرار
                </>
              )}
            </button>
            <button onClick={onClose} className="px-5 rounded-xl bg-muted font-semibold">إلغاء</button>
          </div>
        </div>
      </div>
    </div>
  )
}
