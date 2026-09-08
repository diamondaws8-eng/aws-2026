import { cache } from 'react'
import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { schoolStaff, schools, classes, students } from '@/lib/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { headers } from 'next/headers'

/**
 * The counsellor is not an administrator with a narrower scope — it is a
 * different job. They hold no power over students, teachers, classes, settings
 * or backups; what they hold is the decision about what reaches a family. So
 * they get their own portal and their own guard rather than a seat in
 * lib/admin-access.ts, where the role would have had to be described by the
 * long list of things it cannot do.
 */
export type CounselorAccess = {
  userId: string
  staffId: string
  schoolId: string
  schoolName: string
  name: string
  /** A stage can have its own counsellor, exactly as it can have its own deputy. */
  allGrades: boolean
  gradeIds: string[]
}

function parseGradeIds(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

/** Cached per request, so a layout and its page share one lookup. */
export const getCounselorAccess = cache(async (): Promise<CounselorAccess | null> => {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return null

  const [staff] = await db
    .select()
    .from(schoolStaff)
    .where(and(eq(schoolStaff.userId, session.user.id), eq(schoolStaff.role, 'counselor')))
    .limit(1)
  if (!staff) return null

  const [school] = await db.select().from(schools).where(eq(schools.id, staff.schoolId)).limit(1)
  if (!school) return null

  return {
    userId: session.user.id,
    staffId: staff.id,
    schoolId: staff.schoolId,
    schoolName: school.name,
    name: staff.fullName,
    allGrades: staff.allGrades,
    gradeIds: parseGradeIds(staff.gradeLevelIds),
  }
})

export async function requireCounselor(): Promise<CounselorAccess> {
  const access = await getCounselorAccess()
  if (!access) throw new Error('غير مصرح بهذا الإجراء')
  return access
}

/**
 * The classes this counsellor is responsible for. A case belonging to any other
 * stage must not appear in their inbox, let alone be decided by them.
 */
export const getCounselorClassIds = cache(async (access: CounselorAccess): Promise<string[]> => {
  const rows = await db
    .select({ id: classes.id })
    .from(classes)
    .where(
      access.allGrades
        ? eq(classes.schoolId, access.schoolId)
        : and(
            eq(classes.schoolId, access.schoolId),
            access.gradeIds.length ? inArray(classes.gradeLevelId, access.gradeIds) : eq(classes.id, ''),
          ),
    )
  return rows.map((c) => c.id)
})

/** Proves a student is inside this counsellor's stages before anything is read or written. */
export async function requireCounselorForStudent(access: CounselorAccess, studentId: string) {
  const [student] = await db
    .select({ id: students.id, classId: students.classId, schoolId: students.schoolId })
    .from(students)
    .where(eq(students.id, studentId))
    .limit(1)
  if (!student || student.schoolId !== access.schoolId) throw new Error('غير مصرح ببيانات هذا الطالب')

  if (access.allGrades) return student
  const allowed = await getCounselorClassIds(access)
  if (!student.classId || !allowed.includes(student.classId)) {
    throw new Error('هذا الطالب خارج المراحل المسندة إليك')
  }
  return student
}
