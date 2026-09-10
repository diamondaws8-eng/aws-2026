'use server'

import { db } from '@/lib/db'
import {
  gradeLevels, classes, subjects, students, teachers, gradeEntries,
  dailyRecords, lessonRecords, behaviorCases, attendance, studentPoints,
  parentWhatsappMessages, notifications,
} from '@/lib/db/schema'
import { eq, and, ne, inArray, count } from 'drizzle-orm'
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

type ActionResult = { ok: true } | { ok: false; error: string }

/**
 * Names are the only handle the school has on a stage, a class or a subject —
 * two classes both called «1\1» under one stage, or two «رياضيات» rows in one
 * class, show up as two identical lines in every list with nothing to say
 * which is which. Every add/rename below refuses the duplicate.
 */
async function gradeNameTaken(schoolId: string, name: string, exceptId?: string) {
  const [row] = await db
    .select({ id: gradeLevels.id })
    .from(gradeLevels)
    .where(and(eq(gradeLevels.schoolId, schoolId), eq(gradeLevels.name, name), exceptId ? ne(gradeLevels.id, exceptId) : undefined))
    .limit(1)
  return !!row
}

async function classNameTaken(gradeLevelId: string, name: string, exceptId?: string) {
  const [row] = await db
    .select({ id: classes.id })
    .from(classes)
    .where(and(eq(classes.gradeLevelId, gradeLevelId), eq(classes.name, name), exceptId ? ne(classes.id, exceptId) : undefined))
    .limit(1)
  return !!row
}

async function subjectNameTaken(classId: string, name: string) {
  const [row] = await db
    .select({ id: subjects.id })
    .from(subjects)
    .where(and(eq(subjects.classId, classId), eq(subjects.name, name)))
    .limit(1)
  return !!row
}

