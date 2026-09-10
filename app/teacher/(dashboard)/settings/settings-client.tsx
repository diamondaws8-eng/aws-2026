'use client'

import { useState } from 'react'
import { authClient } from '@/lib/auth-client'
import { updateTeacherSettings } from './actions'
import { NotificationBell } from '@/components/notification-bell'

type Templates = { positive: string[]; negative: string[] }

export function TeacherSettingsClient({
  teacherId,
  initialPhone,
  initialTemplates
}: {
  teacherId: string
  initialPhone: string
  initialTemplates: Templates
}) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  
  const [phone, setPhone] = useState(initialPhone)
  const [newEmail, setNewEmail] = useState('')
  const [templates, setTemplates] = useState<Templates>(initialTemplates)
  
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newEmail.includes('@')) {
      setStatus('error'); setMessage('البريد الإلكتروني غير صالح.'); return
    }
    setStatus('loading'); setMessage('')
    try {
      const res = await authClient.changeEmail({ newEmail })
      if (res.error) {
        setStatus('error')
        setMessage('تعذّر تغيير البريد الإلكتروني — قد يكون مستخدماً بحساب آخر.')
      } else {
        setStatus('success'); setMessage('تم تغيير البريد الإلكتروني لتسجيل الدخول بنجاح! ✅')
        setNewEmail('')
      }
    } catch {
      setStatus('error'); setMessage('حدث خطأ غير متوقع.')
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      setStatus('error'); setMessage('كلمة المرور الجديدة غير متطابقة.'); return
    }
    if (newPassword.length < 8) {
      setStatus('error'); setMessage('كلمة المرور يجب أن تكون 8 أحرف على الأقل.'); return
    }
    setStatus('loading'); setMessage('')
    try {
      const res = await authClient.changePassword({
        newPassword, currentPassword, revokeOtherSessions: true,
      })
      if (res.error) {
        setStatus('error')
        setMessage('كلمة المرور الحالية غير صحيحة — تأكد منها وحاول مرة أخرى.')
      } else {
        setStatus('success'); setMessage('تم تغيير كلمة المرور بنجاح! ✅')
        setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
      }
    } catch {
      setStatus('error'); setMessage('حدث خطأ غير متوقع.')
    }
  }

  const handleSaveProfile = async () => {
    setStatus('loading'); setMessage('')
    try {
      await updateTeacherSettings(teacherId, { phone, whatsappTemplates: templates })
      setStatus('success'); setMessage('تم حفظ الإعدادات الشخصية والقوالب بنجاح! ✅')
    } catch {
      setStatus('error'); setMessage('حدث خطأ أثناء الحفظ.')
    }
  }

  const addTemplate = (type: 'positive' | 'negative') => {
    setTemplates(prev => ({
      ...prev,
      [type]: [...prev[type], '']
    }))
  }

  const updateTemplate = (type: 'positive' | 'negative', index: number, val: string) => {
    setTemplates(prev => {
      const arr = [...prev[type]]
      arr[index] = val
      return { ...prev, [type]: arr }
    })
  }

  const removeTemplate = (type: 'positive' | 'negative', index: number) => {
    setTemplates(prev => {
      const arr = [...prev[type]]
      arr.splice(index, 1)
      return { ...prev, [type]: arr }
    })
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">الإعدادات</h1>
          <p className="text-sm text-muted-foreground mt-1">إدارة حسابك وقوالب واتساب الخاصة بك</p>
        </div>
        <NotificationBell />
      </div>

      {status === 'success' && (
        <div className="p-4 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-2xl text-sm">{message}</div>
      )}
      {status === 'error' && (
        <div className="p-4 bg-red-50 text-red-700 border border-red-200 rounded-2xl text-sm">{message}</div>
      )}

      {/* Profile & WhatsApp Templates */}
      <div className="bg-card border border-border rounded-3xl p-6">
        <h2 className="text-lg font-bold mb-5">الإعدادات الشخصية</h2>
        
        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium mb-1">رقم الجوال (اختياري - لن يغير بريد الدخول)</label>
            <input
              type="text" dir="ltr" value={phone}
              onChange={e => setPhone(e.target.value)}
              className="w-full p-3 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary text-left"
            />
          </div>
        </div>

        <h2 className="text-lg font-bold mb-5 border-t border-border pt-6">قوالب واتساب الخاصة بك</h2>
        <p className="text-sm text-muted-foreground mb-4">
          يمكنك استخدام المتغيرات التالية: {'{student}'}، {'{teacher}'}، {'{school}'}.
          <br/>تُضاف هذه القوالب بالإضافة للقوالب الأساسية للإدارة ولن يراها أحد غيرك.
        </p>

        {/* Positive */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold text-emerald-600">رسائل إيجابية / شكر</h3>
            <button onClick={() => addTemplate('positive')} className="text-sm bg-emerald-100 text-emerald-700 px-3 py-1 rounded-lg hover:bg-emerald-200">
              + إضافة قالب
            </button>
          </div>
          {templates.positive.length === 0 && <p className="text-xs text-muted-foreground mb-2">لا توجد قوالب خاصة بك.</p>}
          <div className="space-y-3">
            {templates.positive.map((tpl, i) => (
              <div key={i} className="flex gap-2">
                <textarea
                  value={tpl}
                  onChange={e => updateTemplate('positive', i, e.target.value)}
                  className="w-full p-3 rounded-xl border border-border bg-background text-sm min-h-[80px]"
                  placeholder="السلام عليكم، نود شكر الطالب {student}..."
                />
                <button onClick={() => removeTemplate('positive', i)} className="text-red-500 hover:bg-red-50 px-2 rounded-xl">✕</button>
              </div>
            ))}
          </div>
        </div>

        {/* Negative */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold text-red-600">رسائل سلبية / تنبيه</h3>
            <button onClick={() => addTemplate('negative')} className="text-sm bg-red-100 text-red-700 px-3 py-1 rounded-lg hover:bg-red-200">
              + إضافة قالب
            </button>
          </div>
          {templates.negative.length === 0 && <p className="text-xs text-muted-foreground mb-2">لا توجد قوالب خاصة بك.</p>}
          <div className="space-y-3">
            {templates.negative.map((tpl, i) => (
              <div key={i} className="flex gap-2">
                <textarea
                  value={tpl}
                  onChange={e => updateTemplate('negative', i, e.target.value)}
                  className="w-full p-3 rounded-xl border border-border bg-background text-sm min-h-[80px]"
                  placeholder="عذراً، نود تنبيهكم بأن الطالب {student}..."
                />
                <button onClick={() => removeTemplate('negative', i)} className="text-red-500 hover:bg-red-50 px-2 rounded-xl">✕</button>
              </div>
            ))}
          </div>
        </div>

        <button onClick={handleSaveProfile} disabled={status === 'loading'}
          className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity">
          {status === 'loading' ? 'جاري الحفظ...' : 'حفظ الإعدادات والقوالب'}
        </button>
      </div>

      <div className="bg-card border border-border rounded-3xl p-6">
        <h2 className="text-lg font-bold mb-5">تغيير كلمة المرور</h2>
        <form onSubmit={handleChangePassword} className="space-y-4">
          {[
            { label: 'كلمة المرور الحالية', value: currentPassword, set: setCurrentPassword },
            { label: 'كلمة المرور الجديدة', value: newPassword, set: setNewPassword },
            { label: 'تأكيد كلمة المرور الجديدة', value: confirmPassword, set: setConfirmPassword },
          ].map(field => (
            <div key={field.label}>
              <label className="block text-sm font-medium mb-1">{field.label}</label>
              <input
                type="password" dir="ltr" value={field.value}
                onChange={e => field.set(e.target.value)} required
                className="w-full p-3 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary text-left"
              />
            </div>
          ))}
          <button type="submit" disabled={status === 'loading'}
            className="w-full py-3 mt-2 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity">
            {status === 'loading' ? 'جاري الحفظ...' : 'تغيير كلمة المرور'}
          </button>
        </form>
      </div>

      <div className="bg-card border border-border rounded-3xl p-6">
        <h2 className="text-lg font-bold mb-5">تغيير بريد الدخول</h2>
        <form onSubmit={handleChangeEmail} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">البريد الإلكتروني الجديد</label>
            <input
              type="email" dir="ltr" value={newEmail}
              onChange={e => setNewEmail(e.target.value)} required
              placeholder="example@teacher.midad.local"
              className="w-full p-3 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary text-left"
            />
          </div>
          <button type="submit" disabled={status === 'loading'}
            className="w-full py-3 mt-2 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity">
            {status === 'loading' ? 'جاري الحفظ...' : 'تغيير البريد الإلكتروني'}
          </button>
        </form>
      </div>
    </div>
  )
}
