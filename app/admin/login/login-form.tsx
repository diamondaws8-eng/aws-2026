'use client'

import { useState } from 'react'
import { authClient } from '@/lib/auth-client'
import { useRouter } from 'next/navigation'
import { School } from 'lucide-react'
import { AuthShell } from '@/components/auth-shell'

/**
 * Self-signup is only offered while no school exists yet (first-time setup).
 * Once the school is created, admin-side accounts are added from فريق الإدارة —
 * otherwise anyone could register and spin up their own school in the database.
 */
export default function AdminLoginForm({ allowSignup }: { allowSignup: boolean }) {
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
      if (tab === 'signin' || !allowSignup) {
        const res = await authClient.signIn.email({
          email,
          password
        })
        if (res.error) {
          // better-auth's own message is English ("Invalid email or password");
          // every other portal answers in Arabic, and so should this one.
          setError('بيانات الدخول غير صحيحة. تأكد من البريد الإلكتروني وكلمة المرور.')
          setLoading(false)
          return
        }
        // Stay in the loading state while the dashboard renders — clearing it
        // here would make the button look idle during the navigation.
        router.push('/admin')
        return
      }

      const res = await authClient.signUp.email({
        email,
        password,
        name,
      })
      if (res.error) {
        setError(res.error.message || 'فشل إنشاء الحساب')
        setLoading(false)
        return
      }

      const roleRes = await fetch('/api/set-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'admin' })
      })
      if (!roleRes.ok) {
        setError('حدث خطأ أثناء تعيين الصلاحية')
        setLoading(false)
        return
      }
      router.push('/admin')
    } catch (err: any) {
      setError('حدث خطأ غير متوقع')
      setLoading(false)
    }
  }

  return (
    <AuthShell
      portal="admin"
      title="بوابة الإدارة"
      subtitle={allowSignup ? 'قم بتسجيل الدخول أو إنشاء حساب جديد لإدارة النظام' : 'سجّل الدخول بحسابك الإداري'}
      icon={School}
      points={[
        'المراحل والفصول والطلاب والمعلمون في شاشة واحدة',
        'لوحة يومية مباشرة: الحضور والواجبات والسلوك لكل فصل',
        'سجل تدقيق يذكر من فعل ماذا ومتى — لكل قرار',
      ]}
    >

        {allowSignup && (
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
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {tab === 'signup' && allowSignup && (
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
    </AuthShell>
  )
}
