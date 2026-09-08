'use client'

import { useState } from 'react'
import { addTeacher, deleteTeacher, resetTeacherPassword } from './actions-teachers'
import { EmptyState } from '@/components/empty-state'
import { GraduationCap, UserPlus, Pencil, Trash2, Phone, KeyRound, CheckCircle2, AlertTriangle, Copy, RotateCcw, Loader2 } from 'lucide-react'

export default function TeachersClient({ teachers, schoolId, canManage = true }: { teachers: any[], schoolId: string, canManage?: boolean }) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [editingTeacher, setEditingTeacher] = useState<any | null>(null)
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [resettingId, setResettingId] = useState<string | null>(null)

  const [successInfo, setSuccessInfo] = useState<{email: string, tempPassword: string, mode: 'created' | 'reset'} | null>(null)

  const handleResetPassword = async (teacher: any) => {
    if (!confirm(`إعادة تعيين كلمة مرور "${teacher.fullName}"؟ ستُنشأ كلمة مرور مؤقتة جديدة وتتوقف كلمة المرور الحالية عن العمل.`)) return
    setResettingId(teacher.id)
    try {
      const res = await resetTeacherPassword(teacher.id, teacher.userId)
      if (res.ok && res.tempPassword) {
        // The address comes from the account itself: a teacher whose phone was
        // edited still signs in with the email the account was created under.
        setEditingTeacher(null)
        setSuccessInfo({ email: res.email ?? '', tempPassword: res.tempPassword, mode: 'reset' })
        setIsModalOpen(true)
      } else {
        alert(res.error || 'حدث خطأ أثناء إعادة تعيين كلمة المرور')
      }
    } catch {
      alert('حدث خطأ أثناء إعادة تعيين كلمة المرور')
    } finally {
      setResettingId(null)
    }
  }

  const openAddModal = () => {
    setEditingTeacher(null)
    setFullName('')
    setPhone('')
    setIsModalOpen(true)
  }

  const openEditModal = (teacher: any) => {
    setEditingTeacher(teacher)
    setFullName(teacher.fullName)
    setPhone(teacher.phone || '')
    setIsModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (editingTeacher) {
        const { editTeacher } = await import('./actions-teachers')
        const res = await editTeacher(editingTeacher.id, editingTeacher.userId, { fullName, phone })
        if (!res.ok) { alert(res.error); return }
        closeModal()
      } else {
        const res = await addTeacher({ fullName, phone })
        if (!res.ok) { alert(res.error); return }
        setSuccessInfo({ email: res.email, tempPassword: res.tempPassword, mode: 'created' })
        setFullName('')
        setPhone('')
        // Don't close modal, show success info
      }
    } catch (err) {
      alert(`حدث خطأ أثناء ${editingTeacher ? 'تعديل' : 'إضافة'} المعلم`)
    } finally {
      setLoading(false)
    }
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setEditingTeacher(null)
    setSuccessInfo(null)
  }

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden bg-card border border-border rounded-2xl p-5">
        <div className="absolute -top-14 -right-10 size-40 rounded-full bg-emerald-400/10 blur-3xl pointer-events-none" />
        <div className="relative flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-[0_6px_16px_-4px_rgba(5,150,105,0.45)]">
              <GraduationCap className="size-5" />
            </div>
            <div>
              <p className="text-lg font-bold">{teachers.length} معلم</p>
              <p className="text-xs text-muted-foreground">إجمالي المعلمين المسجلين في المدرسة</p>
            </div>
          </div>
          {canManage && (
            <button
              onClick={openAddModal}
              className="px-6 py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:opacity-90 flex items-center gap-2 transition-transform hover:-translate-y-0.5"
            >
              <UserPlus className="size-4" /> إضافة معلم
            </button>
          )}
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {teachers.length === 0 ? (
          <div className="p-8"><EmptyState icon={GraduationCap} title="لا يوجد معلمون" description="قم بإضافة معلمين للبدء" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead className="bg-muted text-muted-foreground text-sm">
                <tr>
                  <th className="p-4 font-semibold">#</th>
                  <th className="p-4 font-semibold">الاسم</th>
                  <th className="p-4 font-semibold">رقم الجوال</th>
                  <th className="p-4 font-semibold">كلمة المرور</th>
                  <th className="p-4 font-semibold text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {teachers.map((teacher, i) => (
                  <tr key={teacher.id} className="hover:bg-muted/50 transition-colors">
                    <td className="p-4 text-muted-foreground">{i + 1}</td>
                    <td className="p-4">
                      <div className="flex items-center gap-2.5">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
                          {teacher.fullName?.charAt(0) ?? '؟'}
                        </div>
                        <span className="font-semibold">{teacher.fullName}</span>
                      </div>
                    </td>
                    <td className="p-4 text-muted-foreground">
                      {teacher.phone ? (
                        <span className="inline-flex items-center gap-1.5"><Phone className="size-3.5" />{teacher.phone}</span>
                      ) : '-'}
                    </td>
                    <td className="p-4">
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <KeyRound className="size-3.5" /> مشفّرة
                      </span>
                    </td>
                    <td className="p-4 text-center space-x-2 space-x-reverse">
                      {!canManage ? (
                        <span className="text-xs text-muted-foreground">اطّلاع فقط</span>
                      ) : (
                      <>
                      <button
                        onClick={() => handleResetPassword(teacher)}
                        disabled={resettingId === teacher.id}
                        className="inline-flex items-center gap-1.5 text-amber-600 hover:bg-amber-50 px-3 py-1 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                        title="إعادة تعيين كلمة المرور"
                      >
                        {resettingId === teacher.id ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
                        كلمة المرور
                      </button>
                      <button
                        onClick={() => openEditModal(teacher)}
                        className="inline-flex items-center gap-1.5 text-blue-600 hover:bg-blue-50 px-3 py-1 rounded-lg text-sm font-semibold transition-colors"
                      >
                        <Pencil className="size-3.5" /> تعديل
                      </button>
                      <button
                        onClick={async () => {
                          if (!confirm(`حذف المعلم "${teacher.fullName}" نهائياً؟\n\nسيُلغى إسناده من كل المواد، ولن يتمكن من الدخول بعد ذلك.`)) return
                          const res = await deleteTeacher(teacher.id, teacher.userId)
                          if (res && !res.ok) alert(res.error)
                        }}
                        className="inline-flex items-center gap-1.5 text-destructive hover:bg-destructive/10 px-3 py-1 rounded-lg text-sm font-semibold transition-colors"
                      >
                        <Trash2 className="size-3.5" /> حذف
                      </button>
                      </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-card p-6 rounded-3xl w-full max-w-md shadow-xl">
            {successInfo ? (
              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="size-8" />
                </div>
                <h2 className="text-xl font-bold">{successInfo.mode === 'reset' ? 'تم إعادة تعيين كلمة المرور' : 'تم إضافة المعلم بنجاح'}</h2>
                <div className="bg-muted p-4 rounded-xl text-right space-y-2">
                  <p className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground text-sm">البريد الإلكتروني</span>
                    <span className="font-bold dir-ltr text-sm">{successInfo.email}</span>
                  </p>
                  <p className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground text-sm">كلمة المرور</span>
                    <span className="font-bold font-mono text-sm inline-flex items-center gap-1"><Copy className="size-3.5 text-muted-foreground" />{successInfo.tempPassword}</span>
                  </p>
                </div>
                <p className="text-sm text-amber-600 bg-amber-50 p-3 rounded-xl flex items-center gap-2">
                  <AlertTriangle className="size-4 shrink-0" />
                  يرجى نسخ هذه البيانات ومشاركتها مع المعلم. لا يمكن استعادتها لاحقاً.
                </p>
                <button onClick={closeModal} className="w-full py-3 bg-primary text-primary-foreground font-semibold rounded-xl mt-4">إغلاق</button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-6">
                  <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-[0_6px_16px_-4px_rgba(5,150,105,0.45)]">
                    <UserPlus className="size-5" />
                  </div>
                  <h2 className="text-xl font-bold">{editingTeacher ? 'تعديل بيانات المعلم' : 'إضافة معلم جديد'}</h2>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm mb-1">الاسم الكامل</label>
                    <input type="text" required value={fullName} onChange={e => setFullName(e.target.value)} className="w-full p-3 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="block text-sm mb-1">رقم الجوال</label>
                    <input type="text" required value={phone} onChange={e => setPhone(e.target.value)} className="w-full p-3 rounded-xl border border-border bg-background outline-none" placeholder="05XXXXXXXX" />
                  </div>
                  <div className="flex gap-4 mt-8">
                    <button type="submit" disabled={loading} className="flex-1 py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:opacity-90 disabled:opacity-50">
                      {loading ? 'جاري الحفظ...' : editingTeacher ? 'حفظ التعديلات' : 'إضافة'}
                    </button>
                    <button type="button" onClick={closeModal} className="flex-1 py-3 bg-muted text-muted-foreground font-semibold rounded-xl hover:bg-muted/80">
                      إلغاء
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
