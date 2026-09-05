'use client'

import { useState } from 'react'
import { addTeacher, deleteTeacher } from './actions-teachers'
import { EmptyState } from '@/components/empty-state'

export default function TeachersClient({ teachers, schoolId }: { teachers: any[], schoolId: string }) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [editingTeacher, setEditingTeacher] = useState<any | null>(null)
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  
  const [successInfo, setSuccessInfo] = useState<{email: string, tempPassword: string} | null>(null)

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
        await editTeacher(editingTeacher.id, editingTeacher.userId, { fullName, phone })
        closeModal()
      } else {
        const res = await addTeacher({ fullName, phone })
        setSuccessInfo({ email: res.email, tempPassword: res.tempPassword })
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
      <div className="flex justify-end">
        <button 
          onClick={openAddModal}
          className="px-6 py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:opacity-90"
        >
          + إضافة معلم
        </button>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {teachers.length === 0 ? (
          <div className="p-8"><EmptyState title="لا يوجد معلمون" description="قم بإضافة معلمين للبدء" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead className="bg-muted text-muted-foreground text-sm">
                <tr>
                  <th className="p-4 font-semibold">#</th>
                  <th className="p-4 font-semibold">الاسم</th>
                  <th className="p-4 font-semibold">رقم الجوال</th>
                  <th className="p-4 font-semibold">كلمة المرور المؤقتة</th>
                  <th className="p-4 font-semibold text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {teachers.map((teacher, i) => (
                  <tr key={teacher.id} className="hover:bg-muted/50">
                    <td className="p-4">{i + 1}</td>
                    <td className="p-4 font-semibold">{teacher.fullName}</td>
                    <td className="p-4 text-muted-foreground">{teacher.phone || '-'}</td>
                    <td className="p-4 text-muted-foreground">{teacher.tempPassword || 'تم التغيير'}</td>
                    <td className="p-4 text-center space-x-2 space-x-reverse">
                      <button 
                        onClick={() => openEditModal(teacher)}
                        className="text-blue-600 hover:bg-blue-50 px-3 py-1 rounded-lg text-sm font-semibold transition-colors"
                      >
                        تعديل
                      </button>
                      <button 
                        onClick={() => {
                          if (confirm('هل أنت متأكد من حذف هذا المعلم؟')) deleteTeacher(teacher.id, teacher.userId)
                        }}
                        className="text-destructive hover:bg-destructive/10 px-3 py-1 rounded-lg text-sm font-semibold transition-colors"
                      >
                        حذف
                      </button>
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
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                </div>
                <h2 className="text-xl font-bold">تم إضافة المعلم بنجاح</h2>
                <div className="bg-muted p-4 rounded-xl text-right space-y-2">
                  <p><span className="text-muted-foreground">البريد الإلكتروني:</span> <span className="font-bold dir-ltr block mt-1">{successInfo.email}</span></p>
                  <p><span className="text-muted-foreground">كلمة المرور:</span> <span className="font-bold block mt-1">{successInfo.tempPassword}</span></p>
                </div>
                <p className="text-sm text-amber-600 bg-amber-50 p-3 rounded-xl">يرجى نسخ هذه البيانات ومشاركتها مع المعلم. لا يمكن استعادتها لاحقاً.</p>
                <button onClick={closeModal} className="w-full py-3 bg-primary text-primary-foreground font-semibold rounded-xl mt-4">إغلاق</button>
              </div>
            ) : (
              <>
                <h2 className="text-xl font-bold mb-6">{editingTeacher ? 'تعديل بيانات المعلم' : 'إضافة معلم جديد'}</h2>
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