export async function addGradeLevel(formData: FormData): Promise<ActionResult> {
  const access = await requireSchoolWideEditor()
  if (!access) return { ok: false, error: 'غير مصرح لك بهذا الإجراء' }
  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { ok: false, error: 'اسم المرحلة مطلوب' }
  const schoolId = access.school.id
  if (await gradeNameTaken(schoolId, name)) {
    return { ok: false, error: `توجد مرحلة بهذا الاسم بالفعل: ${name}` }
  }
  const [{ n }] = await db.select({ n: count() }).from(gradeLevels).where(eq(gradeLevels.schoolId, schoolId))
  await db.insert(gradeLevels).values({ name, schoolId, orderIndex: n })
  revalidatePath('/admin/grade-levels')
  return { ok: true }
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
  if (await gradeNameTaken(access.school.id, trimmed, id)) {
    return { ok: false as const, error: `توجد مرحلة أخرى بهذا الاسم: ${trimmed}` }
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

export async function addClass(formData: FormData): Promise<ActionResult> {
  const gradeLevelId = String(formData.get('gradeLevelId') ?? '')
  const access = await requireGradeEditor(gradeLevelId || null)
  if (!access || !gradeLevelId) return { ok: false, error: 'غير مصرح لك بهذا الإجراء' }
  const [grade] = await db
    .select({ id: gradeLevels.id })
    .from(gradeLevels)
    .where(and(eq(gradeLevels.id, gradeLevelId), eq(gradeLevels.schoolId, access.school.id)))
    .limit(1)
  if (!grade) return { ok: false, error: 'المرحلة غير موجودة' }
  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { ok: false, error: 'اسم الفصل مطلوب' }
  if (await classNameTaken(gradeLevelId, name)) {
    return { ok: false, error: `يوجد فصل بهذا الاسم في المرحلة نفسها: ${name}` }
  }
  await db.insert(classes).values({ name, gradeLevelId, schoolId: access.school.id, capacity: 30 })
  revalidatePath('/admin/grade-levels')
  return { ok: true }
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

  // Nothing in the database ties a record to its class, so deleting the class
  // would leave last year's registers, cases and marks pointing at nothing —
  // the archive promises they stay readable "as the class they happened in".
  // An empty class that was never used goes; a class with a history stays,
  // the same way a subject with marks and a stage with classes stay.
  const subjectIds = (await db.select({ id: subjects.id }).from(subjects).where(eq(subjects.classId, id))).map((s) => s.id)
  const [[reg], [lessons], [cases], [att], [pts], [msgs], [marks]] = await Promise.all([
    db.select({ n: count() }).from(dailyRecords).where(eq(dailyRecords.classId, id)),
    db.select({ n: count() }).from(lessonRecords).where(eq(lessonRecords.classId, id)),
    db.select({ n: count() }).from(behaviorCases).where(eq(behaviorCases.classId, id)),
    db.select({ n: count() }).from(attendance).where(eq(attendance.classId, id)),
    db.select({ n: count() }).from(studentPoints).where(eq(studentPoints.classId, id)),
    db.select({ n: count() }).from(parentWhatsappMessages).where(eq(parentWhatsappMessages.classId, id)),
    subjectIds.length
      ? db.select({ n: count() }).from(gradeEntries).where(inArray(gradeEntries.subjectId, subjectIds))
      : Promise.resolve([{ n: 0 }]),
  ])
  const history = reg.n + lessons.n + cases.n + att.n + pts.n + msgs.n + marks.n
  if (history > 0) {
    return {
      ok: false as const,
      error: `لا يمكن حذف فصل «${classRow?.name ?? ''}» لأن له سجلاً محفوظاً (${history} سجل حضور ودرجات وحالات). أبقِه فارغاً أو أعد تسميته — السجل يُقرأ باسم الفصل.`,
    }
  }

  await db.transaction(async (tx) => {
    // Subjects belong to the class and are meaningless without it.
    await tx.delete(subjects).where(eq(subjects.classId, id))
    // A notice addressed to this class alone had nobody left to read it.
    await tx.delete(notifications).where(eq(notifications.classId, id))
    // Other classes may have named this one as where their pupils go next;
    // left in place, the annual promotion would try to move pupils into it.
    await tx.update(classes).set({ promotesToClassId: null }).where(eq(classes.promotesToClassId, id))
    await tx.delete(classes).where(eq(classes.id, id))
  })

  await logAudit(access, 'class.delete', `فصل ${classRow?.name ?? ''}`.trim())

  revalidatePath('/admin/grade-levels')
  revalidatePath('/admin/promote')
  return { ok: true as const }
}

export async function editClass(id: string, name: string): Promise<ActionResult> {
  const cls = await gradeIdOfClass(id)
  const access = await requireGradeEditor(cls?.gradeLevelId ?? null)
  if (!access || !cls || cls.schoolId !== access.school.id) {
    return { ok: false, error: 'غير مصرح لك بهذا الإجراء' }
  }
  const trimmed = String(name ?? '').trim()
  if (!trimmed) return { ok: false, error: 'اسم الفصل مطلوب' }
  if (await classNameTaken(cls.gradeLevelId, trimmed, id)) {
    return { ok: false, error: `يوجد فصل آخر بهذا الاسم في المرحلة نفسها: ${trimmed}` }
  }
  await db.update(classes).set({ name: trimmed }).where(eq(classes.id, id))
  revalidatePath('/admin/grade-levels')
  return { ok: true }
}

// ─── Subjects ─────────────────────────────────────────────────────────────────

export async function addSubject(formData: FormData): Promise<ActionResult> {
  const classId = String(formData.get('classId') ?? '')
  const cls = classId ? await gradeIdOfClass(classId) : null
  const access = await requireGradeEditor(cls?.gradeLevelId ?? null)
  if (!access || !cls || cls.schoolId !== access.school.id) {
    return { ok: false, error: 'غير مصرح لك بهذا الإجراء' }
  }
  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { ok: false, error: 'اسم المادة مطلوب' }
  if (await subjectNameTaken(classId, name)) {
    return { ok: false, error: `المادة «${name}» موجودة بالفعل في هذا الفصل` }
  }
  await db.insert(subjects).values({ name, classId, schoolId: access.school.id })
  revalidatePath('/admin/grade-levels')
  return { ok: true }
}

export async function deleteSubject(id: string) {
  const [subject] = await db.select().from(subjects).where(eq(subjects.id, id)).limit(1)
  if (!subject) return { ok: false as const, error: 'المادة غير موجودة' }
  const cls = await gradeIdOfClass(subject.classId)
  const access = await requireGradeEditor(cls?.gradeLevelId ?? null)
  if (!access || !cls || cls.schoolId !== access.school.id) {
    return { ok: false as const, error: 'غير مصرح لك بهذا الإجراء' }
  }

  // Nothing in the database stops the row from going, and the exam marks filed
  // under it are read back through the subject — so deleting it makes a term of
  // grades unreachable. Refuse, the way deleting a class with pupils is refused.
  const marks = await db
    .select({ id: gradeEntries.id })
    .from(gradeEntries)
    .where(eq(gradeEntries.subjectId, id))
  if (marks.length > 0) {
    return {
      ok: false as const,
      error: `لا يمكن حذف "${subject.name}" لأن بها ${marks.length} درجة مسجَّلة. احذف الدرجات أولاً أو أبقِ المادة.`,
    }
  }

  await db.delete(subjects).where(eq(subjects.id, id))
  await logAudit(access, 'subject.delete', subject.name)
  revalidatePath('/admin/grade-levels')
  return { ok: true as const }
}

export async function assignTeacherToSubject(subjectId: string, teacherUserId: string | null) {
  const [subject] = await db.select().from(subjects).where(eq(subjects.id, subjectId)).limit(1)
  if (!subject) return { ok: false as const, error: 'المادة غير موجودة' }
  const cls = await gradeIdOfClass(subject.classId)
  const access = await requireGradeEditor(cls?.gradeLevelId ?? null)
  if (!access || !cls || cls.schoolId !== access.school.id) {
    return { ok: false as const, error: 'غير مصرح لك بهذا الإجراء' }
  }

  // An id that belongs to nobody would still mark the class as "assigned", and
  // the teacher portal then hands it to whoever holds a subject in it — which
  // would be no one. The whole class would be locked out.
  if (teacherUserId) {
    const [teacher] = await db
      .select({ id: teachers.id })
      .from(teachers)
      .where(and(eq(teachers.userId, teacherUserId), eq(teachers.schoolId, access.school.id)))
      .limit(1)
    if (!teacher) return { ok: false as const, error: 'هذا المعلم ليس من معلمي المدرسة' }
  }

  await db.update(subjects).set({ teacherUserId }).where(eq(subjects.id, subjectId))
  revalidatePath('/admin/grade-levels')
  return { ok: true as const }
}

// ─── Reads ────────────────────────────────────────────────────────────────────

export async function getStudentsForClass(classId: string, schoolId: string) {
  const access = await getAdminAccess()
  if (!access || access.school.id !== schoolId) return []
  const cls = await gradeIdOfClass(classId)
  if (!cls || cls.schoolId !== schoolId || !canViewGrade(access, cls.gradeLevelId)) return []
  // Only what the sheet prints. The full row also carries the parent's login
  // id, which has no business in a file that gets emailed around.
  return await db
    .select({
      fullName: students.fullName,
      nationalId: students.nationalId,
      parentPhone: students.parentPhone,
      gender: students.gender,
    })
    .from(students)
    .where(and(eq(students.classId, classId), eq(students.schoolId, schoolId), eq(students.status, 'active')))
}
