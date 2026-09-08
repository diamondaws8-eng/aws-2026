'use server'

import { db } from '@/lib/db'
import { gradeLevels, classes, subjects, students } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getAdminAccess, canEditGrade, canViewGrade, type AdminAccess } from '@/lib/admin-access'
import { logAudit } from '@/lib/audit'

// ─── Permission helpers ───────────────────────────────────────────────────────

/** Access for someone allowed to change the whole academic structure (add/remove grade levels). */
async function requireSchoolWideEditor(): Promise<AdminAccess | null> {
  const access = await getAdminAccess()
  if (!access || !access.editAllGrades) return null
  return access
}

/** Access for someone allowed to change a specific grade level. */
async function requireGradeEditor(gradeLevelId: string | null): Promise<AdminAccess | null> {
  const access = await getAdminAccess()
  if (!access || !canEditGrade(access, gradeLevelId)) return null
  return access
}

async function gradeIdOfClass(classId: string): Promise<{ gradeLevelId: string; schoolId: string } | null> {
  const [cls] = await db
    .select({ gradeLevelId: classes.gradeLevelId, schoolId: classes.schoolId })
    .from(classes)
    .where(eq(classes.id, classId))
    .limit(1)
  return cls ?? null
}

// ─── Grade levels ─────────────────────────────────────────────────────────────

export async function addGradeLevel(formData: FormData) {
  const access = await requireSchoolWideEditor()
  if (!access) return
  const name = formData.get('name') as string
  if (!name) return
  const schoolId = access.school.id
  const existingCount = await db.select().from(gradeLevels).where(eq(gradeLevels.schoolId, schoolId))
  await db.insert(gradeLevels).values({ name, schoolId, orderIndex: existingCount.length })
  revalidatePath('/admin/grade-levels')
}

export async function editGradeLevel(id: string, name: string) {
  const access = await requireSchoolWideEditor()
  if (!access) return { ok: false as const, error: 'غير مصرح لك بهذا الإجراء' }

  const trimmed = name.trim()
  if (!trimmed) return { ok: false as const, error: 'اسم المرحلة مطلوب' }

  const [grade] = await db.select().from(gradeLevels).where(eq(gradeLevels.id, id)).limit(1)
  if (!grade || grade.schoolId !== access.school.id) {
    return { ok: false as const, error: 'المرحلة غير موجودة' }
  }

  await db.update(gradeLevels).set({ name: trimmed }).where(eq(gradeLevels.id, id))
  await logAudit(access, 'gradeLevel.rename', trimmed, { from: grade.name })

  revalidatePath('/admin/grade-levels')
  return { ok: true as const }
}

export async function deleteGradeLevel(id: string) {
  const access = await requireSchoolWideEditor()
  if (!access) return { ok: false as const, error: 'غير مصرح لك بهذا الإجراء' }
  const [grade] = await db.select().from(gradeLevels).where(eq(gradeLevels.id, id)).limit(1)
  if (!grade || grade.schoolId !== access.school.id) {
    return { ok: false as const, error: 'المرحلة غير موجودة' }
  }

  // Refuse rather than silently orphaning every class, student and record underneath.
  const childClasses = await db.select({ id: classes.id }).from(classes).where(eq(classes.gradeLevelId, id))
  if (childClasses.length > 0) {
    return {
      ok: false as const,
      error: `لا يمكن حذف "${grade.name}" لأنها تحتوي على ${childClasses.length} فصل. احذف الفصول أولاً.`,
    }
  }

  await db.delete(gradeLevels).where(eq(gradeLevels.id, id))
  await logAudit(access, 'gradeLevel.delete', grade.name)
  revalidatePath('/admin/grade-levels')
  return { ok: true as const }
}

// ─── Classes ──────────────────────────────────────────────────────────────────

