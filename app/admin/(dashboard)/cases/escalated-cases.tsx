'use client'

import { useState } from 'react'
import { adminHandleCase, adminInformParent, returnCaseToCounselor, getCaseParentContact } from './actions-cases'
import { CheckCircle2, MessageSquare, Undo2, XCircle, Loader2, Phone } from 'lucide-react'

export type EscalatedCase = {
  id: string
  studentName: string
  className: string | null
  gradeName: string | null
  teacherName: string
  teacherNote: string
  date: string
  escalatedToName: string | null
}

type Choice = 'handled' | 'parent' | 'return'

const CHOICES: { key: Choice; label: string; hint: string }[] = [
  { key: 'handled', label: 'عالجتها', hint: 'تنتهي الحالة هنا' },
  { key: 'parent', label: 'أبلغ ولي الأمر', hint: 'تكتب أنت النص' },
  { key: 'return', label: 'أعدها للموجه', hint: 'مع سبب الإعادة' },
]

/**
 * A case the counsellor named this administrator on. Showing it as text alone
 * made escalation a dead end — somebody had to be able to close it.
 */
export function EscalatedCases({ cases }: { cases: EscalatedCase[] }) {
  const [active, setActive] = useState<EscalatedCase | null>(null)

  if (cases.length === 0) {
    return <p className="text-sm text-muted-foreground">لا توجد حالات محالة</p>
  }

  return (
    <>
      <div className="space-y-2">
        {cases.map((c) => (
          <div key={c.id} className="rounded-xl border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-sm">{c.studentName}</span>
              <span className="text-xs text-muted-foreground">
                {c.gradeName ? `${c.gradeName} — ` : ''}{c.className ? `فصل ${c.className}` : ''} · {c.date}
              </span>
            </div>
            <p className="text-sm mt-1.5 text-foreground/90">{c.teacherNote}</p>
            <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
              <p className="text-xs text-muted-foreground">
                رفعها {c.teacherName}
                {c.escalatedToName ? ` · أُحيلت إلى ${c.escalatedToName}` : ''}
              </p>
              <button
                onClick={() => setActive(c)}
                className="text-xs font-bold px-3 py-1.5 rounded-lg bg-primary text-primary-foreground"
              >
                اتخذ قراراً
              </button>
            </div>
          </div>
        ))}
      </div>

      {active && <DecisionModal c={active} onClose={() => setActive(null)} />}
    </>
  )
}

function DecisionModal({ c, onClose }: { c: EscalatedCase; onClose: () => void }) {
  const [choice, setChoice] = useState<Choice | null>(null)
  const [note, setNote] = useState('')
  const [message, setMessage] = useState(
    `السلام عليكم ورحمة الله وبركاته\nولي أمر الطالب: ${c.studentName}\nنود إحاطتكم بملاحظة تخص سلوك الطالب، ونرجو التعاون معنا في متابعته.\nإدارة المدرسة`
  )
  const [contact, setContact] = useState<{ fullName: string; parentPhone: string | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const pick = async (k: Choice) => {
    setChoice(k)
    setError('')
    // The number is fetched only at the moment of choosing to write, so it is
    // never sitting on screen inviting a call before the case is read.
    if (k === 'parent' && !contact) {
      setBusy(true)
      try {
        setContact(await getCaseParentContact(c.id))
      } finally {
        setBusy(false)
      }
    }
  }

  const submit = async () => {
    setBusy(true)
    setError('')

    // Opened inside the click, redirected after the save — the other order is
    // blocked as a popup, and confirming looked like it did nothing.
    const waTab = choice === 'parent' ? window.open('', '_blank') : null

    try {
      let res: { ok: boolean; error?: string; waUrl?: string | null }
      if (choice === 'handled') res = await adminHandleCase(c.id, note)
      else if (choice === 'return') res = await returnCaseToCounselor(c.id, note)
      else if (choice === 'parent') res = await adminInformParent(c.id, message, note)
      else { waTab?.close(); return }

      if (!res.ok) { waTab?.close(); setError(res.error || 'تعذّر حفظ القرار'); return }

      if (choice === 'parent') {
        if (res.waUrl && waTab) {
          waTab.location.href = res.waUrl
        } else {
          waTab?.close()
          if (!res.waUrl) {
            setError('حُفظ القرار، لكن لا يوجد رقم جوال مسجَّل لولي أمر هذا الطالب')
            return
          }
        }
      }
      onClose()
    } catch {
      waTab?.close()
      setError('حدث خطأ غير متوقع')
    } finally {
      setBusy(false)
    }
  }

  const waNumber = (() => {
    const d = (contact?.parentPhone ?? '').replace(/\D/g, '')
    if (!d) return ''
    if (d.startsWith('966')) return d
    if (d.startsWith('0')) return `966${d.slice(1)}`
    return `966${d}`
  })()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-background rounded-3xl border border-border shadow-xl w-full max-w-xl max-h-[92vh] overflow-auto">
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

          <div>
            <p className="text-sm font-bold mb-2">قرارك</p>
            {/* Stacked on a phone. These are three decisions with a line of
                explanation each; squeezed into thirds of a 375px screen the
                explanation is what gets lost, and this is the screen where a
                deputy decides what reaches a family. The counsellor's own
                decision buttons already collapse this way. */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {CHOICES.map((ch) => (
                <button
                  key={ch.key}
                  onClick={() => pick(ch.key)}
                  className={`rounded-xl border p-3 text-right transition-all ${
                    choice === ch.key ? 'border-primary bg-primary/5 ring-2 ring-primary/30' : 'border-border bg-card hover:bg-muted/50'
                  }`}
                >
                  <span className="block text-sm font-bold">{ch.label}</span>
                  <span className="block text-[11px] text-muted-foreground mt-0.5">{ch.hint}</span>
                </button>
              ))}
            </div>
          </div>

          {choice === 'parent' && (
            <div className="space-y-3">
              {contact?.parentPhone ? (
                <a
                  href={`https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2"
                >
                  <Phone className="size-4" /> فتح واتساب الآن — {contact.parentPhone}
                </a>
              ) : (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
                  لا يوجد رقم جوال مسجَّل لولي أمر هذا الطالب.
                </p>
              )}
              <div>
                <label className="block text-sm font-bold mb-1.5">نص الرسالة</label>
                <p className="text-xs text-muted-foreground mb-2">عند «تأكيد القرار» سيُفتح واتساب بالنص جاهزاً.</p>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={6}
                  className="w-full p-3 rounded-xl border border-border bg-background text-sm leading-7"
                />
              </div>
            </div>
          )}

          {choice && (
            <div>
              <label className="block text-sm font-bold mb-1.5">
                ملاحظتك {choice === 'parent' ? '(اختيارية)' : '(مطلوبة)'}
              </label>
              <p className="text-xs text-muted-foreground mb-2">يراها الموجه — ولا يراها المعلم ولا ولي الأمر.</p>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder={choice === 'return' ? 'لماذا تعود للموجه، وما المطلوب منه...' : 'ما تم في الحالة...'}
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
              disabled={!choice || busy}
              className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-bold disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {busy ? <><Loader2 className="size-4 animate-spin" /> جاري الحفظ...</> : (
                <>
                  {choice === 'handled' && <CheckCircle2 className="size-4" />}
                  {choice === 'parent' && <MessageSquare className="size-4" />}
                  {choice === 'return' && <Undo2 className="size-4" />}
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
