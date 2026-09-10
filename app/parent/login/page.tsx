'use client'

import { useState } from 'react'
import { authClient } from '@/lib/auth-client'
import { parentEmailCandidates } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { UsersRound } from 'lucide-react'
import { AuthShell } from '@/components/auth-shell'

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
    <AuthShell
      portal="parent"
      title="بوابة ولي الأمر"
      subtitle="أدخل رقم جوالك المسجل في المدرسة"
      icon={UsersRound}
      points={[
        'حضور ابنك اليوم، وغيابه يصلك فور تسجيله',
        'درجاته ونقاطه وملاحظات كل معلم في مكان واحد',
        'تنبيهات المدرسة تصلك هنا لا في مجموعات الواتساب',
      ]}
    >

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
    </AuthShell>
  )
}
