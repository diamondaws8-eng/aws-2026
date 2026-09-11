'use client'

import { useState } from 'react'
import { AppearanceSettings } from '@/components/appearance-settings'
import Link from 'next/link'
import { authClient } from '@/lib/auth-client'
import { NotificationBell } from '@/components/notification-bell'
import { StatCard } from '@/components/stat-card'
import { saveCounselorPhone, saveCounselorTemplates, saveCounselorCasePrefs } from './actions'
import {
  TEMPLATE_VARS,
  MAX_TEMPLATES,
  STALE_RANGE,
  REPEAT_RANGE,
  daysLabel,
  type CounselorTemplate,
  type CounselorCasePrefs,
} from '@/lib/counselor-settings'
import {
  Layers,
  Users,
  BookOpen,
  MessageSquare,
  AlertTriangle,
  ShieldCheck,
  UserCog,
  ArrowUpCircle,
  Trash2,
  Plus,
} from 'lucide-react'

type Coverage = {
  gradeId: string
  gradeName: string
  targets: { userId: string; fullName: string; role: string }[]
}

const ROLE_AR: Record<string, string> = {
  deputy: 'وكيل',
  principal: 'مدير مدرسة',
  quality_manager: 'مدير الجودة',
}

/** Which card the last message belongs to, so a save says where it landed. */
type Section = 'templates' | 'prefs' | 'phone' | 'password' | 'email'
type Note = { section: Section; ok: boolean; text: string } | null

