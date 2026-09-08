import { cache } from 'react'
import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { teachers, classes, subjects } from '@/lib/db/schema'
import { eq, and, isNotNull } from 'drizzle-orm'
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
 * A class only becomes subject-restricted once the admin has actually assigned
 * a teacher to at least one of its subjects (from /admin/grade-levels). Every
 * class in production currently has zero subjects, so enforcing the restriction
 * unconditionally would lock all 19 teachers out of every class the moment this
 * ships — the admin needs a chance to assign subjects first. Until a class gets
 * its first assigned subject, it stays visible to the whole school's teachers,
 * exactly as before.
 */
async function classIsConfigured(classId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: subjects.id })
    .from(subjects)
    .where(and(eq(subjects.classId, classId), isNotNull(subjects.teacherUserId)))
    .limit(1)
  return !!row
}

async function classIsAccessible(access: TeacherAccess, classId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: classes.id })
    .from(classes)
    .where(and(eq(classes.id, classId), eq(classes.schoolId, access.schoolId)))
    .limit(1)
  if (!row) return false

  if (!(await classIsConfigured(classId))) return true

  const [owns] = await db
    .select({ id: subjects.id })
    .from(subjects)
    .where(and(eq(subjects.classId, classId), eq(subjects.teacherUserId, access.userId)))
    .limit(1)
  return !!owns
}

/**
 * Same as requireTeacher, but also proves the caller may act on this specific
 * class — class ids arrive from the browser and must never be trusted on their
 * own. Once the class has an assigned subject, only its assigned teacher(s)
 * pass; see classIsConfigured above for the rollout-safe fallback.
 */
export async function requireTeacherForClass(classId: string): Promise<TeacherAccess> {
  const access = await requireTeacher()
  if (!(await classIsAccessible(access, classId))) throw new Error('غير مصرح بهذا الفصل')
  return access
}

/**
 * Redirect-friendly variant for Server Components (a thrown Error there hits
 * the error boundary instead of sending the teacher back to a normal page).
 * The two failure cases need different destinations, so they come back typed
 * instead of collapsed into null.
 */
export type TeacherClassAccessResult =
  | { status: 'ok'; access: TeacherAccess }
  | { status: 'no-session' }
  | { status: 'forbidden' }

export async function getTeacherClassAccess(classId: string): Promise<TeacherClassAccessResult> {
  const access = await getTeacherAccess()
  if (!access) return { status: 'no-session' }
  if (!(await classIsAccessible(access, classId))) return { status: 'forbidden' }
  return { status: 'ok', access }
}

/**
 * Class ids this teacher may see in a listing: every class until it gains an
 * assigned subject, then only the ones they are themselves assigned to.
 */
export async function getTeacherVisibleClassIds(schoolId: string, teacherUserId: string): Promise<Set<string>> {
  const [allClasses, allSubjects] = await Promise.all([
    db.select({ id: classes.id }).from(classes).where(eq(classes.schoolId, schoolId)),
    db.select({ classId: subjects.classId, teacherUserId: subjects.teacherUserId })
      .from(subjects)
      .where(eq(subjects.schoolId, schoolId)),
  ])

  const configuredClassIds = new Set(allSubjects.filter(s => s.teacherUserId).map(s => s.classId))
  const ownClassIds = new Set(allSubjects.filter(s => s.teacherUserId === teacherUserId).map(s => s.classId))

  return new Set(allClasses.map(c => c.id).filter(id => !configuredClassIds.has(id) || ownClassIds.has(id)))
}
