'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { teachers, user, schools } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'

export async function addTeacher(input: { fullName: string; phone: string }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')
  
  const [school] = await db.select().from(schools).where(eq(schools.adminId, session.user.id)).limit(1)
  if (!school) throw new Error('No school')
  
  const email = `${input.phone.replace(/\D/g, '')}@teacher.midad.local`
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  const tempPassword = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  
  const result = await auth.api.signUpEmail({
    body: { email, password: tempPassword, name: input.fullName }
  })
  
  await db.update(user).set({ role: 'teacher', updatedAt: new Date() }).where(eq(user.email, email))
  
  const [createdUser] = await db.select().from(user).where(eq(user.email, email)).limit(1)
  
  await db.insert(teachers).values({
    schoolId: school.id,
    userId: createdUser.id,
    fullName: input.fullName,
    phone: input.phone,
    tempPassword,
  })
  
  revalidatePath('/admin/teachers')
  return { ok: true, email, tempPassword }
}

export async function deleteTeacher(teacherId: string, userId: string) {
  await db.delete(teachers).where(eq(teachers.id, teacherId))
  await db.delete(user).where(eq(user.id, userId))
  revalidatePath('/admin/teachers')
}

export async function editTeacher(teacherId: string, userId: string, input: { fullName: string; phone: string }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')

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
