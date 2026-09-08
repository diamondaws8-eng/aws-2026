'use client'

import { SetPasswordCard as SharedCard } from '@/components/set-password-card'
import { setOwnCounselorPassword } from './settings-actions'

export function CounselorSetPasswordCard({ name }: { name: string }) {
  return (
    <SharedCard
      name={name}
      submit={setOwnCounselorPassword}
      intro={
        <>
          حسابك يستخدم كلمة المرور التي أنشأتها لك الإدارة.
          <br />
          <span className="font-bold text-foreground">اختر الآن كلمة مرور خاصة بك</span> — هذا الحساب يطّلع على ملاحظات سرية تخص الطلاب.
        </>
      }
    />
  )
}
