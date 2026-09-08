'use server'

import { db } from '@/lib/db'
import { user, account } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { hashPassword } from 'better-auth/crypto'
import { requireCounselor } from '@/lib/counselor-access'

/** First-login password change, usable only while the flag stands. */
export async function setOwnCounselorPassword(newPassword: string, confirmPassword: string) {
  const access = await requireCounselor()

  const [me] = await db
    .select({ mustChange: user.mustChangePassword })
    .from(user)
    .where(eq(user.id, access.userId))
    .limit(1)
  if (!me?.mustChange) return { ok: false as const, error: 'لا حاجة لتغيير كلمة المرور' }

  if (newPassword !== confirmPassword) return { ok: false as const, error: 'كلمتا المرور غير متطابقتين' }
  if (newPassword.length < 8) return { ok: false as const, error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' }

  try {
    const hashed = await hashPassword(newPassword)
    await db.update(account).set({ password: hashed, updatedAt: new Date() })
      .where(and(eq(account.userId, access.userId), eq(account.providerId, 'credential')))
    await db.update(user).set({ mustChangePassword: false, updatedAt: new Date() })
      .where(eq(user.id, access.userId))
    return { ok: true as const }
  } catch (error) {
    console.error('Set Counselor Password Error:', error)
    return { ok: false as const, error: 'حدث خطأ أثناء حفظ كلمة المرور' }
  }
}
