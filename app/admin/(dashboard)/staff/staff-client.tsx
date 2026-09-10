'use client'

import { useState } from 'react'
import { addStaff, editStaff, deleteStaff, resetStaffPassword } from './actions-staff'
import { EmptyState } from '@/components/empty-state'
import {
  ShieldCheck, UserCog, UserPlus, Pencil, Trash2, RotateCcw, Loader2, Crown,
  CheckCircle2, AlertTriangle, Copy, Layers, Eye, PencilLine, X, School, Database, HeartHandshake,
} from 'lucide-react'

type StaffRow = {
  id: string
  userId: string
  fullName: string
  phone: string | null
  role: string
  allGrades: boolean
  canEdit: boolean
  email: string | null
  gradeIds: string[]
}

type Grade = { id: string; name: string }

const ROLE_META: Record<string, { label: string; badge: string; icon: typeof ShieldCheck }> = {
  quality_manager: {
    label: 'مدير الجودة',
    badge: 'bg-violet-50 text-violet-700 border-violet-100',
    icon: ShieldCheck,
  },
  principal: {
    label: 'مدير مدرسة',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    icon: School,
  },
  deputy: {
    label: 'وكيل',
    badge: 'bg-blue-50 text-blue-700 border-blue-100',
    icon: UserCog,
  },
  counselor: {
    label: 'موجه طلابي',
    badge: 'bg-teal-50 text-teal-700 border-teal-100',
    icon: HeartHandshake,
  },
}

const ROLE_HINTS: Record<string, string> = {
  quality_manager: 'مدير الجودة يرى كل بيانات المدرسة ويملك صلاحيات المالك (عدا حذف المالك والاستعادة)، ويستطيع أخذ نسخة احتياطية كاملة.',
  principal: 'مدير المدرسة يتحكم بالكامل في المراحل المسندة إليه، ويستطيع أخذ نسخة احتياطية لمراحله فقط.',
  deputy: 'الوكيل يرى ويتابع المراحل المسندة إليه فقط.',
  counselor: 'الموجه الطلابي يعمل من بوابة خاصة به. تصله الحالات السلوكية التي يرفعها المعلمون قبل أن تصل لأي ولي أمر، ويقرر: يعالجها مع الطالب، أو يبلّغ ولي الأمر بصياغته، أو يحيلها لمسؤول يختاره بالاسم. لا يملك أي صلاحية على الطلاب أو المعلمين أو الإعدادات، وملاحظاته سرّية.',
}

