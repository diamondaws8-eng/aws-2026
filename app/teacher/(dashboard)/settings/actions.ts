'use server'

import { db } from '@/lib/db'
import { teachers, user, account } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { requireTeacher } from '@/lib/teacher-access'
import { hashPassword } from 'better-auth/crypto'

const MAX_TEMPLATES = 20
const MAX_TEMPLATE_LENGTH = 1000

/** Templates end up inside a WhatsApp message, so keep them plain bounded text. */
function cleanTemplates(list: unknown): string[] {
  if (!Array.isArray(list)) return []
  return list
    .filter((t): t is string => typeof t === 'string')
    .map(t => t.trim().slice(0, MAX_TEMPLATE_LENGTH))
    .filter(Boolean)
    .slice(0, MAX_TEMPLATES)
}

/**
 * The row to write is taken from the caller's own session. It used to come from
 * the browser, with nothing checked beyond "a session exists" — so any signed-in
 * account, a parent included, could rewrite another teacher's phone number and
 * message templates. The argument is kept only so existing callers still work.
 */
export async function updateTeacherSettings(
  _teacherId: string,
  input: { phone: string; whatsappTemplates: { positive: string[]; negative: string[] } }
) {
  const { teacherId } = await requireTeacher()

  const phone = String(input?.phone ?? '').replace(/[^\d+\s-]/g, '').trim().slice(0, 20)

  await db.update(teachers).set({
    phone,
    whatsappTemplates: JSON.stringify({
      positive: cleanTemplates(input?.whatsappTemplates?.positive),
      negative: cleanTemplates(input?.whatsappTemplates?.negative),
    }),
  }).where(eq(teachers.id, teacherId))

  revalidatePath('/teacher/settings')
  return { ok: true }
}

export async function getTeacherSettings() {
  const { teacherId } = await requireTeacher()

  const [teacher] = await db.select().from(teachers).where(eq(teachers.id, teacherId)).limit(1)
  if (!teacher) throw new Error('Not found')

  const templates = teacher.whatsappTemplates ? JSON.parse(teacher.whatsappTemplates as string) : { positive: [], negative: [] }
  return { teacherId: teacher.id, phone: teacher.phone || '', templates }
}

/**
 * First-login password change, mirroring the parent portal. Usable only while
 * the account still carries the password an administrator issued, so it can
 * never stand in for the normal "enter your current password" flow.
 */
export async function setOwnTeacherPassword(newPassword: string, confirmPassword: string) {
  const { userId } = await requireTeacher()

  const [me] = await db
    .select({ mustChange: user.mustChangePassword })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)
  if (!me?.mustChange) return { ok: false as const, error: 'لا حاجة لتغيير كلمة المرور' }

  if (newPassword !== confirmPassword) {
    return { ok: false as const, error: 'كلمتا المرور غير متطابقتين' }
  }
  if (newPassword.length < 8) {
    return { ok: false as const, error: 'كلمة المرور يجب أن تكون 8 أحرف أو أرقام على الأقل' }
  }

  try {
    const hashed = await hashPassword(newPassword)
    await db.update(account).set({ password: hashed, updatedAt: new Date() })
      .where(and(eq(account.userId, userId), eq(account.providerId, 'credential')))
    await db.update(user)
      .set({ mustChangePassword: false, updatedAt: new Date() })
      .where(eq(user.id, userId))
    return { ok: true as const }
  } catch (error) {
    console.error('Set Teacher Password Error:', error)
    return { ok: false as const, error: 'حدث خطأ أثناء حفظ كلمة المرور' }
  }
}
