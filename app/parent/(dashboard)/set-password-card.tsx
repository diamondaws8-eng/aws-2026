'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, LogOut } from 'lucide-react'
import { SetPasswordCard as SharedCard } from '@/components/set-password-card'
import { BrandLogo } from '@/components/brand-logo'
import { authClient } from '@/lib/auth-client'
import { setOwnParentPassword } from './actions'

/**
 * Shown instead of the dashboard while the parent still has the starter
 * password. They cannot see any of the student's data until they pick their own.
 *
 * Nobody is greeted by name here. The account's name used to be «ولي أمر» plus
 * the child's full name, and this card is reached with nothing but a phone
 * number and the password printed on the sign-in page — so the greeting told a
 * stranger whose child that number belongs to.
 */
export function SetPasswordCard({ askChildId }: { askChildId: boolean }) {
  // No identity number on file for any child: there is nothing to prove the
  // family with, and an account that cannot be proven is not handed to whoever
  // arrives first. The action refuses the same case.
  if (!askChildId) return <NotReadyCard />

  return (
    <SharedCard
      name="بك"
      submit={setOwnParentPassword}
      proof={{
        label: 'رقم هوية أحد أبنائك',
        hint: 'للتأكد من أنك ولي الأمر: اكتب رقم الهوية أو الإقامة لأحد أبنائك كما هو مسجَّل لدى المدرسة.',
      }}
      intro={
        <>
          لحماية بيانات ابنك، الحساب يستخدم حالياً كلمة المرور المبدئية التي تصل لجميع أولياء الأمور.
          <br />
          اكتب رقم هوية ابنك للتأكد منك، ثم{' '}
          <span className="font-bold text-foreground">اختر كلمة مرور خاصة بك</span> لن يعرفها أحد، وستستخدمها في كل مرة تدخل فيها.
        </>
      }
    />
  )
}

function NotReadyCard() {
  const router = useRouter()
  const [leaving, setLeaving] = useState(false)

  const leave = async () => {
    setLeaving(true)
    try {
      await authClient.signOut()
    } finally {
      router.push('/parent/login')
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md bg-card border border-border rounded-3xl shadow-sm p-6 text-center">
        <BrandLogo size={72} href={null} />
        <h1 className="text-xl font-bold mt-4">الحساب لم يُجهَّز للتفعيل بعد</h1>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          تفعيل الحساب يتحقق منك برقم هوية ابنك، وهو غير مسجَّل لدى المدرسة حتى الآن.
          تواصل مع إدارة المدرسة لتسجيله، ثم سجّل الدخول من جديد.
        </p>
        <button
          type="button"
          onClick={leave}
          disabled={leaving}
          className="mt-5 w-full min-h-11 rounded-xl bg-muted text-sm font-bold disabled:opacity-50 inline-flex items-center justify-center gap-2"
        >
          {leaving ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />} تسجيل الخروج
        </button>
      </div>
    </div>
  )
}
