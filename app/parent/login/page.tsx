'use client'

import { useState } from 'react'
import { authClient } from '@/lib/auth-client'
import { parentEmailCandidates } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { ThemeToggle } from '@/components/theme-toggle'
import { BackToPortals } from '@/components/back-to-portals'
import { BrandLogo } from '@/components/brand-logo'

export default function ParentLoginPage() {
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    // Accounts were filed under the digits whoever added the student happened
    // to type, so 501234567 and 0501234567 are both real addresses in the
    // database. Trying one of them and reporting "wrong password" is what sent
    // parents to the school to reset a password that was never wrong.
    const candidates = parentEmailCandidates(phone)

    try {
      let signInError: unknown = null
      for (const email of candidates) {
        const res = await authClient.signIn.email({ email, password })
        signInError = res.error
        if (!res.error) break
      }

      if (signInError) {
        setError('بيانات الدخول غير صحيحة. تأكد من رقم الجوال وكلمة المرور.')
        setLoading(false)
      } else {
        router.push('/parent')
        router.refresh()
      }
    } catch {
      setError('حدث خطأ أثناء تسجيل الدخول')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4 relative">
      <div className="absolute top-6 left-6">
        <ThemeToggle />
      </div>
      <div className="absolute top-6 right-6">
        <BackToPortals />
      </div>
      <div className="max-w-md w-full bg-card p-8 rounded-3xl shadow-sm border border-border">
        <div className="text-center mb-8">
          <BrandLogo size={88} />
          <h1 className="text-xl font-bold text-foreground mt-4">تسجيل دخول ولي الأمر</h1>
          <p className="text-muted-foreground text-sm mt-2">
            أدخل رقم جوالك المسجل في المدرسة
          </p>
        </div>

        {error && (
          <div className="bg-destructive/10 text-destructive p-3 rounded-xl mb-6 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">رقم الجوال</label>
            <input
              type="tel"
              inputMode="tel"
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="05..."
              required
              className="w-full p-3 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary text-left"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">كلمة المرور</label>
            <input
              type="password"
              dir="ltr"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full p-3 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary text-left"
            />
            <p className="text-xs text-muted-foreground mt-2">
              إذا كانت هذه أول مرة، استخدم كلمة المرور المبدئية <strong>12345678</strong> وسيطلب منك النظام
              اختيار كلمة مرور خاصة بك. وإذا نسيت كلمتك، تواصل مع إدارة المدرسة.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading ? 'جاري تسجيل الدخول...' : 'دخول'}
          </button>
        </form>

      </div>
    </div>
  )
}
