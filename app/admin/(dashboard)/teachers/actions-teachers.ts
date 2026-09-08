'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { teachers, user, schools, account, session, subjects } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { hashPassword } from 'better-auth/crypto'
import { getAdminAccess } from '@/lib/admin-access'
import { logAudit } from '@/lib/audit'

/** Teacher accounts are school-wide, so only the owner and quality managers manage them. */
async function requireTeacherManager() {
  const access = await getAdminAccess()
  if (!access || !access.canManageTeachers) return null
  return access
}

function generateTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export async function addTeacher(input: { fullName: string; phone: string }) {
  const access = await requireTeacherManager()
  if (!access) throw new Error('Unauthorized')
  const school = access.school


  const email = `${input.phone.replace(/\D/g, '')}@teacher.midad.local`
  const tempPassword = generateTempPassword()
  
  const result = await auth.api.signUpEmail({
    body: { email, password: tempPassword, name: input.fullName }
  })
  
  await db.update(user).set({ role: 'teacher', updatedAt: new Date() }).where(eq(user.email, email))
  
  const [createdUser] = await db.select().from(user).where(eq(user.email, email)).limit(1)
  
  // The password is returned once for the admin to hand over — never stored in
  // plaintext. If it is lost, use "إعادة تعيين كلمة المرور".
  await db.insert(teachers).values({
    schoolId: school.id,
    userId: createdUser.id,
    fullName: input.fullName,
    phone: input.phone,
  })
  
  await logAudit(access, 'teacher.create', input.fullName, { email })

  revalidatePath('/admin/teachers')
  return { ok: true, email, tempPassword }
}

export async function deleteTeacher(teacherId: string, userId: string) {
  const access = await requireTeacherManager()
  if (!access) return { ok: false as const, error: 'غير مصرح لك بهذا الإجراء' }
  const [teacher] = await db.select().from(teachers).where(eq(teachers.id, teacherId)).limit(1)
  if (!teacher || teacher.schoolId !== access.school.id || teacher.userId !== userId) {
    return { ok: false as const, error: 'المعلم غير موجود' }
  }

  try {
    // Subjects stay, but must not point at an account that no longer exists.
    const assigned = await db.select({ id: subjects.id }).from(subjects).where(eq(subjects.teacherUserId, userId))

    await db.transaction(async (tx) => {
      await tx.update(subjects).set({ teacherUserId: null }).where(eq(subjects.teacherUserId, userId))
      await tx.delete(teachers).where(eq(teachers.id, teacherId))
      await tx.delete(account).where(eq(account.userId, userId))
      await tx.delete(session).where(eq(session.userId, userId))
      await tx.delete(user).where(eq(user.id, userId))
    })

    await logAudit(access, 'teacher.delete', teacher.fullName, { unassignedSubjects: assigned.length })

    revalidatePath('/admin/teachers')
    revalidatePath('/admin/grade-levels')
    return { ok: true as const, unassignedSubjects: assigned.length }
  } catch (error) {
    console.error('Delete Teacher Error:', error)
    return { ok: false as const, error: 'حدث خطأ أثناء حذف المعلم' }
  }
}

export async function editTeacher(teacherId: string, userId: string, input: { fullName: string; phone: string }) {
  const access = await requireTeacherManager()
  if (!access) throw new Error('Unauthorized')
  const [teacher] = await db.select().from(teachers).where(eq(teachers.id, teacherId)).limit(1)
  if (!teacher || teacher.schoolId !== access.school.id) throw new Error('Unauthorized')

  // We intentionally do NOT change the login email if the phone changes, to avoid locking the teacher out.
  // We only update the display name and phone number.
  await db.update(teachers).set({
    fullName: input.fullName,
    phone: input.phone,
  }).where(eq(teachers.id, teacherId))

  await db.update(user).set({
    name: input.fullName,
    updatedAt: new Date(),
  }).where(eq(user.id, userId))

  revalidatePath('/admin/teachers')
  return { ok: true }
}

// ── Reset a teacher's password (e.g. they forgot it) ──────────────────────────
// Generates a fresh temporary password, hashes it the same way better-auth does,
// and overwrites their credential account directly — no need to know the old password.
export async function resetTeacherPassword(teacherId: string, userId: string) {
  const access = await requireTeacherManager()
  if (!access) return { ok: false, error: 'غير مصرح بهذا الإجراء' }

  const [teacher] = await db.select().from(teachers).where(eq(teachers.id, teacherId)).limit(1)
  if (!teacher || teacher.schoolId !== access.school.id || teacher.userId !== userId) {
    return { ok: false, error: 'غير مصرح بالوصول لهذا المعلم' }
  }

  try {
    const tempPassword = generateTempPassword()
    const hashed = await hashPassword(tempPassword)

    await db.update(account).set({ password: hashed, updatedAt: new Date() })
      .where(and(eq(account.userId, userId), eq(account.providerId, 'credential')))

    await logAudit(access, 'teacher.passwordReset', teacher.fullName)

    revalidatePath('/admin/teachers')
    return { ok: true, tempPassword }
  } catch (error) {
    console.error('Reset Teacher Password Error:', error)
    return { ok: false, error: 'حدث خطأ أثناء إعادة تعيين كلمة المرور' }
  }
}
