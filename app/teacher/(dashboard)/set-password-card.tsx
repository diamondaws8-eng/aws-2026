'use client'

import { SetPasswordCard as SharedCard } from '@/components/set-password-card'
import { setOwnTeacherPassword } from './settings/actions'

/**
 * Stands in for the whole teacher portal while the account still carries the
 * password the administration issued. Attendance, points and parents' phone
 * numbers stay out of reach until the teacher picks their own.
 */
export function TeacherSetPasswordCard({ teacherName }: { teacherName: string }) {
  return (
    <SharedCard
      name={teacherName}
      submit={setOwnTeacherPassword}
      intro={
        <>
          حسابك يستخدم حالياً كلمة المرور التي سلّمتها لك الإدارة — وقد تكون مكتوبة على ورقة أو معروفة لغيرك.
          <br />
          <span className="font-bold text-foreground">اختر الآن كلمة مرور خاصة بك</span>، فبيانات طلابك وأرقام أولياء أمورهم مرتبطة بهذا الحساب.
        </>
      }
    />
  )
}
