'use client'

import { useState } from 'react'
import { sendNotification, deleteNotification } from './actions-notifications'
import { formatDateAr } from '@/lib/utils'
import { EmptyState } from '@/components/empty-state'

export default function NotificationsClient({ schoolId, userId, classes, students, notifications }: any) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [targetType, setTargetType] = useState('all') // all, class, student
  const [targetId, setTargetId] = useState('')
  const [type, setType] = useState('info')
  const [expiresIn, setExpiresIn] = useState('0')
  const [loading, setLoading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      let expiresAt = null
      if (expiresIn !== '0') {
        const d = new Date()
        d.setDate(d.getDate() + parseInt(expiresIn))
        expiresAt = d.toISOString()
      }

      const payload = {
        schoolId, fromUserId: userId, title, body, type, expiresAt,
        classId: targetType === 'class' ? targetId : null,
        studentId: targetType === 'student' ? targetId : null
      }
      await sendNotification(payload)
      setTitle(''); setBody('');
      alert('تم إرسال التنبيه بنجاح')
    } catch (err) {
      alert('حدث خطأ أثناء الإرسال')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا التنبيه؟')) return
    setDeletingId(id)
    try {
      await deleteNotification(id, schoolId)
    } catch (err) {
      alert('حدث خطأ أثناء الحذف')
    } finally {
      setDeletingId(null)
    }
  }

  const getTypeStyle = (t: string) => {
    switch (t) {
      case 'warning': return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800'
      case 'absence': return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800'
      case 'grade': return 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800'
      default: return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800'
    }
  }
  
  const getTypeLabel = (t: string) => {
    switch (t) {
      case 'warning': return 'تحذير'
      case 'absence': return 'غياب'
      case 'grade': return 'درجات'
      default: return 'معلومة'
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1">
        <div className="bg-card border border-border rounded-2xl p-6 sticky top-6">
          <h2 className="text-lg font-bold mb-4">إرسال تنبيه جديد</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-1">عنوان التنبيه</label>
              <input type="text" required value={title} onChange={e => setTitle(e.target.value)} className="w-full p-3 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary" placeholder="مثال: اجتماع أولياء الأمور" />
            </div>
            
            <div>
              <label className="block text-sm font-semibold mb-1">الرسالة</label>
              <textarea required value={body} onChange={e => setBody(e.target.value)} className="w-full p-3 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary min-h-[100px]" placeholder="نص التنبيه..." />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-1">نوع التنبيه</label>
                <select value={type} onChange={e => setType(e.target.value)} className="w-full p-3 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary">
                  <option value="info">معلومة عامة</option>
                  <option value="warning">تحذير / سلوك</option>
                  <option value="absence">إشعار غياب</option>
                  <option value="grade">إشعار درجات</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">صلاحية التنبيه</label>
                <select value={expiresIn} onChange={e => setExpiresIn(e.target.value)} className="w-full p-3 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary">
                  <option value="0">دائم (لا يحذف)</option>
                  <option value="1">يوم واحد</option>
                  <option value="3">3 أيام</option>
                  <option value="7">أسبوع</option>
                  <option value="30">شهر</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-1">المستهدف</label>
              <select value={targetType} onChange={e => { setTargetType(e.target.value); setTargetId('') }} className="w-full p-3 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary">
                <option value="all">الجميع</option>
                <option value="class">فصل محدد</option>
                <option value="student">طالب محدد</option>
              </select>
            </div>

            {targetType === 'class' && (
              <div className="animate-in fade-in slide-in-from-top-2">
                <label className="block text-sm font-semibold mb-1">اختر الفصل</label>
                <select required value={targetId} onChange={e => setTargetId(e.target.value)} className="w-full p-3 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary">
                  <option value="">-- اختر الفصل --</option>
                  {classes.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}

            {targetType === 'student' && (
              <div className="animate-in fade-in slide-in-from-top-2">
                <label className="block text-sm mb-1">اختر الطالب</label>
                <select required value={targetId} onChange={e => setTargetId(e.target.value)} className="w-full p-3 rounded-xl border border-border bg-background outline-none">
                  <option value="">-- اختر --</option>
                  {students.map((s: any) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
                </select>
              </div>
            )}

            <button type="submit" disabled={loading} className="w-full py-3 bg-primary text-primary-foreground font-semibold rounded-xl mt-4">
              {loading ? 'جاري الإرسال...' : 'إرسال التنبيه'}
            </button>
          </form>
        </div>
      </div>

      <div className="lg:col-span-2">
        <div className="bg-card border border-border rounded-2xl p-6">
          <h2 className="text-lg font-bold mb-4">التنبيهات المرسلة حديثاً</h2>
          {notifications.length === 0 ? (
            <EmptyState title="لا يوجد تنبيهات" description="لم يتم إرسال أي تنبيهات بعد" />
          ) : (
            <div className="space-y-3">
              {notifications.map((notif: any) => (
                <div key={notif.id} className={`p-4 rounded-xl border relative group ${getTypeStyle(notif.type)}`}>
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-lg">{notif.title}</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-1 rounded-md bg-white/50 dark:bg-black/20 font-bold">{getTypeLabel(notif.type)}</span>
                      <button
                        onClick={() => handleDelete(notif.id)}
                        disabled={deletingId === notif.id}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/50 dark:hover:bg-red-900"
                        title="حذف التنبيه"
                      >
                        {deletingId === notif.id ? '⏳' : '🗑️'}
                      </button>
                    </div>
                  </div>
                  <p className="text-sm mt-1">{notif.body}</p>
                  <div className="flex justify-between items-center mt-3 text-xs opacity-70">
                    <span>
                      المستهدف: {notif.studentId ? 'طالب محدد' : notif.classId ? 'فصل محدد' : 'الجميع'}
                    </span>
                    <div className="flex gap-4">
                      {notif.expiresAt && (
                        <span className="text-red-700 font-semibold dark:text-red-400">ينتهي: {formatDateAr(notif.expiresAt)}</span>
                      )}
                      <span>{formatDateAr(notif.createdAt)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
