'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { saveSchoolSettings, changeAdminPassword, exportFullBackup, restoreFullBackup, updateAdminProfile, saveAcademicCalendar } from './actions-settings'
import { requireAllParentsToChangePassword } from '../students/actions-students'
import type { SchoolSettings } from './settings-types'
import { SEMESTERS, SEMESTER_LABELS } from '@/lib/academic'
import {
  Sliders, MessageCircle, Lock, Database, Save, Backpack, Star,
  CalendarCheck2, BookOpen, Hand, Award, ShieldAlert, Trash2, Loader2,
  Download, KeyRound, CheckCircle2, XCircle, Upload, FileJson, AlertTriangle, RotateCcw, X,
  UserCircle, Users, CalendarDays,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// ── Backup file summary shape ───────────────────────────────────────────────────
type BackupSummary = {
  timestamp?: string
  raw: any
  counts: Record<string, number>
}

const RESTORE_TABLE_LABELS: Record<string, string> = {
  gradeLevels: 'مرحلة دراسية',
  classes: 'فصل',
  subjects: 'مادة',
  teachers: 'معلم',
  students: 'طالب',
  attendance: 'سجل حضور',
  gradeEntries: 'درجة',
  notifications: 'تنبيه',
  dailyRecords: 'سجل يومي',
  studentPoints: 'نقطة طالب',
}

// ── Toggle Switch ─────────────────────────────────────────────────────────────
function Toggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
        enabled ? 'bg-primary' : 'bg-muted'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-6 w-6 rounded-full bg-white shadow-md ring-0 transition-transform duration-200 ${
          enabled ? '-translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

// ── Points Input ──────────────────────────────────────────────────────────────
function PointInput({
  label, value, onChange, color,
}: {
  label: string; value: number; onChange: (v: number) => void; color: string
}) {
  return (
    <div className={`flex items-center justify-between p-3 rounded-xl border ${color}`}>
      <span className="text-sm font-semibold">{label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(value - 1)}
          className="w-7 h-7 rounded-lg bg-background border border-border flex items-center justify-center font-bold text-base hover:bg-muted transition-colors"
        >−</button>
        <span className={`w-10 text-center font-black text-base ${value > 0 ? 'text-emerald-600' : value < 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
          {value > 0 ? `+${value}` : value}
        </span>
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          className="w-7 h-7 rounded-lg bg-background border border-border flex items-center justify-center font-bold text-base hover:bg-muted transition-colors"
        >+</button>
      </div>
    </div>
  )
}

// ── Section Card ─────────────────────────────────────────────────────────────
function Section({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden bg-card border border-border rounded-3xl shadow-sm">
      <div className="absolute -top-16 -left-12 size-40 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
      <div className="relative px-6 py-4 border-b border-border bg-muted/30 flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-4.5" />
        </div>
        <h2 className="font-bold text-base">{title}</h2>
      </div>
      <div className="relative p-6">{children}</div>
    </div>
  )
}

// ── Status message (with icon) ─────────────────────────────────────────────────
function StatusMsg({ ok, text }: { ok: boolean; text: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-semibold animate-in fade-in ${ok ? 'text-emerald-600' : 'text-red-600'}`}>
      {ok ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
      {text}
    </span>
  )
}

// ── Main Client Component ─────────────────────────────────────────────────────
export default function SettingsClient({
  schoolId,
  initialSettings,
  adminEmail,
  adminName,
  roleLabel,
  canManageSchoolSettings,
  canBackup,
  backupAllGrades = true,
  canRestore = false,
  initialAcademicYear,
  initialCurrentSemester,
  initialYearStartDate,
}: {
  schoolId: string
  initialSettings: SchoolSettings
  adminEmail: string
  adminName: string
  roleLabel: string
  canManageSchoolSettings: boolean
  canBackup: boolean
  backupAllGrades?: boolean
  canRestore?: boolean
  initialAcademicYear: string
  initialCurrentSemester: string
  initialYearStartDate: string | null
}) {
  const [settings, setSettings] = useState<SchoolSettings>(initialSettings)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // Academic calendar — what every mark is stamped with, and where the year's
  // points start counting from.
  const [academicYear, setAcademicYear] = useState(initialAcademicYear)
  const [currentSemester, setCurrentSemester] = useState(initialCurrentSemester)
  const [yearStartDate, setYearStartDate] = useState(initialYearStartDate ?? '')
  const [calendarLoading, setCalendarLoading] = useState(false)
  const [calendarMsg, setCalendarMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const handleSaveCalendar = async () => {
    setCalendarLoading(true)
    setCalendarMsg(null)
    try {
      const res = await saveAcademicCalendar({
        academicYear,
        currentSemester,
        yearStartDate: yearStartDate || null,
      })
      setCalendarMsg(res.ok
        ? { ok: true, text: 'تم الحفظ' }
        : { ok: false, text: res.error })
    } catch {
      setCalendarMsg({ ok: false, text: 'حدث خطأ غير متوقع' })
    } finally {
      setCalendarLoading(false)
    }
  }

  // Profile form (own account — available to every admin-portal role)
  const [profileName, setProfileName]   = useState(adminName)
  const [profileEmail, setProfileEmail] = useState(adminEmail)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setProfileLoading(true)
    setProfileMsg(null)
    try {
      const res = await updateAdminProfile({ name: profileName, email: profileEmail })
      if (res.ok) setProfileMsg({ ok: true, text: 'تم حفظ بياناتك بنجاح' })
      else setProfileMsg({ ok: false, text: res.error || 'حدث خطأ أثناء الحفظ' })
    } catch {
      setProfileMsg({ ok: false, text: 'حدث خطأ غير متوقع' })
    } finally {
      setProfileLoading(false)
    }
  }

  // Password form
  const [currentPw, setCurrentPw]   = useState('')
  const [newPw, setNewPw]           = useState('')
  const [confirmPw, setConfirmPw]   = useState('')
  const [pwLoading, setPwLoading]   = useState(false)
  const [pwMsg, setPwMsg]           = useState<{ ok: boolean; text: string } | null>(null)

  // ── Feature helpers ──────────────────────────────────────────────────────────
  const setFeature = (key: keyof SchoolSettings['features'], val: boolean) =>
    setSettings(s => ({ ...s, features: { ...s.features, [key]: val } }))

  const setPoint = (key: keyof SchoolSettings['points'], val: number) =>
    setSettings(s => ({ ...s, points: { ...s.points, [key]: val } }))

  const addTemplate = (type: 'positive' | 'negative') => {
    setSettings(s => ({
      ...s,
      whatsappTemplates: {
        ...s.whatsappTemplates,
        [type]: [...(s.whatsappTemplates?.[type] || []), '']
      }
    }))
  }
  
  const updateTemplate = (type: 'positive' | 'negative', index: number, val: string) => {
    setSettings(s => {
      const arr = [...(s.whatsappTemplates?.[type] || [])]
      arr[index] = val
      return { ...s, whatsappTemplates: { ...s.whatsappTemplates, [type]: arr } }
    })
  }

  const removeTemplate = (type: 'positive' | 'negative', index: number) => {
    setSettings(s => {
      const arr = (s.whatsappTemplates?.[type] || []).filter((_, i) => i !== index)
      return { ...s, whatsappTemplates: { ...s.whatsappTemplates, [type]: arr } }
    })
  }

  // ── Save settings ────────────────────────────────────────────────────────────
  const handleSaveSettings = async () => {
    setSaving(true)
    setSaveMsg(null)
    try {
      await saveSchoolSettings(schoolId, settings)
      setSaveMsg({ ok: true, text: 'تم حفظ الإعدادات بنجاح' })
    } catch {
      setSaveMsg({ ok: false, text: 'حدث خطأ أثناء الحفظ' })
    } finally {
      setSaving(false)
      setTimeout(() => setSaveMsg(null), 3000)
    }
  }

  // ── Change password ──────────────────────────────────────────────────────────
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPw !== confirmPw) { setPwMsg({ ok: false, text: 'كلمة المرور الجديدة وتأكيدها غير متطابقتين' }); return }
    if (newPw.length < 6) { setPwMsg({ ok: false, text: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' }); return }
    setPwLoading(true)
    setPwMsg(null)
    const result = await changeAdminPassword(currentPw, newPw)
    if (result.ok) {
      setPwMsg({ ok: true, text: 'تم تغيير كلمة المرور بنجاح' })
      setCurrentPw(''); setNewPw(''); setConfirmPw('')
    } else {
      setPwMsg({ ok: false, text: result.error || 'حدث خطأ' })
    }
    setPwLoading(false)
  }

  // ── Backup ───────────────────────────────────────────────────────────────────
  const [backupLoading, setBackupLoading] = useState(false)
  const [backupMsg, setBackupMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const handleBackup = async () => {
    setBackupLoading(true)
    setBackupMsg(null)
    try {
      const res = await exportFullBackup(schoolId)
      if (res.ok && res.data) {
        const json = JSON.stringify(res.data, null, 2)
        const blob = new Blob([json], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        const scoped = (res.data as any)?.scope?.type === 'grades'
        a.download = `backup_midad_${scoped ? 'partial_' : ''}${new Date().toISOString().split('T')[0]}.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        setBackupMsg({ ok: true, text: 'تم تحميل النسخة الاحتياطية بنجاح' })
      } else {
        setBackupMsg({ ok: false, text: res.error || 'حدث خطأ أثناء أخذ النسخة' })
      }
    } catch {
      setBackupMsg({ ok: false, text: 'حدث خطأ غير متوقع' })
    } finally {
      setBackupLoading(false)
    }
  }

  // ── Bulk rotation of parent passwords ────────────────────────────────────────
  const [rotateOpen, setRotateOpen] = useState(false)
  const [rotatePhrase, setRotatePhrase] = useState('')
  const [rotating, setRotating] = useState(false)
  const [rotateMsg, setRotateMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const handleRotateParents = async () => {
    if (rotatePhrase !== 'تغيير') return
    setRotating(true)
    setRotateMsg(null)
    try {
      const res = await requireAllParentsToChangePassword(schoolId)
      if (res.ok) {
        setRotateOpen(false)
        setRotatePhrase('')
        setRotateMsg({ ok: true, text: `تم — سيُطلب من ${res.count} ولي أمر اختيار كلمة مرور خاصة به عند أول دخول` })
      } else {
        setRotateMsg({ ok: false, text: res.error || 'حدث خطأ' })
      }
    } catch {
      setRotateMsg({ ok: false, text: 'حدث خطأ غير متوقع' })
    } finally {
      setRotating(false)
    }
  }

  // ── Restore ──────────────────────────────────────────────────────────────────
  const router = useRouter()
  const restoreFileRef = useRef<HTMLInputElement>(null)
  const [pendingRestore, setPendingRestore] = useState<BackupSummary | null>(null)
  const [restoreFileError, setRestoreFileError] = useState<string | null>(null)
  const [confirmPhrase, setConfirmPhrase] = useState('')
  const [restoring, setRestoring] = useState(false)
  const [restoreResult, setRestoreResult] = useState<{ ok: boolean; text: string } | null>(null)

  const handleRestoreFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setRestoreFileError(null)
    setRestoreResult(null)
    setConfirmPhrase('')
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      if (!parsed || typeof parsed !== 'object' || !parsed.data || typeof parsed.data !== 'object') {
        setRestoreFileError('هذا الملف ليس نسخة احتياطية صالحة')
        setPendingRestore(null)
        return
      }
      const counts: Record<string, number> = {}
      for (const key of Object.keys(RESTORE_TABLE_LABELS)) {
        counts[key] = Array.isArray(parsed.data[key]) ? parsed.data[key].length : 0
      }
      setPendingRestore({ timestamp: parsed.timestamp, raw: parsed, counts })
    } catch {
      setRestoreFileError('تعذّرت قراءة الملف — تأكد أنه ملف JSON صالح من ميزة النسخ الاحتياطي')
      setPendingRestore(null)
    }
  }

  const cancelRestore = () => {
    setPendingRestore(null)
    setConfirmPhrase('')
    setRestoreFileError(null)
    if (restoreFileRef.current) restoreFileRef.current.value = ''
  }

  const handleConfirmRestore = async () => {
    if (!pendingRestore || confirmPhrase !== 'استعادة') return
    setRestoring(true)
    setRestoreResult(null)
    try {
      const res = await restoreFullBackup(schoolId, pendingRestore.raw)
      if (res.ok) {
        // Only the table counts are records. The result also carries diagnostic
        // figures (rows skipped, totals recomputed), and summing everything
        // would report more records than the file ever held.
        const counts = (res.counts ?? {}) as Record<string, number>
        const total = Object.keys(RESTORE_TABLE_LABELS)
          .reduce((sum, key) => sum + (counts[key] ?? 0), 0)

        const notes: string[] = []
        if (res.missingLogins) notes.push(`${res.missingLogins} من حسابات المعلمين لم تعد مرتبطة بتسجيل دخول فعّال`)
        if (res.missingParentLogins) notes.push(`${res.missingParentLogins} من حسابات أولياء الأمور لم تعد مرتبطة بتسجيل دخول فعّال`)
        if (counts.studentPointsSkipped) notes.push(`${counts.studentPointsSkipped} صف نقاط قديم تم تجاهله لأنه محسوب تلقائياً الآن`)
        if (counts.pointsRecomputed) notes.push(`أُعيد حساب نقاط ${counts.pointsRecomputed} صف`)

        setRestoreResult({
          ok: true,
          text: `تمت الاستعادة بنجاح — ${total} سجل${notes.length ? `. ${notes.join('. ')}.` : ''}`,
        })
        cancelRestore()
        router.refresh()
      } else {
        setRestoreResult({ ok: false, text: res.error || 'حدث خطأ أثناء الاستعادة' })
      }
    } catch {
      setRestoreResult({ ok: false, text: 'حدث خطأ غير متوقع أثناء الاستعادة' })
    } finally {
      setRestoring(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── The academic calendar ────────────────────────────────────────────── */}
      {canManageSchoolSettings && (
        <Section title="العام الدراسي والفصل الحالي" icon={CalendarDays}>
          <p className="text-sm text-muted-foreground mb-5 leading-7">
            هذان الحقلان يحكمان أمرين: <span className="font-semibold text-foreground">كل درجة يحفظها المعلم
            تُختم بالعام والفصل المذكورين هنا</span>، و<span className="font-semibold text-foreground">النقاط
            ولوحة الصدارة تُحسب من تاريخ بداية العام فصاعداً</span>.
          </p>

          <div className="grid sm:grid-cols-3 gap-4 max-w-3xl">
            <div>
              <label className="block text-sm font-semibold mb-1.5">العام الدراسي</label>
              <input
                type="text"
                value={academicYear}
                onChange={e => setAcademicYear(e.target.value)}
                placeholder="1448"
                className="w-full p-3 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1.5">الفصل الحالي</label>
              <select
                value={currentSemester}
                onChange={e => setCurrentSemester(e.target.value)}
                className="w-full p-3 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary text-sm"
              >
                {SEMESTERS.map(s => (
                  <option key={s} value={s}>{SEMESTER_LABELS[s]}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-1">
                غيّره يوم يبدأ الفصل التالي. إن نسيت، ستُحفظ درجات الفصل الجديد فوق القديم.
              </p>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1.5">تاريخ بداية العام</label>
              <input
                type="date"
                value={yearStartDate}
                onChange={e => setYearStartDate(e.target.value)}
                className="w-full p-3 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {yearStartDate
                  ? 'النقاط تُحسب من هذا التاريخ فصاعداً.'
                  : 'اتركه فارغاً في عامك الأول. حدّده قبل بداية العام الثاني، وإلا ظلّت نقاط العام الماضي تُحسب مع الجديد.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-5">
            <button
              type="button"
              onClick={handleSaveCalendar}
              disabled={calendarLoading}
              className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm disabled:opacity-50"
            >
              {calendarLoading ? 'جاري الحفظ...' : 'حفظ العام والفصل'}
            </button>
            {calendarMsg && <StatusMsg ok={calendarMsg.ok} text={calendarMsg.text} />}
          </div>
        </Section>
      )}

      {/* ── Section 0: My profile (every role) ───────────────────────────────── */}
      <Section title="الملف الشخصي" icon={UserCircle}>
        <p className="text-sm text-muted-foreground mb-5">
          صلاحيتك في النظام: <span className="font-bold text-foreground">{roleLabel}</span>
        </p>
        <form onSubmit={handleSaveProfile} className="space-y-4 max-w-md">
          <div>
            <label className="block text-sm font-semibold mb-1.5">الاسم</label>
            <input
              type="text"
              required
              value={profileName}
              onChange={e => setProfileName(e.target.value)}
              className="w-full p-3 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1.5">البريد الإلكتروني (اسم الدخول)</label>
            <input
              type="email"
              required
              value={profileEmail}
              onChange={e => setProfileEmail(e.target.value)}
              className="w-full p-3 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary text-sm dir-ltr text-right"
            />
            <p className="text-xs text-muted-foreground mt-1">
              بعد التغيير ستستخدم البريد الجديد لتسجيل الدخول، وكلمة المرور تبقى كما هي.
            </p>
          </div>

          {profileMsg && <StatusMsg ok={profileMsg.ok} text={profileMsg.text} />}

          <button
            type="submit"
            disabled={profileLoading}
            className="px-8 py-3 bg-primary text-primary-foreground font-bold rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity inline-flex items-center gap-2"
          >
            {profileLoading ? <><Loader2 className="size-4 animate-spin" /> جاري الحفظ...</> : <><Save className="size-4" /> حفظ البيانات</>}
          </button>
        </form>
      </Section>

      {/* ── Section 1: Features & Points ─────────────────────────────────────── */}
      {canManageSchoolSettings && (
      <Section title="التحكم في ميزات جدول المعلم" icon={Sliders}>
        <p className="text-sm text-muted-foreground mb-5">
          يمكنك تفعيل أو تعطيل كل ميزة في الجدول اليومي للمعلم. الميزات المعطّلة لن تظهر للمعلم ولن تؤثر في النقاط.
        </p>

        <div className="space-y-4">
          {/* Attendance */}
          <div className={`rounded-2xl border p-4 transition-all ${settings.features.attendance ? 'border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800' : 'border-border bg-muted/30 opacity-60'}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400">
                  <CalendarCheck2 className="size-4.5" />
                </div>
                <div>
                  <p className="font-bold">حضور الحصص</p>
                  <p className="text-xs text-muted-foreground mt-0.5">تسجيل حضور وغياب وتأخر الطلاب</p>
                </div>
              </div>
              <Toggle enabled={settings.features.attendance} onChange={v => setFeature('attendance', v)} />
            </div>

            {settings.features.attendance && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3 pt-3 border-t border-emerald-200 dark:border-emerald-800">
                <PointInput label="✅ حضور"  value={settings.points.attendance_present} onChange={v => setPoint('attendance_present', v)} color="border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/10" />
                <PointInput label="❌ غياب"  value={settings.points.attendance_absent}  onChange={v => setPoint('attendance_absent', v)}  color="border-red-200 bg-red-50/50 dark:bg-red-950/10" />
                <PointInput label="⏰ تأخر"  value={settings.points.attendance_late}    onChange={v => setPoint('attendance_late', v)}    color="border-amber-200 bg-amber-50/50 dark:bg-amber-950/10" />
              </div>
            )}
          </div>

          {/* Behavior */}
          <div className={`rounded-2xl border p-4 transition-all ${settings.features.behavior ? 'border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800' : 'border-border bg-muted/30 opacity-60'}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400">
                  <Star className="size-4.5" />
                </div>
                <div>
                  <p className="font-bold">درجة السلوك</p>
                  <p className="text-xs text-muted-foreground mt-0.5">تقييم سلوك الطالب (ممتاز / جيد / يحتاج تحسين)</p>
                </div>
              </div>
              <Toggle enabled={settings.features.behavior} onChange={v => setFeature('behavior', v)} />
            </div>

            {settings.features.behavior && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3 pt-3 border-t border-blue-200 dark:border-blue-800">
                <PointInput label="🌟 ممتاز"         value={settings.points.behavior_excellent} onChange={v => setPoint('behavior_excellent', v)} color="border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/10" />
                <PointInput label="👍 جيد"            value={settings.points.behavior_good}      onChange={v => setPoint('behavior_good', v)}      color="border-blue-200 bg-blue-50/50 dark:bg-blue-950/10" />
                <PointInput label="⚠️ يحتاج تحسين"  value={settings.points.behavior_bad}       onChange={v => setPoint('behavior_bad', v)}       color="border-red-200 bg-red-50/50 dark:bg-red-950/10" />
              </div>
            )}
          </div>

          {/* Homework */}
          <div className={`rounded-2xl border p-4 transition-all ${settings.features.homework ? 'border-violet-200 bg-violet-50 dark:bg-violet-950/20 dark:border-violet-800' : 'border-border bg-muted/30 opacity-60'}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-400">
                  <BookOpen className="size-4.5" />
                </div>
                <div>
                  <p className="font-bold">الواجب المنزلي</p>
                  <p className="text-xs text-muted-foreground mt-0.5">متابعة إنجاز الواجب (منجز / لم ينجزه)</p>
                </div>
              </div>
              <Toggle enabled={settings.features.homework} onChange={v => setFeature('homework', v)} />
            </div>

            {settings.features.homework && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 pt-3 border-t border-violet-200 dark:border-violet-800">
                <PointInput label="✅ أنجز الواجب"     value={settings.points.homework_done}    onChange={v => setPoint('homework_done', v)}    color="border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/10" />
                <PointInput label="❌ لم ينجز الواجب" value={settings.points.homework_notdone} onChange={v => setPoint('homework_notdone', v)} color="border-red-200 bg-red-50/50 dark:bg-red-950/10" />
              </div>
            )}
          </div>

          {/* Materials */}
          <div className={`rounded-2xl border p-4 transition-all ${settings.features.materials ? 'border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800' : 'border-border bg-muted/30 opacity-60'}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-xl bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-400">
                  <Backpack className="size-4.5" />
                </div>
                <div>
                  <p className="font-bold">الأدوات المدرسية</p>
                  <p className="text-xs text-muted-foreground mt-0.5">متابعة إحضار الطالب للأدوات (أحضر / لم يحضر)</p>
                </div>
              </div>
              <Toggle enabled={settings.features.materials} onChange={v => setFeature('materials', v)} />
            </div>

            {settings.features.materials && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 pt-3 border-t border-orange-200 dark:border-orange-800">
                <PointInput label="✅ أحضر الأدوات"     value={settings.points.materials_brought}    onChange={v => setPoint('materials_brought', v)}    color="border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/10" />
                <PointInput label="❌ لم يحضر الأدوات" value={settings.points.materials_missing} onChange={v => setPoint('materials_missing', v)} color="border-red-200 bg-red-50/50 dark:bg-red-950/10" />
              </div>
            )}
          </div>

          {/* Participation */}
          <div className={`rounded-2xl border p-4 transition-all ${settings.features.participation ? 'border-sky-200 bg-sky-50 dark:bg-sky-950/20 dark:border-sky-800' : 'border-border bg-muted/30 opacity-60'}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-400">
                  <Hand className="size-4.5" />
                </div>
                <div>
                  <p className="font-bold">المشاركة الصفية</p>
                  <p className="text-xs text-muted-foreground mt-0.5">تقييم تفاعل الطالب ومشاركته (مشارك / غير مشارك)</p>
                </div>
              </div>
              <Toggle enabled={settings.features.participation} onChange={v => setFeature('participation', v)} />
            </div>

            {settings.features.participation && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 pt-3 border-t border-sky-200 dark:border-sky-800">
                <PointInput label="🌟 مشارك متفاعل"     value={settings.points.participation_active}    onChange={v => setPoint('participation_active', v)}    color="border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/10" />
                <PointInput label="😴 غير مشارك" value={settings.points.participation_inactive} onChange={v => setPoint('participation_inactive', v)} color="border-slate-200 bg-slate-50/50 dark:bg-slate-950/10" />
              </div>
            )}
          </div>
        </div>

        {/* Save button */}
        <div className="flex items-center gap-4 mt-6">
          <button
            onClick={handleSaveSettings}
            disabled={saving}
            className="px-8 py-3 bg-primary text-primary-foreground font-bold rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity inline-flex items-center gap-2"
          >
            {saving ? <><Loader2 className="size-4 animate-spin" /> جاري الحفظ...</> : <><Save className="size-4" /> حفظ الإعدادات</>}
          </button>
          {saveMsg && <StatusMsg ok={saveMsg.ok} text={saveMsg.text} />}
        </div>
      </Section>
      )}

      {/* ── Section 1.5: WhatsApp Templates ─────────────────────────────────── */}
      {canManageSchoolSettings && (
      <Section title="قوالب رسائل الواتساب" icon={MessageCircle}>
        <p className="text-sm text-muted-foreground mb-5">
          يمكنك إنشاء عدة قوالب لرسائل الواتساب التي يرسلها المعلم لأولياء الأمور. استخدم المتغيرات التالية لتعويضها تلقائياً عند الإرسال:
          <br/>
          <code className="bg-muted px-1.5 py-0.5 rounded text-primary mx-1">{'{student}'}</code> (اسم الطالب)،
          <code className="bg-muted px-1.5 py-0.5 rounded text-primary mx-1">{'{teacher}'}</code> (اسم المعلم)،
          <code className="bg-muted px-1.5 py-0.5 rounded text-primary mx-1">{'{school}'}</code> (اسم المدرسة).
          <br/><br/>
          <span className="text-amber-600 font-semibold text-xs">ملاحظة المعلم (إن وجدت) ستُضاف تلقائياً في نهاية القالب السلبي.</span>
        </p>

        <div className="space-y-6">
          {/* Positive Templates */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-emerald-600 flex items-center gap-2">
                <span className="p-1.5 bg-emerald-100 dark:bg-emerald-950/50 rounded-lg text-emerald-700 dark:text-emerald-400"><Award className="size-4" /></span> القوالب الإيجابية (إشادة / شكر)
              </h3>
              <button
                onClick={() => addTemplate('positive')}
                className="text-xs bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-semibold px-3 py-1.5 rounded-lg transition-colors"
              >
                + إضافة قالب إيجابي
              </button>
            </div>
            
            <div className="space-y-3">
              {(settings.whatsappTemplates?.positive || []).length === 0 && (
                <div className="text-sm text-muted-foreground text-center p-4 bg-muted/30 rounded-xl">لا توجد قوالب إيجابية.</div>
              )}
              {(settings.whatsappTemplates?.positive || []).map((tpl, i) => (
                <div key={i} className="flex gap-2">
                  <textarea
                    value={tpl}
                    onChange={e => updateTemplate('positive', i, e.target.value)}
                    className="flex-1 p-3 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-emerald-500 text-sm min-h-[100px] resize-y"
                    placeholder="اكتب رسالة الشكر هنا..."
                  />
                  <button
                    onClick={() => removeTemplate('positive', i)}
                    className="w-10 flex-shrink-0 flex items-center justify-center bg-red-50 text-red-600 hover:bg-red-100 rounded-xl transition-colors"
                    title="حذف القالب"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <hr className="border-border" />

          {/* Negative Templates */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-red-600 flex items-center gap-2">
                <span className="p-1.5 bg-red-100 dark:bg-red-950/50 rounded-lg text-red-700 dark:text-red-400"><ShieldAlert className="size-4" /></span> القوالب السلبية (تنبيه / ملاحظة)
              </h3>
              <button
                onClick={() => addTemplate('negative')}
                className="text-xs bg-red-100 hover:bg-red-200 text-red-800 font-semibold px-3 py-1.5 rounded-lg transition-colors"
              >
                + إضافة قالب سلبي
              </button>
            </div>
            
            <div className="space-y-3">
              {(settings.whatsappTemplates?.negative || []).length === 0 && (
                <div className="text-sm text-muted-foreground text-center p-4 bg-muted/30 rounded-xl">لا توجد قوالب سلبية.</div>
              )}
              {(settings.whatsappTemplates?.negative || []).map((tpl, i) => (
                <div key={i} className="flex gap-2">
                  <textarea
                    value={tpl}
                    onChange={e => updateTemplate('negative', i, e.target.value)}
                    className="flex-1 p-3 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-red-500 text-sm min-h-[100px] resize-y"
                    placeholder="اكتب رسالة التنبيه هنا..."
                  />
                  <button
                    onClick={() => removeTemplate('negative', i)}
                    className="w-10 flex-shrink-0 flex items-center justify-center bg-red-50 text-red-600 hover:bg-red-100 rounded-xl transition-colors"
                    title="حذف القالب"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Save button (duplicate for convenience) */}
        <div className="flex items-center gap-4 mt-6">
          <button
            onClick={handleSaveSettings}
            disabled={saving}
            className="px-8 py-3 bg-primary text-primary-foreground font-bold rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity inline-flex items-center gap-2"
          >
            {saving ? <><Loader2 className="size-4 animate-spin" /> جاري الحفظ...</> : <><Save className="size-4" /> حفظ التعديلات</>}
          </button>
          {saveMsg && <StatusMsg ok={saveMsg.ok} text={saveMsg.text} />}
        </div>
      </Section>
      )}

      {/* ── Section 2: Change Password ───────────────────────────────────────── */}
      <Section title="تغيير كلمة المرور" icon={Lock}>
        <p className="text-sm text-muted-foreground mb-5">
          حسابك: <span className="font-mono bg-muted px-2 py-0.5 rounded-lg text-xs">{adminEmail}</span>
        </p>

        <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
          <div>
            <label className="block text-sm font-semibold mb-1.5">كلمة المرور الحالية</label>
            <input
              type="password"
              required
              value={currentPw}
              onChange={e => setCurrentPw(e.target.value)}
              className="w-full p-3 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary text-sm"
              placeholder="••••••••"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1.5">كلمة المرور الجديدة</label>
            <input
              type="password"
              required
              value={newPw}
              onChange={e => setNewPw(e.target.value)}
              className="w-full p-3 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary text-sm"
              placeholder="6 أحرف على الأقل"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1.5">تأكيد كلمة المرور الجديدة</label>
            <input
              type="password"
              required
              value={confirmPw}
              onChange={e => setConfirmPw(e.target.value)}
              className={`w-full p-3 rounded-xl border bg-background outline-none focus:ring-2 focus:ring-primary text-sm ${
                confirmPw && newPw !== confirmPw ? 'border-red-400' : 'border-border'
              }`}
              placeholder="••••••••"
            />
            {confirmPw && newPw !== confirmPw && (
              <p className="text-xs text-red-500 mt-1">كلمتا المرور غير متطابقتين</p>
            )}
          </div>

          {pwMsg && (
            <div className={`flex items-center gap-2 rounded-xl p-3 text-sm font-semibold ${pwMsg.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300' : 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/30 dark:border-red-800 dark:text-red-300'}`}>
              {pwMsg.ok ? <CheckCircle2 className="size-4 shrink-0" /> : <XCircle className="size-4 shrink-0" />}
              {pwMsg.text}
            </div>
          )}

          <button
            type="submit"
            disabled={pwLoading || (!!confirmPw && newPw !== confirmPw)}
            className="w-full py-3 bg-primary text-primary-foreground font-bold rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity inline-flex items-center justify-center gap-2"
          >
            {pwLoading ? <><Loader2 className="size-4 animate-spin" /> جاري التغيير...</> : <><KeyRound className="size-4" /> تغيير كلمة المرور</>}
          </button>
        </form>
      </Section>

      {/* ── Section 2.5: Parent account security (owner only) ────────────────── */}
      {canRestore && (
      <Section title="أمان حسابات أولياء الأمور" icon={Users}>
        <p className="text-sm text-muted-foreground mb-4">
          كل ولي أمر جديد يبدأ بكلمة المرور الافتراضية <span className="font-mono bg-muted px-1.5 py-0.5 rounded">12345678</span>،
          وعند أول دخول يطلب منه النظام اختيار كلمة مرور خاصة به قبل أن يرى أي بيانات — فلا تحتاج لتتبّع كلمات المرور.
          <br />
          هذا الزر يعيد تطبيق نفس الطلب على <span className="font-bold">جميع</span> أولياء الأمور الحاليين.
        </p>
        <p className="text-sm text-emerald-700 bg-emerald-50 dark:bg-emerald-950/20 p-3 rounded-xl flex items-start gap-2 mb-4">
          <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
          <span>
            لا يترتب على هذا الإجراء إغلاق أي حساب — أولياء الأمور يدخلون بنفس كلمة مرورهم الحالية،
            ثم يُطلب منهم اختيار كلمة جديدة مع شرح السبب.
          </span>
        </p>

        {!rotateOpen ? (
          <button
            onClick={() => { setRotateOpen(true); setRotateMsg(null) }}
            className="px-6 py-3 bg-amber-600 text-white font-bold rounded-xl hover:opacity-90 inline-flex items-center gap-2 transition-transform hover:-translate-y-0.5"
          >
            <KeyRound className="size-4" /> إلزام الجميع باختيار كلمة مرور خاصة
          </button>
        ) : (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-4 space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-1.5 text-amber-900 dark:text-amber-200">
                اكتب كلمة <span className="font-mono bg-white/70 dark:bg-black/20 px-1.5 py-0.5 rounded">تغيير</span> للتأكيد
              </label>
              <input
                type="text"
                value={rotatePhrase}
                onChange={e => setRotatePhrase(e.target.value)}
                disabled={rotating}
                className="w-full max-w-xs p-2.5 rounded-xl border border-amber-300 dark:border-amber-800 bg-background outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                placeholder="تغيير"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleRotateParents}
                disabled={rotating || rotatePhrase !== 'تغيير'}
                className="px-6 py-2.5 bg-amber-600 text-white font-bold rounded-xl hover:opacity-90 disabled:opacity-40 inline-flex items-center gap-2"
              >
                {rotating
                  ? <><Loader2 className="size-4 animate-spin" /> جاري التنفيذ...</>
                  : <><KeyRound className="size-4" /> تنفيذ</>}
              </button>
              <button
                onClick={() => { setRotateOpen(false); setRotatePhrase('') }}
                disabled={rotating}
                className="px-6 py-2.5 bg-muted text-muted-foreground font-semibold rounded-xl hover:bg-muted/80 disabled:opacity-50"
              >
                إلغاء
              </button>
            </div>
          </div>
        )}

        {rotateMsg && <div className="mt-3"><StatusMsg ok={rotateMsg.ok} text={rotateMsg.text} /></div>}
      </Section>
      )}

      {/* ── Section 3: Backup (owner only) ───────────────────────────────────── */}
      {canBackup && (
      <Section title="النسخ الاحتياطي والأمان" icon={Database}>
        <p className="text-sm text-muted-foreground mb-5">
          {backupAllGrades
            ? 'يمكنك تحميل نسخة احتياطية كاملة (بصيغة JSON) تحتوي على كافة بيانات النظام (فصول، طلاب، معلمين، درجات، وسجلات حضور) للرجوع إليها في حالات الطوارئ.'
            : 'يمكنك تحميل نسخة احتياطية (بصيغة JSON) تشمل المراحل المسندة إليك فقط — بفصولها وطلابها وموادها وسجلات حضورها ودرجاتها.'}
        </p>

        <div className="flex items-center gap-4">
          <button
            onClick={handleBackup}
            disabled={backupLoading}
            className="px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-2"
          >
            {backupLoading ? <><Loader2 className="size-4 animate-spin" /> جاري تجهيز النسخة...</> : <><Download className="size-4" /> تحميل النسخة الاحتياطية الآن</>}
          </button>

          {backupMsg && <StatusMsg ok={backupMsg.ok} text={backupMsg.text} />}
        </div>

        {!backupAllGrades && (
          <p className="mt-3 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/20 p-3 rounded-xl flex items-start gap-2">
            <AlertTriangle className="size-4 shrink-0 mt-0.5" />
            هذه نسخة جزئية للاحتفاظ بها كسجل لمراحلك — لا تصلح لاستعادة المدرسة بالكامل، والاستعادة متاحة للمالك وحده.
          </p>
        )}

        {canRestore && (
        <>
        <hr className="border-border my-6" />

        {/* ── Restore from backup ── */}
        <div>
          <h3 className="font-bold flex items-center gap-2 mb-1.5">
            <RotateCcw className="size-4 text-indigo-600" /> الاستعادة من نسخة احتياطية
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            ارفع ملف JSON نزّلته سابقاً من هذه الميزة لاستعادة بيانات المدرسة كما كانت وقت أخذ النسخة.
            <span className="block text-amber-600 font-semibold text-xs mt-1">
              تنبيه: هذا الإجراء يستبدل كل البيانات الحالية (فصول، طلاب، معلمين، درجات، حضور) بمحتوى الملف ولا يمكن التراجع عنه.
              لا يشمل ذلك حسابات الدخول (البريد وكلمة المرور).
            </span>
          </p>

          {!pendingRestore && (
            <label className="inline-flex items-center gap-2 px-5 py-2.5 bg-muted hover:bg-muted/70 text-foreground font-semibold rounded-xl cursor-pointer transition-colors">
              <Upload className="size-4" /> اختيار ملف النسخة الاحتياطية
              <input ref={restoreFileRef} type="file" accept="application/json,.json" onChange={handleRestoreFileChange} className="hidden" />
            </label>
          )}

          {restoreFileError && (
            <p className="text-sm text-red-600 mt-2 inline-flex items-center gap-1.5"><XCircle className="size-4" />{restoreFileError}</p>
          )}

          {pendingRestore && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-4 space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400">
                  <AlertTriangle className="size-4.5" />
                </div>
                <div>
                  <p className="font-bold text-amber-900 dark:text-amber-200">تأكيد الاستعادة</p>
                  <p className="text-sm text-amber-800 dark:text-amber-300 mt-0.5">
                    {pendingRestore.timestamp
                      ? `النسخة الاحتياطية بتاريخ: ${new Date(pendingRestore.timestamp).toLocaleString('ar-SA')}`
                      : 'تاريخ النسخة غير معروف'}
                  </p>
                </div>
                <button onClick={cancelRestore} className="mr-auto p-1.5 text-amber-700 hover:bg-amber-100 rounded-lg transition-colors" title="إلغاء">
                  <X className="size-4" />
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {Object.entries(RESTORE_TABLE_LABELS).map(([key, label]) => (
                  <span key={key} className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-white/70 dark:bg-black/20 border border-amber-200 dark:border-amber-800">
                    <FileJson className="size-3" /> {pendingRestore.counts[key] ?? 0} {label}
                  </span>
                ))}
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1.5 text-amber-900 dark:text-amber-200">
                  اكتب كلمة <span className="font-mono bg-white/70 dark:bg-black/20 px-1.5 py-0.5 rounded">استعادة</span> للتأكيد
                </label>
                <input
                  type="text"
                  value={confirmPhrase}
                  onChange={e => setConfirmPhrase(e.target.value)}
                  className="w-full max-w-xs p-2.5 rounded-xl border border-amber-300 dark:border-amber-800 bg-background outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                  placeholder="استعادة"
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleConfirmRestore}
                  disabled={restoring || confirmPhrase !== 'استعادة'}
                  className="px-6 py-2.5 bg-red-600 text-white font-bold rounded-xl hover:opacity-90 disabled:opacity-40 transition-opacity flex items-center gap-2"
                >
                  {restoring ? <><Loader2 className="size-4 animate-spin" /> جاري الاستعادة...</> : <><RotateCcw className="size-4" /> تأكيد الاستعادة نهائياً</>}
                </button>
                <button onClick={cancelRestore} disabled={restoring} className="px-6 py-2.5 bg-muted text-muted-foreground font-semibold rounded-xl hover:bg-muted/80 disabled:opacity-50">
                  إلغاء
                </button>
              </div>
            </div>
          )}

          {restoreResult && <div className="mt-3"><StatusMsg ok={restoreResult.ok} text={restoreResult.text} /></div>}
        </div>
        </>
        )}
      </Section>
      )}

    </div>
  )
}
