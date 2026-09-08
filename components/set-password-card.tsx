'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BrandLogo } from '@/components/brand-logo'
import { ShieldCheck, Loader2, XCircle, Eye, EyeOff } from 'lucide-react'

export type SetPasswordResult = { ok: true } | { ok: false; error?: string }

/**
 * Stands in for the whole portal while an account still carries the password an
 * administrator handed out. Nothing behind it is reachable until the person
 * picks their own, so a password read off a printed list stops being a way in.
 *
 * The caller supplies the server action, which is what lets the parent and the
 * teacher portals share one screen without sharing an endpoint.
 */
export function SetPasswordCard({
  name,
  intro,
  submit,
}: {
  name: string
  intro: React.ReactNode
  submit: (password: string, confirm: string) => Promise<SetPasswordResult>
}) {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const mismatch = confirm.length > 0 && password !== confirm

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await submit(password, confirm)
      if (res.ok) {
        router.refresh()
        return
      }
      setError(res.error || 'حدث خطأ')
      setLoading(false)
    } catch {
      setError('حدث خطأ غير متوقع')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md bg-card border border-border rounded-3xl shadow-sm p-6">
        <div className="text-center mb-6">
          <BrandLogo size={72} href={null} />
          <div className="mt-4 inline-flex size-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
            <ShieldCheck className="size-6" />
          </div>
          <h1 className="text-xl font-bold mt-3">مرحباً {name}</h1>
        </div>

        <div className="rounded-2xl bg-muted/60 p-4 text-sm leading-6 text-muted-foreground mb-5">
          {intro}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-1.5">كلمة المرور الجديدة</label>
            <div className="relative">
              <input
                type={show ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                dir="ltr"
                className="w-full p-3 pl-11 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary text-left"
                placeholder="6 أحرف أو أرقام على الأقل"
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                title={show ? 'إخفاء' : 'إظهار'}
              >
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1.5">أعد كتابة كلمة المرور</label>
            <input
              type={show ? 'text' : 'password'}
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              dir="ltr"
              className={`w-full p-3 rounded-xl border bg-background outline-none focus:ring-2 focus:ring-primary text-left ${
                mismatch ? 'border-red-400' : 'border-border'
              }`}
              placeholder="نفس كلمة المرور"
            />
            {mismatch && <p className="text-xs text-red-500 mt-1">كلمتا المرور غير متطابقتين</p>}
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950/30 p-3 rounded-xl inline-flex items-center gap-2 w-full">
              <XCircle className="size-4 shrink-0" /> {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || mismatch || password.length < 6}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold hover:opacity-90 disabled:opacity-50 transition-opacity inline-flex items-center justify-center gap-2"
          >
            {loading
              ? <><Loader2 className="size-4 animate-spin" /> جاري الحفظ...</>
              : <><ShieldCheck className="size-4" /> حفظ ومتابعة</>}
          </button>

          <p className="text-xs text-muted-foreground text-center">
            احتفظ بكلمة المرور — إذا نسيتها تواصل مع إدارة المدرسة لإصدار كلمة جديدة.
          </p>
        </form>
      </div>
    </div>
  )
}
