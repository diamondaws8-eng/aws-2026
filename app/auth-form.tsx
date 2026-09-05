'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'

export function AuthForm({ role, phoneMode = false }: { role: 'admin' | 'teacher' | 'parent'; phoneMode?: boolean }) {
  const router = useRouter(); const [error, setError] = useState(''); const [loading, setLoading] = useState(false)
  async function submit(form: HTMLFormElement) { setLoading(true); setError(''); const data = new FormData(form); const email = phoneMode ? `${String(data.get('phone')).replace(/\\D/g, '')}@parent.midad.local` : String(data.get('email')); const result = await authClient.signIn.email({ email, password: String(data.get('password')) }); if (result.error) setError('بيانات الدخول غير صحيحة.'); else { router.push(`/${role}`); router.refresh() }; setLoading(false) }
  return <form onSubmit={(e) => { e.preventDefault(); submit(e.currentTarget) }} className="mt-8 space-y-5">{phoneMode ? <label className="block text-sm font-semibold">رقم الجوال<input name="phone" required inputMode="tel" className="mt-2 h-12 w-full rounded-xl border border-input bg-background px-4" /></label> : <label className="block text-sm font-semibold">البريد الإلكتروني<input name="email" type="email" required className="mt-2 h-12 w-full rounded-xl border border-input bg-background px-4" /></label>}<label className="block text-sm font-semibold">كلمة المرور<input name="password" type="password" required minLength={8} className="mt-2 h-12 w-full rounded-xl border border-input bg-background px-4" /></label>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<button disabled={loading} className="w-full rounded-xl bg-primary py-3 font-bold text-primary-foreground">{loading ? 'جارٍ التحقق...' : 'تسجيل الدخول'}</button></form>
}
