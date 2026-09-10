'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { authClient } from '@/lib/auth-client'
import { HeartHandshake } from 'lucide-react'
import { AuthShell } from '@/components/auth-shell'

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
    <AuthShell
      portal="counselor"
      title="بوابة الموجه الطلابي"
      subtitle="متابعة الحالات السلوكية"
      icon={HeartHandshake}
      points={[
        'لا شيء يصل إلى ولي الأمر قبل أن تقرأه وتقرّر',
        'خلفية كل حالة أمامك: الغياب والنقاط والدرجات',
        'قوالبك الخاصة لصياغة الرسائل — بداية لا قرار',
      ]}
    >

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
    </AuthShell>
  )
}
