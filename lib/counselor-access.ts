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
  // A counsellor with no stage assigned yet covers nothing. Said here rather
  // than as an impossible comparison in SQL: the id column is a uuid, so asking
  // Postgres for id = '' is not an empty result, it is a type error.
  if (!access.allGrades && access.gradeIds.length === 0) return []

  const rows = await db
    .select({ id: classes.id })
    .from(classes)
    .where(
      access.allGrades
        ? eq(classes.schoolId, access.schoolId)
        : and(
            eq(classes.schoolId, access.schoolId),
            inArray(classes.gradeLevelId, access.gradeIds),
          ),
    )
  return rows.map((c) => c.id)
})

/**
 * Who may be handed a case belonging to this stage.
 *
 * One rule, used both by the escalation picker and by the counsellor's settings
 * screen — so the list they are shown in advance is exactly the list they will
 * be offered at the moment it matters. A deputy set to read-only is left out:
 * naming them would park the case with somebody who has no way to close it.
 */
export async function staffCoveringGrade(
  schoolId: string,
  gradeLevelId: string | null,
): Promise<{ userId: string; fullName: string; role: string }[]> {
  const staff = await db
    .select({
      userId: schoolStaff.userId,
      fullName: schoolStaff.fullName,
      role: schoolStaff.role,
      allGrades: schoolStaff.allGrades,
      gradeLevelIds: schoolStaff.gradeLevelIds,
      canEdit: schoolStaff.canEdit,
    })
    .from(schoolStaff)
    .where(and(
      eq(schoolStaff.schoolId, schoolId),
      inArray(schoolStaff.role, ['deputy', 'principal', 'quality_manager']),
    ))

  return staff
    .filter((s) => {
      if (s.role === 'deputy' && !s.canEdit) return false
      if (s.allGrades) return true
      if (!gradeLevelId) return false
      return parseGradeIds(s.gradeLevelIds).includes(gradeLevelId)
    })
    .map((s) => ({ userId: s.userId, fullName: s.fullName, role: s.role }))
}

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