export default function StaffClient({
  staff,
  grades,
  ownerName,
  ownerEmail,
  ownerLabel,
  currentUserId,
}: {
  staff: StaffRow[]
  grades: Grade[]
  ownerName: string
  ownerEmail: string
  ownerLabel: string
  currentUserId: string
}) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editing, setEditing] = useState<StaffRow | null>(null)
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [credentials, setCredentials] = useState<{ email: string; tempPassword: string; mode: 'created' | 'reset' } | null>(null)

  // form state
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<'quality_manager' | 'principal' | 'deputy' | 'counselor'>('deputy')
  const [allGrades, setAllGrades] = useState(false)
  const [gradeIds, setGradeIds] = useState<string[]>([])
  const [canEdit, setCanEdit] = useState(true)
  const [formError, setFormError] = useState('')

  const openAdd = () => {
    setEditing(null)
    setFullName(''); setEmail(''); setPhone('')
    setRole('deputy'); setAllGrades(false); setGradeIds([]); setCanEdit(true)
    setFormError('')
    setIsModalOpen(true)
  }

  const openEdit = (row: StaffRow) => {
    setEditing(row)
    setFullName(row.fullName); setEmail(row.email ?? ''); setPhone(row.phone ?? '')
    setRole(
      row.role === 'quality_manager' ? 'quality_manager'
      : row.role === 'principal' ? 'principal'
      : row.role === 'counselor' ? 'counselor'
      : 'deputy'
    )
    setAllGrades(row.allGrades); setGradeIds(row.gradeIds); setCanEdit(row.canEdit)
    setFormError('')
    setIsModalOpen(true)
  }

  const toggleGrade = (id: string) =>
    setGradeIds(prev => (prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    if (!allGrades && gradeIds.length === 0) {
      setFormError('اختر مرحلة واحدة على الأقل، أو فعّل "كل المراحل"')
      return
    }
    setLoading(true)
    try {
      if (editing) {
        const res = await editStaff(editing.id, { fullName, phone, role, allGrades, gradeLevelIds: gradeIds, canEdit })
        if (res.ok) setIsModalOpen(false)
        else setFormError(res.error || 'حدث خطأ')
      } else {
        const res = await addStaff({ fullName, email, phone, role, allGrades, gradeLevelIds: gradeIds, canEdit })
        if (res.ok) {
          setIsModalOpen(false)
          setCredentials({ email: res.email, tempPassword: res.tempPassword, mode: 'created' })
        } else {
          setFormError(res.error || 'حدث خطأ')
        }
      }
    } catch {
      setFormError('حدث خطأ غير متوقع')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (row: StaffRow) => {
    if (!confirm(`حذف حساب "${row.fullName}" نهائياً؟ لن يتمكن من الدخول للنظام بعد ذلك.`)) return
    setBusyId(row.id)
    try {
      const res = await deleteStaff(row.id)
      if (!res.ok) alert(res.error || 'حدث خطأ أثناء الحذف')
    } finally {
      setBusyId(null)
    }
  }

  const handleResetPassword = async (row: StaffRow) => {
    if (!confirm(`إعادة تعيين كلمة مرور "${row.fullName}"؟ ستتوقف كلمة المرور الحالية عن العمل.`)) return
    setBusyId(row.id)
    try {
      const res = await resetStaffPassword(row.id)
      if (res.ok) setCredentials({ email: res.email || (row.email ?? ''), tempPassword: res.tempPassword, mode: 'reset' })
      else alert(res.error || 'حدث خطأ أثناء إعادة تعيين كلمة المرور')
    } finally {
      setBusyId(null)
    }
  }

  const gradeNames = (row: StaffRow) => {
    if (row.allGrades) return 'كل المراحل'
    const names = row.gradeIds.map(id => grades.find(g => g.id === id)?.name).filter(Boolean)
    return names.length ? names.join('، ') : 'بدون مراحل'
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden bg-card border border-border rounded-2xl p-5">
        <div className="absolute -top-14 -right-10 size-40 rounded-full bg-violet-400/10 blur-3xl pointer-events-none" />
        <div className="relative flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-[0_6px_16px_-4px_rgba(124,58,237,0.45)]">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <p className="text-lg font-bold">{staff.length + 1} حساب إداري</p>
              <p className="text-xs text-muted-foreground">المالك + {staff.length} من فريق الإدارة</p>
            </div>
          </div>
          <button
            onClick={openAdd}
            className="px-6 py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:opacity-90 flex items-center gap-2 transition-transform hover:-translate-y-0.5"
          >
            <UserPlus className="size-4" /> إضافة عضو
          </button>
        </div>
      </div>

      {/* Owner card — never removable */}
      <div className="rounded-2xl border border-amber-200 bg-gradient-to-l from-amber-50 to-transparent dark:from-amber-950/30 dark:border-amber-800 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400">
              <Crown className="size-5" />
            </div>
            <div>
              <p className="font-bold">{ownerName}</p>
              <p className="text-xs text-muted-foreground dir-ltr text-right">{ownerEmail}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
              {ownerLabel}
            </span>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-muted text-muted-foreground">
              صلاحيات كاملة — لا يمكن حذفه
            </span>
          </div>
        </div>
      </div>

      {/* Staff list */}
      {staff.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="لا يوجد أعضاء في فريق الإدارة"
          description="أضف مدير جودة أو وكيلاً ليساعدك في إدارة المدرسة"
        />
      ) : (
        <div className="space-y-3">
          {staff.map(row => {
            const meta = ROLE_META[row.role] ?? ROLE_META.deputy
            const RoleIcon = meta.icon
            const isSelf = row.userId === currentUserId
            return (
              <div key={row.id} className="rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/30">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-full bg-muted text-sm font-bold">
                      {row.fullName.slice(0, 1)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold flex items-center gap-2">
                        {row.fullName}
                        {isSelf && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">أنت</span>}
                      </p>
                      <p className="text-xs text-muted-foreground dir-ltr text-right">{row.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border ${meta.badge}`}>
                      <RoleIcon className="size-3.5" /> {meta.label}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-muted text-muted-foreground">
                      <Layers className="size-3.5" /> {gradeNames(row)}
                    </span>
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${
                      row.canEdit ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-50 text-slate-600 border-slate-200'
                    }`}>
                      {row.canEdit ? <><PencilLine className="size-3.5" /> يملك التعديل</> : <><Eye className="size-3.5" /> اطّلاع فقط</>}
                    </span>
                    {(row.role === 'quality_manager' || row.role === 'principal') && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                        <Database className="size-3.5" />
                        {row.role === 'quality_manager' || row.allGrades ? 'نسخة احتياطية كاملة' : 'نسخة لمراحله'}
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-border flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => handleResetPassword(row)}
                    disabled={busyId === row.id}
                    className="inline-flex items-center gap-1.5 text-amber-600 hover:bg-amber-50 px-3 py-2.5 sm:py-1 min-h-10 sm:min-h-0 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                  >
                    {busyId === row.id ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
                    كلمة المرور
                  </button>
                  <button
                    onClick={() => openEdit(row)}
                    className="inline-flex items-center gap-1.5 text-blue-600 hover:bg-blue-50 px-3 py-2.5 sm:py-1 min-h-10 sm:min-h-0 rounded-lg text-sm font-semibold transition-colors"
                  >
                    <Pencil className="size-3.5" /> تعديل الصلاحيات
                  </button>
                  {!isSelf && (
                    <button
                      onClick={() => handleDelete(row)}
                      disabled={busyId === row.id}
                      className="inline-flex items-center gap-1.5 text-destructive hover:bg-destructive/10 px-3 py-2.5 sm:py-1 min-h-10 sm:min-h-0 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="size-3.5" /> حذف
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Add / edit modal ── */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-card rounded-3xl w-full max-w-lg shadow-xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-6 border-b border-border shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-[0_6px_16px_-4px_rgba(124,58,237,0.45)]">
                  <ShieldCheck className="size-5" />
                </div>
                <h2 className="text-xl font-bold">{editing ? 'تعديل صلاحيات العضو' : 'إضافة عضو لفريق الإدارة'}</h2>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="w-9 h-9 flex items-center justify-center rounded-xl bg-muted hover:bg-muted/80 text-muted-foreground transition-colors">
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-1.5">الاسم الكامل</label>
                <input
                  type="text" required value={fullName} onChange={e => setFullName(e.target.value)}
                  className="w-full p-3 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-1.5">البريد الإلكتروني (اسم الدخول)</label>
                  <input
                    type="email" required={!editing} disabled={!!editing} value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full p-3 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary disabled:opacity-60 dir-ltr text-right"
                    placeholder="name@example.com"
                  />
                  {editing && <p className="text-xs text-muted-foreground mt-1">يستطيع العضو تغيير بريده من صفحة الإعدادات</p>}
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1.5">رقم الجوال (اختياري)</label>
                  <input
                    type="text" value={phone} onChange={e => setPhone(e.target.value)}
                    className="w-full p-3 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary"
                    placeholder="05XXXXXXXX"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1.5">الدور</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(['quality_manager', 'principal', 'deputy', 'counselor'] as const).map(r => {
                    const meta = ROLE_META[r]
                    const Icon = meta.icon
                    const active = role === r
                    return (
                      <button
                        key={r} type="button"
                        onClick={() => { setRole(r); if (r !== 'deputy') setCanEdit(true) }}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-semibold text-center transition-colors ${
                          active ? 'border-primary bg-primary/5 text-foreground' : 'border-border text-muted-foreground hover:bg-muted/50'
                        }`}
                      >
                        <Icon className="size-4" /> {meta.label}
                      </button>
                    )
                  })}
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">{ROLE_HINTS[role]}</p>
              </div>

              <div className="rounded-2xl border border-border p-4 space-y-3">
                <label className="flex items-center justify-between gap-3 cursor-pointer">
                  <span className="text-sm font-semibold">
                    {role === 'deputy' ? 'الوصول لكل المراحل'
                      : role === 'counselor' ? 'استقبال حالات كل المراحل'
                      : 'التحكم في كل المراحل'}
                  </span>
                  <input
                    type="checkbox" checked={allGrades}
                    onChange={e => setAllGrades(e.target.checked)}
                    className="size-5 accent-primary"
                  />
                </label>

                {!allGrades && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">
                      {role === 'quality_manager'
                        ? 'اختر المراحل التي يستطيع التحكم بها (سيظل يرى بقية المدرسة للاطلاع)'
                        : role === 'principal'
                          ? 'اختر المراحل التي يديرها — نسخته الاحتياطية ستشمل هذه المراحل فقط'
                          : 'اختر المراحل المسندة للوكيل'}
                    </p>
                    {grades.length === 0 ? (
                      <p className="text-sm text-muted-foreground">لا توجد مراحل دراسية بعد</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {grades.map(g => {
                          const active = gradeIds.includes(g.id)
                          return (
                            <button
                              key={g.id} type="button" onClick={() => toggleGrade(g.id)}
                              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                                active ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-muted-foreground border-border hover:bg-muted/70'
                              }`}
                            >
                              {g.name}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {role === 'deputy' && (
                <label className="flex items-center justify-between gap-3 rounded-2xl border border-border p-4 cursor-pointer">
                  <span>
                    <span className="text-sm font-semibold block">السماح بالتعديل</span>
                    <span className="text-xs text-muted-foreground">عند الإيقاف يصبح الحساب للاطلاع فقط دون أي تعديل</span>
                  </span>
                  <input type="checkbox" checked={canEdit} onChange={e => setCanEdit(e.target.checked)} className="size-5 accent-primary" />
                </label>
              )}

              {formError && (
                <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950/30 p-3 rounded-xl">{formError}</p>
              )}

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={loading} className="flex-1 py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:opacity-90 disabled:opacity-50 inline-flex items-center justify-center gap-2">
                  {loading ? <><Loader2 className="size-4 animate-spin" /> جاري الحفظ...</> : editing ? 'حفظ التعديلات' : 'إنشاء الحساب'}
                </button>
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-3 bg-muted text-muted-foreground font-semibold rounded-xl hover:bg-muted/80">
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Credentials modal ── */}
      {credentials && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-card p-6 rounded-3xl w-full max-w-md shadow-xl text-center space-y-4">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="size-8" />
            </div>
            <h2 className="text-xl font-bold">
              {credentials.mode === 'reset' ? 'تم إعادة تعيين كلمة المرور' : 'تم إنشاء الحساب بنجاح'}
            </h2>
            <div className="bg-muted p-4 rounded-xl text-right space-y-2">
              <p className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground text-sm">البريد الإلكتروني</span>
                <span className="font-bold dir-ltr text-sm">{credentials.email}</span>
              </p>
              <p className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground text-sm">كلمة المرور</span>
                <span className="font-bold font-mono text-sm inline-flex items-center gap-1">
                  <Copy className="size-3.5 text-muted-foreground" />{credentials.tempPassword}
                </span>
              </p>
            </div>
            <p className="text-sm text-amber-600 bg-amber-50 p-3 rounded-xl flex items-center gap-2">
              <AlertTriangle className="size-4 shrink-0" />
              انسخ هذه البيانات وشاركها مع صاحب الحساب — يمكنه تغييرها لاحقاً من الإعدادات.
            </p>
            <button onClick={() => setCredentials(null)} className="w-full py-3 bg-primary text-primary-foreground font-semibold rounded-xl">
              إغلاق
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
