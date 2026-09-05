'use client'

import { useState } from 'react'
import { authClient } from '@/lib/auth-client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ThemeToggle } from '@/components/theme-toggle'

export default function AdminLoginPage() {
  const [tab, setTab] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (tab === 'signin') {
        const res = await authClient.signIn.email({
          email,
          password
        })
        if (res.error) {
          setError(res.error.message || 'فشل تسجيل الدخول')
        } else {
          router.push('/admin')
        }
      } else {
        const res = await authClient.signUp.email({
          email,
          password,
          name,
        })
        if (res.error) {
          setError(res.error.message || 'فشل إنشاء الحساب')
        } else {
          const roleRes = await fetch('/api/set-role', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: 'admin' })
          })
          if (roleRes.ok) {
            router.push('/admin')
          } else {
            setError('حدث خطأ أثناء تعيين الصلاحية')
          }
        }
      }
    } catch (err: any) {
      setError('حدث خطأ غير متوقع')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 dir-rtl relative">
      <div className="absolute top-6 left-6">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md bg-card p-6 rounded-3xl border border-border shadow-sm">
        <div className="text-center mb-8">
          <Link href="/" className="text-primary font-bold text-2xl">مداد</Link>
          <h1 className="text-xl font-bold mt-4 text-foreground">بوابة الإدارة</h1>
          <p className="text-muted-foreground mt-2">قم بتسجيل الدخول أو إنشاء حساب جديد لإدارة النظام</p>
        </div>

        <div className="flex rounded-xl bg-muted p-1 mb-6">
          <button
            onClick={() => setTab('signin')}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${tab === 'signin' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            تسجيل الدخول
          </button>
          <button
            onClick={() => setTab('signup')}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${tab === 'signup' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            إنشاء حساب جديد
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {tab === 'signup' && (
            <div>
              <label className="block text-sm font-medium mb-1">الاسم الكامل</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full p-3 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="أدخل اسمك الكامل"
              />
            </div>
          )}
          
          <div>
            <label className="block text-sm font-medium mb-1">البريد الإلكتروني</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full p-3 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="admin@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">كلمة المرور</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full p-3 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading ? 'الرجاء الانتظار...' : tab === 'signin' ? 'دخول' : 'إنشاء حساب'}
          </button>
        </form>
      </div>
    </div>
  )
}
