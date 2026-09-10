'use client'

import { useState } from 'react'
import { authClient } from '@/lib/auth-client'
import { NotificationBell } from '@/components/notification-bell'

export default function ParentSettingsPage() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

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
        // better-auth answers in English ("Invalid password"); the screen is Arabic.
        setMessage('كلمة المرور الحالية غير صحيحة — تأكد منها وحاول مرة أخرى.')
      } else {
        setStatus('success'); setMessage('تم تغيير كلمة المرور بنجاح! ✅')
        setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
      }
    } catch {
      setStatus('error'); setMessage('حدث خطأ غير متوقع.')
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">الإعدادات</h1>
          <p className="text-sm text-muted-foreground mt-1">إدارة إعدادات حسابك</p>
        </div>
        <NotificationBell />
      </div>

      <div className="bg-card border border-border rounded-3xl p-6">
        <h2 className="text-lg font-bold mb-5">تغيير كلمة المرور</h2>

        {status === 'success' && (
          <div className="mb-5 p-4 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-2xl text-sm">{message}</div>
        )}
        {status === 'error' && (
          <div className="mb-5 p-4 bg-red-50 text-red-700 border border-red-200 rounded-2xl text-sm">{message}</div>
        )}

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
            {status === 'loading' ? 'جاري الحفظ...' : 'حفظ التغييرات'}
          </button>
        </form>
      </div>
    </div>
  )
}
