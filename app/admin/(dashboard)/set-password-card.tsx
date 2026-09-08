'use client'

import { SetPasswordCard as SharedCard } from '@/components/set-password-card'
import { setOwnAdminPassword } from './settings/actions-settings'

/**
 * Stands in for the admin portal while the account still holds the password
 * another administrator issued. This account can read every student's record
 * and reset other people's logins, so it waits behind the same gate.
 */
export function AdminSetPasswordCard({ name }: { name: string }) {
  return (
    <SharedCard
      name={name}
      submit={setOwnAdminPassword}
      intro={
        <>
          حسابك يستخدم كلمة المرور التي أنشأها لك زميل في الإدارة، وقد تكون معروفة لغيرك.
          <br />
          <span className="font-bold text-foreground">اختر الآن كلمة مرور خاصة بك</span> — هذا الحساب يصل لبيانات كل الطلاب.
        </>
      }
    />
  )
}
