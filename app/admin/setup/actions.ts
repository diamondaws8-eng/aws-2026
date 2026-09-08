'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { schools, teachers, students, schoolStaff } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'

/**
 * First-time setup only. Any signed-in account used to be able to call this and
 * become the owner of a brand-new school — a parent or a teacher included. It
 * grants no access to the existing school's data, but it does hand out an admin
 * portal and litters the database (a duplicate school had to be cleaned up once
 * already).
 */
export async function createSchool(data: { name: string; academicYear: string }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return { error: 'Unauthorized' }

  const userId = session.user.id
  const [owned] = await db.select({ id: schools.id }).from(schools).where(eq(schools.adminId, userId)).limit(1)
  if (owned) return { error: 'لديك مدرسة بالفعل' }

  const [isTeacher] = await db.select({ id: teachers.id }).from(teachers).where(eq(teachers.userId, userId)).limit(1)
  const [isParent] = await db.select({ id: students.id }).from(students).where(eq(students.parentUserId, userId)).limit(1)
  const [isStaff] = await db.select({ id: schoolStaff.id }).from(schoolStaff).where(eq(schoolStaff.userId, userId)).limit(1)
  if (isTeacher || isParent || isStaff) {
    return { error: 'هذا الحساب مرتبط بمدرسة قائمة ولا يمكنه إنشاء مدرسة جديدة' }
  }

  const name = String(data.name ?? '').trim().slice(0, 120)
  const academicYear = String(data.academicYear ?? '').trim().slice(0, 20)
  if (!name || !academicYear) return { error: 'اسم المدرسة والعام الدراسي مطلوبان' }

  try {
    await db.insert(schools).values({ name, academicYear, adminId: userId })
    return { ok: true }
  } catch (error) {
    console.error(error)
    return { error: 'Failed to create school' }
  }
}
