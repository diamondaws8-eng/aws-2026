'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { authClient } from '@/lib/auth-client'
import { ThemeToggle } from '@/components/theme-toggle'
import { BackToPortals } from '@/components/back-to-portals'
import { BrandLogo } from '@/components/brand-logo'

export default function CounselorLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { error: signInError } = await authClient.signIn.email({ email, password })
      if (signInError) {
        setError('البريد الإلكتروني أو كلمة المرور غير صحيحة')
      } else {
        router.push('/counselor')
        router.refresh()
      }
    } catch {
      setError('حدث خطأ أثناء تسجيل الدخول')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4 relative">
      <div className="absolute top-6 left-6"><ThemeToggle /></div>
      <div className="absolute top-6 right-6"><BackToPortals /></div>
      <div className="max-w-md w-full bg-card border border-border rounded-2xl p-6 sm:p-8 shadow-sm">
        <div className="text-center mb-8">
          <BrandLogo size={88} />
          <h1 className="text-2xl font-bold text-foreground mt-4 mb-2">بوابة الموجه الطلابي</h1>
          <p className="text-muted-foreground">متابعة الحالات السلوكية</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100">{error}</div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">البريد الإلكتروني</label>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 text-left"
              dir="ltr" required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">كلمة المرور</label>
            <input
              type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 text-left"
              dir="ltr" required
            />
          </div>
          <button
            type="submit" disabled={loading}
            className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? 'جاري الدخول...' : 'تسجيل الدخول'}
          </button>
        </form>

        <div className="mt-8 text-center space-y-4">
          <p className="text-sm text-muted-foreground bg-muted p-4 rounded-xl">
            حسابك أُنشئ بواسطة الإدارة. تواصل مع المدير للحصول على بياناتك.
          </p>
          <Link href="/" className="inline-block text-sm text-primary hover:underline font-medium">
            &rarr; العودة إلى بوابات المدرسة
          </Link>
        </div>
      </div>
    </div>
  )
}
