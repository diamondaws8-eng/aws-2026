import { cache } from 'react'
import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { teachers, classes } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { headers } from 'next/headers'

/**
 * Server actions and route handlers are public HTTP endpoints — anyone holding
 * *any* session cookie can call them, including a parent. Checking only that a
 * session exists is not authorization, so every teacher-side entry point goes
 * through here first.
 */
export type TeacherAccess = {
  userId: string
  teacherId: string
  schoolId: string
  fullName: string
}

/** Cached per request so repeated guards in one render cost a single query. */
export const getTeacherAccess = cache(async (): Promise<TeacherAccess | null> => {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return null

  const [teacher] = await db
    .select({ id: teachers.id, schoolId: teachers.schoolId, fullName: teachers.fullName })
    .from(teachers)
    .where(eq(teachers.userId, session.user.id))
    .limit(1)
  if (!teacher) return null

  return { userId: session.user.id, teacherId: teacher.id, schoolId: teacher.schoolId, fullName: teacher.fullName }
})

export async function requireTeacher(): Promise<TeacherAccess> {
  const access = await getTeacherAccess()
  if (!access) throw new Error('غير مصرح بهذا الإجراء')
  return access
}

/**
 * Same, but also proves the class actually belongs to the caller's school —
 * class ids arrive from the browser and must never be trusted on their own.
 */
export async function requireTeacherForClass(classId: string): Promise<TeacherAccess> {
  const access = await requireTeacher()
  const [row] = await db
    .select({ id: classes.id })
    .from(classes)
    .where(and(eq(classes.id, classId), eq(classes.schoolId, access.schoolId)))
    .limit(1)
  if (!row) throw new Error('غير مصرح بهذا الفصل')
  return access
}