export function CounselorSettingsClient({
  name,
  schoolName,
  allGrades,
  gradeNames,
  classCount,
  studentCount,
  coverage,
  parentActivation,
  initialPhone,
  initialTemplates,
  initialPrefs,
}: {
  name: string
  schoolName: string
  allGrades: boolean
  gradeNames: string[]
  classCount: number
  studentCount: number
  coverage: Coverage[]
  parentActivation: { total: number; activated: number }
  initialPhone: string
  initialTemplates: CounselorTemplate[]
  initialPrefs: CounselorCasePrefs
}) {
  const [templates, setTemplates] = useState<CounselorTemplate[]>(initialTemplates)
  const [prefs, setPrefs] = useState<CounselorCasePrefs>(initialPrefs)
  const [phone, setPhone] = useState(initialPhone)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [newEmail, setNewEmail] = useState('')

  const [busy, setBusy] = useState<Section | null>(null)
  const [note, setNote] = useState<Note>(null)

  const say = (section: Section, ok: boolean, text: string) => setNote({ section, ok, text })

  const Message = ({ section }: { section: Section }) =>
    note?.section === section ? (
      <p
        className={`mt-3 rounded-xl border p-3 text-sm ${
          note.ok
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : 'bg-red-50 text-red-700 border-red-200'
        }`}
      >
        {note.text}
      </p>
    ) : null

  // ── Templates ─────────────────────────────────────────────────────────────

  const addTemplate = () =>
    setTemplates((prev) => (prev.length >= MAX_TEMPLATES ? prev : [...prev, { title: '', body: '' }]))

  const editTemplate = (i: number, field: keyof CounselorTemplate, value: string) =>
    setTemplates((prev) => prev.map((t, idx) => (idx === i ? { ...t, [field]: value } : t)))

  const removeTemplate = (i: number) => setTemplates((prev) => prev.filter((_, idx) => idx !== i))

  const submitTemplates = async () => {
    // The server drops a body-less template silently; saying so here keeps a
    // half-written one from disappearing without the person knowing why.
    const empty = templates.findIndex((t) => !t.body.trim())
    if (empty !== -1) {
      say('templates', false, `القالب رقم ${empty + 1} بلا نص — اكتبه أو احذفه`)
      return
    }
    setBusy('templates')
    const res = await saveCounselorTemplates(templates)
    setBusy(null)
    if (res.ok) say('templates', true, 'حُفظت القوالب — ستجدها في شاشة القرار عند اختيار «إبلاغ ولي الأمر» ✅')
    else say('templates', false, res.error)
  }

  const submitPrefs = async () => {
    setBusy('prefs')
    const res = await saveCounselorCasePrefs(prefs)
    setBusy(null)
    if (res.ok) say('prefs', true, 'حُفظت التفضيلات — صفحة الحالات ستعتمدها فوراً ✅')
    else say('prefs', false, res.error)
  }

  const submitPhone = async () => {
    setBusy('phone')
    const res = await saveCounselorPhone(phone)
    setBusy(null)
    if (res.ok) say('phone', true, 'حُفظ رقم الجوال ✅')
    else say('phone', false, res.error)
  }

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword !== confirmPassword) return say('password', false, 'كلمتا المرور غير متطابقتين')
    if (newPassword.length < 8) return say('password', false, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل')

    setBusy('password')
    try {
      const res = await authClient.changePassword({
        newPassword,
        currentPassword,
        revokeOtherSessions: true,
      })
      if (res.error) say('password', false, 'كلمة المرور الحالية غير صحيحة — تأكد منها وحاول مرة أخرى')
      else {
        say('password', true, 'تم تغيير كلمة المرور، وأُغلقت أي جلسة أخرى مفتوحة بحسابك ✅')
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      }
    } catch {
      say('password', false, 'حدث خطأ غير متوقع')
    } finally {
      setBusy(null)
    }
  }

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newEmail.includes('@')) return say('email', false, 'البريد الإلكتروني غير صالح')

    setBusy('email')
    try {
      const res = await authClient.changeEmail({ newEmail })
      if (res.error) say('email', false, 'تعذّر تغيير البريد الإلكتروني — قد يكون مستخدماً بحساب آخر')
      else {
        say('email', true, 'تم تغيير بريد الدخول ✅')
        setNewEmail('')
      }
    } catch {
      say('email', false, 'حدث خطأ غير متوقع')
    } finally {
      setBusy(null)
    }
  }

  const uncovered = coverage.filter((c) => c.targets.length === 0)
  const unreachable = parentActivation.total - parentActivation.activated

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">الإعدادات</h1>
          <p className="text-muted-foreground mt-1">{name} — موجه طلابي، {schoolName}</p>
        </div>
        <NotificationBell />
      </div>

      {/* ── Scope ─────────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard
            label="المراحل المسندة إليك"
            value={allGrades ? 'كل المراحل' : gradeNames.length}
            icon={Layers}
            accent="violet"
          />
          <StatCard label="فصول داخل نطاقك" value={classCount} icon={BookOpen} accent="blue" />
          <StatCard label="طلاب داخل نطاقك" value={studentCount} icon={Users} accent="emerald" />
        </div>

        <div className="rounded-3xl border border-border bg-card p-6">
          <h2 className="text-lg font-bold mb-1.5">نطاق عملك ومَن تُصعّد إليه</h2>
          <p className="text-sm text-muted-foreground mb-5 leading-7">
            هذه البيانات تحددها الإدارة ولا تُعدَّل من هنا. تظهر لك مسبقاً حتى تعرف — قبل أن تحتاجها — هل لكل
            مرحلة مسؤول يمكن أن تُحال إليه الحالة أم لا.
          </p>

          {coverage.length === 0 ? (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-4">
              لا توجد مرحلة مسندة إليك بعد — راجع الإدارة، فصندوق الحالات سيبقى فارغاً حتى تُسنَد لك مرحلة.
            </p>
          ) : (
            <div className="space-y-3">
              {coverage.map((c) => (
                <div key={c.gradeId} className="rounded-2xl border border-border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <span className="font-bold text-sm">{c.gradeName}</span>
                    <span
                      className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${
                        c.targets.length
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-red-50 text-red-700 border-red-200'
                      }`}
                    >
                      {c.targets.length ? `${c.targets.length} مسؤول للتصعيد` : 'لا يوجد مسؤول للتصعيد'}
                    </span>
                  </div>
                  {c.targets.length ? (
                    <div className="flex flex-wrap gap-2">
                      {c.targets.map((t) => (
                        <span
                          key={t.userId}
                          className="inline-flex items-center gap-1.5 text-xs bg-muted rounded-full px-3 py-1"
                        >
                          <ArrowUpCircle className="size-3.5 text-muted-foreground" />
                          <span className="font-semibold">{t.fullName}</span>
                          <span className="text-muted-foreground">— {ROLE_AR[t.role] ?? t.role}</span>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-red-600 leading-6">
                      أي حالة في هذه المرحلة لن تجد وكيلاً تُحال إليه. أبلغ الإدارة بإسناد وكيل لها — بصلاحية
                      تعديل، لا قراءة فقط، لأن وكيل القراءة لا يستطيع إغلاق الحالة.
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {uncovered.length > 0 && (
            <p className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <span>
                {uncovered.length} من مراحلك بلا مسؤول تصعيد. تبقى لك القرارات الثلاثة الأخرى، لكن التصعيد ليس
                متاحاً فيها اليوم.
              </span>
            </p>
          )}
        </div>
      </section>

      {/* ── Parent reach ──────────────────────────────────────────────────── */}
      <section className="rounded-3xl border border-border bg-card p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
            <MessageSquare className="size-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold">وصول رسائلك إلى أولياء الأمور</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              كل قرار «إبلاغ ولي الأمر» يسير في مسارين: واتساب، ونسخة في بوابة ولي الأمر.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <StatCard
            label="أولياء أمور فعّلوا حساباتهم"
            value={parentActivation.activated}
            icon={ShieldCheck}
            accent={parentActivation.activated > 0 ? 'emerald' : 'red'}
          />
          <StatCard
            label="لم يفعّلوا بعد"
            value={unreachable}
            icon={AlertTriangle}
            accent={unreachable > 0 ? 'amber' : 'default'}
          />
        </div>

        {unreachable > 0 ? (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-4 leading-7">
            <span className="font-bold">اقرأ هذا قبل أن تعتمد على البوابة:</span> {unreachable} من{' '}
            {parentActivation.total} ولي أمر لم يدخلوا البوابة ولم يختاروا كلمة مرور بعد، وحتى يفعلوا ذلك{' '}
            <span className="font-bold">لن يروا نسخة الرسالة في بوابتهم ولا أي إشعار</span>. هذا ليس عطلاً — هو
            حماية مقصودة كي لا يفتح أحد حساب ابن غيره بكلمة المرور المشتركة. فاعتبر واتساب هو القناة الفعلية
            اليوم، وتأكد بنفسك أن الرسالة أُرسلت فيه.
          </p>
        ) : (
          <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
            كل أولياء الأمور فعّلوا حساباتهم — نسخة البوابة تصل إلى الجميع.
          </p>
        )}
      </section>

      {/* ── Templates ─────────────────────────────────────────────────────── */}
      <section className="rounded-3xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-1.5">
          <h2 className="text-lg font-bold">قوالب رسائلك لأولياء الأمور</h2>
          <button
            onClick={addTemplate}
            disabled={templates.length >= MAX_TEMPLATES}
            className="inline-flex items-center gap-1.5 text-sm bg-primary/10 text-primary font-semibold px-3 py-1.5 rounded-lg hover:bg-primary/20 disabled:opacity-40"
          >
            <Plus className="size-4" /> إضافة قالب
          </button>
        </div>
        <p className="text-sm text-muted-foreground mb-4 leading-7">
          صياغتك أنت، محفوظة مسبقاً حتى لا تكتبها من جديد في كل حالة. تظهر لك وحدك داخل شاشة القرار عند اختيار
          «إبلاغ ولي الأمر»، ويبقى النص قابلاً للتعديل قبل الإرسال — القالب بداية، لا قرار.
          <br />
          <span className="text-xs">الحد الأقصى {MAX_TEMPLATES} قوالب.</span>
        </p>

        <div className="flex flex-wrap gap-2 mb-5">
          {TEMPLATE_VARS.map((v) => (
            <span key={v.token} className="text-xs bg-muted rounded-lg px-2.5 py-1">
              <code className="font-mono font-bold">{v.token}</code>
              <span className="text-muted-foreground"> = {v.label}</span>
            </span>
          ))}
        </div>

        {templates.length === 0 ? (
          <p className="text-sm text-muted-foreground bg-muted/50 rounded-xl p-4">
            لا توجد قوالب محفوظة. بدونها ستكتب نص الرسالة كاملاً في كل مرة.
          </p>
        ) : (
          <div className="space-y-4">
            {templates.map((t, i) => (
              <div key={i} className="rounded-2xl border border-border p-4 space-y-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={t.title}
                    onChange={(e) => editTemplate(i, 'title', e.target.value)}
                    placeholder="اسم القالب — مثال: تنبيه أول، متابعة، تكرار"
                    className="flex-1 p-2.5 rounded-xl border border-border bg-background text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <button
                    onClick={() => removeTemplate(i)}
                    aria-label="حذف القالب"
                    className="px-3 py-3 sm:py-0 rounded-xl text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <textarea
                  value={t.body}
                  onChange={(e) => editTemplate(i, 'body', e.target.value)}
                  rows={5}
                  placeholder={'السلام عليكم ورحمة الله وبركاته\nولي أمر الطالب: {student}\n...'}
                  className="w-full p-3 rounded-xl border border-border bg-background text-sm leading-7 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            ))}
          </div>
        )}

        <button
          onClick={submitTemplates}
          disabled={busy === 'templates'}
          className="w-full mt-5 py-3 rounded-xl bg-primary text-primary-foreground font-bold disabled:opacity-50"
        >
          {busy === 'templates' ? 'جاري الحفظ...' : 'حفظ القوالب'}
        </button>
        <Message section="templates" />
      </section>

      {/* ── Inbox thresholds ──────────────────────────────────────────────── */}
      <section className="rounded-3xl border border-border bg-card p-6">
        <h2 className="text-lg font-bold mb-1.5">تفضيلات صندوق الحالات</h2>
        <p className="text-sm text-muted-foreground mb-5 leading-7">
          هذه تخصّ عرض صندوقك أنت — لا تغيّر أي حالة، ولا يراها أحد غيرك، ولا تؤثر على ما تراه الإدارة.
        </p>

        <div className="grid sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-semibold mb-1.5">متى تُوسم الحالة بأنها متأخرة؟</label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={STALE_RANGE.min}
                max={STALE_RANGE.max}
                value={prefs.staleAfterDays}
                onChange={(e) => setPrefs((p) => ({ ...p, staleAfterDays: Number(e.target.value) }))}
                className="w-24 p-3 rounded-xl border border-border bg-background text-center font-bold focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <span className="text-sm text-muted-foreground">
                يوماً بلا قرار ({STALE_RANGE.min}–{STALE_RANGE.max})
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              حالياً: كل حالة مضى عليها أكثر من {daysLabel(prefs.staleAfterDays)} تظهر بعلامة تأخير.
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1.5">متى يُعدّ الطالب «متكرراً»؟</label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={REPEAT_RANGE.min}
                max={REPEAT_RANGE.max}
                value={prefs.repeatThreshold}
                onChange={(e) => setPrefs((p) => ({ ...p, repeatThreshold: Number(e.target.value) }))}
                className="w-24 p-3 rounded-xl border border-border bg-background text-center font-bold focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <span className="text-sm text-muted-foreground">
                حالات فأكثر ({REPEAT_RANGE.min}–{REPEAT_RANGE.max})
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              الطالب الذي بلغ {prefs.repeatThreshold} حالات يظهر في شريط «طلاب تكررت حالاتهم» — النمط لا الحادثة.
            </p>
          </div>
        </div>

        <button
          onClick={submitPrefs}
          disabled={busy === 'prefs'}
          className="w-full mt-6 py-3 rounded-xl bg-primary text-primary-foreground font-bold disabled:opacity-50"
        >
          {busy === 'prefs' ? 'جاري الحفظ...' : 'حفظ التفضيلات'}
        </button>
        <Message section="prefs" />
      </section>

      {/* ── Account ───────────────────────────────────────────────────────── */}
      <section className="rounded-3xl border border-border bg-card p-6">
        <div className="flex items-start gap-3 mb-5">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <UserCog className="size-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold">حسابك</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              حسابك يقرأ ملاحظات سرّية عن أبناء الناس — لا تشارك كلمة مروره مع أحد.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-semibold">رقم جوالك</label>
          <p className="text-xs text-muted-foreground">
            للتواصل الإداري فقط — لا يُعرض لأولياء الأمور، ولا يغيّر بريد دخولك.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="05XXXXXXXX"
              className="flex-1 p-3 rounded-xl border border-border bg-background text-left focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              onClick={submitPhone}
              disabled={busy === 'phone'}
              className="px-5 rounded-xl bg-muted font-semibold hover:bg-muted/70 disabled:opacity-50"
            >
              {busy === 'phone' ? '...' : 'حفظ'}
            </button>
          </div>
        </div>
        <Message section="phone" />

        <form onSubmit={submitPassword} className="mt-6 border-t border-border pt-6 space-y-4">
          <h3 className="font-bold">تغيير كلمة المرور</h3>
          {[
            { label: 'كلمة المرور الحالية', value: currentPassword, set: setCurrentPassword },
            { label: 'كلمة المرور الجديدة', value: newPassword, set: setNewPassword },
            { label: 'تأكيد كلمة المرور الجديدة', value: confirmPassword, set: setConfirmPassword },
          ].map((f) => (
            <div key={f.label}>
              <label className="block text-sm font-medium mb-1">{f.label}</label>
              <input
                type="password"
                dir="ltr"
                value={f.value}
                onChange={(e) => f.set(e.target.value)}
                required
                className="w-full p-3 rounded-xl border border-border bg-background text-left focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          ))}
          <button
            type="submit"
            disabled={busy === 'password'}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold disabled:opacity-50"
          >
            {busy === 'password' ? 'جاري الحفظ...' : 'تغيير كلمة المرور'}
          </button>
          <Message section="password" />
        </form>

        <form onSubmit={submitEmail} className="mt-6 border-t border-border pt-6 space-y-4">
          <h3 className="font-bold">تغيير بريد الدخول</h3>
          <div>
            <label className="block text-sm font-medium mb-1">البريد الإلكتروني الجديد</label>
            <input
              type="email"
              dir="ltr"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
              placeholder="name@counselor.midad.local"
              className="w-full p-3 rounded-xl border border-border bg-background text-left focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <button
            type="submit"
            disabled={busy === 'email'}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold disabled:opacity-50"
          >
            {busy === 'email' ? 'جاري الحفظ...' : 'تغيير البريد الإلكتروني'}
          </button>
          <Message section="email" />
        </form>
      </section>

      <p className="text-center text-xs text-muted-foreground pb-4">
        الحالات نفسها تُدار من{' '}
        <Link href="/counselor" className="font-semibold text-primary hover:underline">
          صندوق الحالات
        </Link>
        ، وما أُغلق منها في{' '}
        <Link href="/counselor/archive" className="font-semibold text-primary hover:underline">
          الأرشيف
        </Link>
        .
      </p>
      <AppearanceSettings />
    </div>
  )
}
