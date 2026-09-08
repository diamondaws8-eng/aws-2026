'use client'

import { SetPasswordCard as SharedCard } from '@/components/set-password-card'
import { setOwnParentPassword } from './actions'

/**
 * Shown instead of the dashboard while the parent still has the starter
 * password. They cannot see any of the student's data until they pick their own.
 */
export function SetPasswordCard({ parentName }: { parentName: string }) {
  return (
    <SharedCard
      name={parentName}
      submit={setOwnParentPassword}
      intro={
        <>
          لحماية بيانات ابنك، الحساب يستخدم حالياً كلمة المرور الافتراضية التي تصل لجميع أولياء الأمور —
          وهذا يعني أن غيرك قد يستطيع الدخول عليه.
          <br />
          <span className="font-bold text-foreground">اختر الآن كلمة مرور خاصة بك</span> لن يعرفها أحد، وستستخدمها في كل مرة تدخل فيها.
        </>
      }
    />
  )
}