export async function addClass(formData: FormData) {
  const gradeLevelId = formData.get('gradeLevelId') as string
  const access = await requireGradeEditor(gradeLevelId)
  if (!access) return
  const name = formData.get('name') as string
  if (!name || !gradeLevelId) return
  await db.insert(classes).values({ name, gradeLevelId, schoolId: access.school.id, capacity: 30 })
  revalidatePath('/admin/grade-levels')
}

export async function deleteClass(id: string) {
  const cls = await gradeIdOfClass(id)
  const access = await requireGradeEditor(cls?.gradeLevelId ?? null)
  if (!access || !cls || cls.schoolId !== access.school.id) {
    return { ok: false as const, error: 'غير مصرح لك بهذا الإجراء' }
  }

  const [classRow] = await db.select({ name: classes.name }).from(classes).where(eq(classes.id, id)).limit(1)

  // Students would keep pointing at a class that no longer exists.
  const enrolled = await db.select({ id: students.id }).from(students).where(eq(students.classId, id))
  if (enrolled.length > 0) {
    return {
      ok: false as const,
      error: `لا يمكن حذف الفصل لأنه يضم ${enrolled.length} طالباً. انقلهم لفصل آخر أولاً من صفحة الطلاب.`,
    }
  }

  // Subjects belong to the class and are meaningless without it.
  await db.transaction(async (tx) => {
    await tx.delete(subjects).where(eq(subjects.classId, id))
    await tx.delete(classes).where(eq(classes.id, id))
  })

  await logAudit(access, 'class.delete', `فصل ${classRow?.name ?? ''}`.trim())

  revalidatePath('/admin/grade-levels')
  return { ok: true as const }
}

export async function editClass(id: string, name: string) {
  const cls = await gradeIdOfClass(id)
  const access = await requireGradeEditor(cls?.gradeLevelId ?? null)
  if (!access || !cls || cls.schoolId !== access.school.id) return
  await db.update(classes).set({ name }).where(eq(classes.id, id))
  revalidatePath('/admin/grade-levels')
}

// ─── Subjects ─────────────────────────────────────────────────────────────────

export async function addSubject(formData: FormData) {
  const classId = formData.get('classId') as string
  const cls = await gradeIdOfClass(classId)
  const access = await requireGradeEditor(cls?.gradeLevelId ?? null)
  if (!access || !cls || cls.schoolId !== access.school.id) return
  const name = formData.get('name') as string
  if (!name || !classId) return
  await db.insert(subjects).values({ name, classId, schoolId: access.school.id })
  revalidatePath('/admin/grade-levels')
}

export async function deleteSubject(id: string) {
  const [subject] = await db.select().from(subjects).where(eq(subjects.id, id)).limit(1)
  if (!subject) return
  const cls = await gradeIdOfClass(subject.classId)
  const access = await requireGradeEditor(cls?.gradeLevelId ?? null)
  if (!access || !cls || cls.schoolId !== access.school.id) return
  await db.delete(subjects).where(eq(subjects.id, id))
  await logAudit(access, 'subject.delete', subject.name)
  revalidatePath('/admin/grade-levels')
}

export async function assignTeacherToSubject(subjectId: string, teacherUserId: string | null) {
  const [subject] = await db.select().from(subjects).where(eq(subjects.id, subjectId)).limit(1)
  if (!subject) return
  const cls = await gradeIdOfClass(subject.classId)
  const access = await requireGradeEditor(cls?.gradeLevelId ?? null)
  if (!access || !cls || cls.schoolId !== access.school.id) return
  await db.update(subjects).set({ teacherUserId }).where(eq(subjects.id, subjectId))
  revalidatePath('/admin/grade-levels')
}

// ─── Reads ────────────────────────────────────────────────────────────────────

export async function getStudentsForClass(classId: string, schoolId: string) {
  const access = await getAdminAccess()
  if (!access || access.school.id !== schoolId) return []
  const cls = await gradeIdOfClass(classId)
  if (!cls || cls.schoolId !== schoolId || !canViewGrade(access, cls.gradeLevelId)) return []
  return await db.select().from(students).where(and(eq(students.classId, classId), eq(students.schoolId, schoolId)))
}
