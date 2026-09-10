'use client'

import { useEffect, useMemo, useState } from 'react'
import { schoolDate } from '@/lib/utils'
import { NotificationBell } from '@/components/notification-bell'
import { StatCard } from '@/components/stat-card'
import { saveActivationMessage, logActivationOutreach } from './actions'
import {
  DEFAULT_ACTIVATION_MESSAGE,
  ACTIVATION_VARS,
  INITIAL_PARENT_PASSWORD,
  MAX_ACTIVATION_MESSAGE,
  applyActivationMessage,
  waLink,
} from '@/lib/parent-activation'
import {
  Users,
  ShieldCheck,
  AlertTriangle,
  Send,
  Copy,
  Check,
  FileSpreadsheet,
  RotateCcw,
  Search,
} from 'lucide-react'

type Family = {
  parentUserId: string
  phone: string
  loginEmail: string
  activated: boolean
  children: { name: string; className: string | null; gradeName: string | null }[]
  timesContacted: number
  lastContactedAt: string | null
}

type GradeStat = { gradeName: string; total: number; activated: number }

type Filter = 'remaining' | 'never' | 'activated' | 'all'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'remaining', label: 'لم يفعّلوا' },
  { key: 'never', label: 'لم نراسلهم بعد' },
  { key: 'activated', label: 'فعّلوا' },
  { key: 'all', label: 'الكل' },
]

function formatWhen(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ar-SA-u-ca-gregory', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function ActivationClient({
  schoolName,
  families,
  gradeStats,
  studentsWithoutParentAccount,
  initialMessage,
  isDefaultMessage,
  canEditMessage,
}: {
  schoolName: string
  families: Family[]
  gradeStats: GradeStat[]
  studentsWithoutParentAccount: number
  initialMessage: string
  isDefaultMessage: boolean
  canEditMessage: boolean
}) {
  const [message, setMessage] = useState(initialMessage)
  const [filter, setFilter] = useState<Filter>('remaining')
  const [search, setSearch] = useState('')
  const [savingMessage, setSavingMessage] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  // Contacted in THIS sitting. The server has the durable record, but the page
  // is not reloaded after every message, and the person needs to see the row
  // they just handled change under their hand.
  const [justSent, setJustSent] = useState<Set<string>>(new Set())

  const total = families.length
  const activated = families.filter((f) => f.activated).length
  const remaining = total - activated
  const neverContacted = families.filter((f) => !f.activated && f.timesContacted === 0 && !justSent.has(f.parentUserId)).length
  const percent = total === 0 ? 0 : Math.round((activated / total) * 100)

  // Built in the browser from the address the admin is actually on, so the link
  // is right on the deployed site and on a laptop testing it, with no env var
  // to keep in step.
  //
  // Set after mount, not during render. The server renders this page with no
  // window, so every WhatsApp href was first written with an empty {link};
  // React does not repair attribute mismatches on hydration, and a family
  // could be sent an invitation with no address in it.
  const [link, setLink] = useState('')
  useEffect(() => { setLink(`${window.location.origin}/parent/login`) }, [])

  const textFor = (f: Family) =>
    applyActivationMessage(message, {
      student: f.children.map((c) => c.name).join('، '),
      phone: f.phone || '—',
      password: INITIAL_PARENT_PASSWORD,
      link,
      school: schoolName,
    })

  const visible = useMemo(() => {
    const q = search.trim()
    return families.filter((f) => {
      const sentNow = justSent.has(f.parentUserId)
      if (filter === 'remaining' && f.activated) return false
      if (filter === 'activated' && !f.activated) return false
      if (filter === 'never' && (f.activated || f.timesContacted > 0 || sentNow)) return false
      if (!q) return true
      return (
        f.children.some((c) => c.name.includes(q)) ||
        f.phone.includes(q) ||
        f.children.some((c) => (c.className ?? '').includes(q) || (c.gradeName ?? '').includes(q))
      )
    })
  }, [families, filter, search, justSent])

  const markSent = async (ids: string[]) => {
    setJustSent((prev) => new Set([...prev, ...ids]))
    const res = await logActivationOutreach(ids)
    if (!res.ok) {
      // Put the rows back: a tick that does not mean "recorded" is worse than
      // no tick, because tomorrow it is read as "already done".
      setJustSent((prev) => {
        const next = new Set(prev)
        ids.forEach((id) => next.delete(id))
        return next
      })
      setNote({ ok: false, text: `${res.error} — لم يُسجَّل الإرسال، أعد المحاولة` })
    }
  }

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500)
    } catch {
      setNote({ ok: false, text: 'المتصفح منع النسخ — حدّد النص يدوياً' })
    }
  }

  const copyRemainingNumbers = () => {
    const numbers = families
      .filter((f) => !f.activated && f.phone)
      .map((f) => f.phone.replace(/\D/g, ''))
    if (numbers.length === 0) {
      setNote({ ok: true, text: 'لا توجد أرقام متبقية — الجميع فعّلوا حساباتهم' })
      return
    }
    copy('numbers', numbers.join('\n'))
  }

  const exportExcel = async () => {
    // Loaded on demand — the library is heavier than the whole page.
    const XLSX = await import('xlsx')
    const rows = [
      ['الطلاب', 'المرحلة', 'الفصل', 'جوال ولي الأمر', 'بريد الدخول', 'الحالة', 'عدد المراسلات', 'آخر مراسلة'],
      ...families.map((f) => [
        f.children.map((c) => c.name).join('، '),
        [...new Set(f.children.map((c) => c.gradeName ?? ''))].filter(Boolean).join('، '),
        [...new Set(f.children.map((c) => c.className ?? ''))].filter(Boolean).join('، '),
        f.phone || '',
        f.loginEmail,
        f.activated ? 'فعّل' : 'لم يفعّل',
        f.timesContacted + (justSent.has(f.parentUserId) ? 1 : 0),
        f.lastContactedAt ? schoolDate(new Date(f.lastContactedAt)) : '',
      ]),
    ]
    const ws = XLSX.utils.aoa_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'تفعيل أولياء الأمور')
    XLSX.writeFile(wb, `تفعيل_حسابات_أولياء_الأمور_${schoolDate()}.xlsx`)
  }

  const submitMessage = async () => {
    setSavingMessage(true)
    const res = await saveActivationMessage(message)
    setSavingMessage(false)
    setNote(res.ok ? { ok: true, text: 'حُفظ نص الرسالة للمدرسة ✅' } : { ok: false, text: res.error })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">تفعيل حسابات أولياء الأمور</h1>
          <p className="text-muted-foreground mt-1">
            حتى يدخل ولي الأمر ويختار كلمة مرور، لا يصله إشعار ولا يرى شيئاً في بوابته.
          </p>
        </div>
        <NotificationBell />
      </div>

      {note && (
        <p
          className={`rounded-2xl border p-4 text-sm ${
            note.ok
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-red-50 text-red-700 border-red-200'
          }`}
        >
          {note.text}
        </p>
      )}

      {/* ── Progress ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="حسابات أولياء الأمور" value={total} icon={Users} accent="blue" />
        <StatCard label="فعّلوا حساباتهم" value={activated} icon={ShieldCheck} accent="emerald" />
        <StatCard label="لم يفعّلوا بعد" value={remaining} icon={AlertTriangle} accent={remaining > 0 ? 'amber' : 'default'} />
        <StatCard label="لم نراسلهم بعد" value={neverContacted} icon={Send} accent={neverContacted > 0 ? 'violet' : 'default'} />
      </div>

      <div className="rounded-3xl border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold">تقدّم الحملة</span>
          <span className="text-sm font-bold">{percent}%</span>
        </div>
        <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {activated} من {total} أسرة. الحملة تنتهي حين يصل هذا الشريط إلى ١٠٠٪ — عندها يعمل جرس الإشعارات
          لدى الجميع وتموت كلمة المرور المشتركة.
        </p>

        {studentsWithoutParentAccount > 0 && (
          <p className="mt-4 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
            <span className="font-bold">{studentsWithoutParentAccount} طالباً</span> بلا حساب ولي أمر أصلاً —
            هؤلاء خارج هذه الحملة لأنه لا يوجد حساب يُفعَّل. راجع بياناتهم في صفحة الطلاب.
          </p>
        )}

        {gradeStats.length > 1 && (
          <div className="mt-5 space-y-2">
            <p className="text-xs font-bold text-muted-foreground">حسب المرحلة</p>
            {gradeStats.map((g) => {
              const p = g.total === 0 ? 0 : Math.round((g.activated / g.total) * 100)
              return (
                <div key={g.gradeName} className="flex items-center gap-3">
                  <span className="text-xs w-40 shrink-0 truncate">{g.gradeName}</span>
                  <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${p}%` }} />
                  </div>
                  <span className="text-xs text-muted-foreground w-20 shrink-0 text-left">
                    {g.activated}/{g.total}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Message ───────────────────────────────────────────────────────── */}
      <div className="rounded-3xl border border-border bg-card p-6">
        <h2 className="text-lg font-bold mb-1.5">نص الدعوة</h2>
        <p className="text-sm text-muted-foreground mb-4 leading-7">
          هذا النص يُملأ لكل أسرة ببياناتها ثم يُفتح في واتساب جاهزاً.
          {isDefaultMessage && ' (النص الافتراضي — لم يُعدَّل بعد.)'}
        </p>

        <div className="flex flex-wrap gap-2 mb-4">
          {ACTIVATION_VARS.map((v) => (
            <span key={v.token} className="text-xs bg-muted rounded-lg px-2.5 py-1">
              <code className="font-mono font-bold">{v.token}</code>
              <span className="text-muted-foreground"> = {v.label}</span>
            </span>
          ))}
        </div>

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, MAX_ACTIVATION_MESSAGE))}
          rows={14}
          disabled={!canEditMessage}
          className="w-full p-4 rounded-xl border border-border bg-background text-sm leading-7 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-70"
        />
        <p className="text-xs text-muted-foreground mt-1.5">
          {message.length} / {MAX_ACTIVATION_MESSAGE} حرف
        </p>

        {canEditMessage ? (
          <div className="flex flex-wrap gap-2 mt-4">
            <button
              onClick={submitMessage}
              disabled={savingMessage}
              className="flex-1 min-w-40 py-3 rounded-xl bg-primary text-primary-foreground font-bold disabled:opacity-50"
            >
              {savingMessage ? 'جاري الحفظ...' : 'حفظ النص للمدرسة'}
            </button>
            <button
              onClick={() => setMessage(DEFAULT_ACTIVATION_MESSAGE)}
              className="px-5 py-3 rounded-xl bg-muted font-semibold inline-flex items-center gap-2 hover:bg-muted/70"
            >
              <RotateCcw className="size-4" /> النص الافتراضي
            </button>
          </div>
        ) : (
          <p className="mt-4 text-xs text-muted-foreground bg-muted/50 rounded-xl p-3">
            يمكنك استخدام النص وإرساله، أما تعديله للمدرسة كلها فمن صلاحية مدير الجودة ومالك النظام.
            (أي تعديل تكتبه هنا يسري على رسائلك في هذه الجلسة فقط.)
          </p>
        )}
      </div>

      {/* ── The queue ─────────────────────────────────────────────────────── */}
      <div className="rounded-3xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-bold">قائمة الأسر</h2>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={copyRemainingNumbers}
              className="text-sm bg-muted font-semibold px-3 py-2 rounded-lg inline-flex items-center gap-1.5 hover:bg-muted/70"
            >
              {copied === 'numbers' ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
              نسخ أرقام المتبقين
            </button>
            <button
              onClick={exportExcel}
              className="text-sm bg-muted font-semibold px-3 py-2 rounded-lg inline-flex items-center gap-1.5 hover:bg-muted/70"
            >
              <FileSpreadsheet className="size-4" /> تصدير Excel
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`text-sm font-semibold px-3 py-1.5 rounded-lg ${
                filter === f.key ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/70'
              }`}
            >
              {f.label}
            </button>
          ))}
          <div className="relative flex-1 min-w-48">
            <Search className="size-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث باسم الطالب أو الفصل أو الرقم"
              className="w-full ps-3 pe-9 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        <p className="text-xs text-muted-foreground mb-3">
          {visible.length} أسرة معروضة. الترتيب يضع من لم نراسلهم أولاً — اعمل من أعلى القائمة إلى أسفلها.
        </p>

        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground bg-muted/50 rounded-xl p-6 text-center">
            لا توجد أسر في هذا التصنيف.
          </p>
        ) : (
          <div className="space-y-3">
            {visible.map((f) => {
              const sentNow = justSent.has(f.parentUserId)
              const times = f.timesContacted + (sentNow ? 1 : 0)
              const text = textFor(f)
              const href = waLink(f.phone, text)

              return (
                <div
                  key={f.parentUserId}
                  className={`rounded-2xl border p-4 ${
                    f.activated ? 'border-emerald-200 bg-emerald-50/40' : 'border-border'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-sm">
                        {f.children.map((c) => c.name).join('، ')}
                        {f.children.length > 1 && (
                          <span className="text-xs font-normal text-muted-foreground"> ({f.children.length} أبناء)</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {[...new Set(f.children.map((c) => `${c.gradeName ?? ''} ${c.className ? `- ${c.className}` : ''}`.trim()))]
                          .filter(Boolean)
                          .join(' · ') || 'بلا فصل'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5" dir="ltr">
                        {f.phone || 'لا يوجد رقم جوال'}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span
                        className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${
                          f.activated
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}
                      >
                        {f.activated ? 'فعّل حسابه' : 'لم يفعّل'}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {times === 0 ? 'لم تُراسل بعد' : `رُوسلت ${times} مرة · ${sentNow ? 'الآن' : formatWhen(f.lastContactedAt)}`}
                      </span>
                    </div>
                  </div>

                  {!f.activated && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {href && link ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => markSent([f.parentUserId])}
                          className="flex-1 min-w-40 text-center text-sm font-bold py-2.5 rounded-xl bg-emerald-600 text-white hover:opacity-90 inline-flex items-center justify-center gap-2"
                        >
                          <Send className="size-4" /> افتح واتساب
                        </a>
                      ) : !link ? (
                        <span className="flex-1 min-w-40 text-center text-xs py-2.5 rounded-xl bg-muted text-muted-foreground">
                          ...
                        </span>
                      ) : (
                        <span className="flex-1 min-w-40 text-center text-xs py-2.5 rounded-xl bg-red-50 text-red-700 border border-red-200">
                          لا يمكن المراسلة — لا يوجد رقم جوال مسجّل
                        </span>
                      )}
                      <button
                        onClick={() => copy(f.parentUserId, text)}
                        className="px-4 rounded-xl bg-muted font-semibold text-sm inline-flex items-center gap-1.5 hover:bg-muted/70"
                      >
                        {copied === f.parentUserId ? (
                          <><Check className="size-4 text-emerald-600" /> نُسخت</>
                        ) : (
                          <><Copy className="size-4" /> نسخ الرسالة</>
                        )}
                      </button>
                      {times > 0 && !sentNow && (
                        <button
                          onClick={() => markSent([f.parentUserId])}
                          className="px-4 rounded-xl bg-muted font-semibold text-sm hover:bg-muted/70"
                        >
                          سجّل تذكيراً
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground bg-muted/40 rounded-2xl p-4 leading-7">
        <span className="font-bold">لماذا لا نلغي إجبار تغيير كلمة المرور بدل هذا كله؟</span> لأن كلمة المرور
        المبدئية <code className="font-mono font-bold">{INITIAL_PARENT_PASSWORD}</code> مكتوبة في صفحة الدخول
        ليقرأها أي أحد، وبريد الدخول مشتقّ من رقم الجوال. إلغاء الإجبار يعني أن كل من يعرف رقم جوال أسرة
        يفتح ملف ابنها: حضوره ودرجاته وملاحظاته السلوكية. الإجبار هو الجدار الوحيد القائم الآن، وهذه الحملة
        هي طريقة هدمه بأمان — بأن يختار كل ولي أمر كلمة مروره.
      </p>
    </div>
  )
}
