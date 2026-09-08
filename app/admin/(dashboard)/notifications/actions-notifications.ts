'use server'

import { db } from '@/lib/db'
import { notifications, classes, students } from '@/lib/db/schema'
import { revalidatePath } from 'next/cache'
import { eq, and } from 'drizzle-orm'
import { getAdminAccess, canEditGrade } from '@/lib/admin-access'

export async function sendNotification(data: any) {
  const access = await getAdminAccess()
  if (!access || !access.canEdit || access.school.id !== data.schoolId) {
    return { ok: false, error: 'غير مصرح لك بإرسال التنبيهات' }
  }

  // A class-targeted notification must be for a grade this user controls;
  // school-wide notifications need school-wide edit rights.
  if (data.classId) {
    const [cls] = await db
      .select({ gradeLevelId: classes.gradeLevelId, schoolId: classes.schoolId })
      .from(classes)
      .where(eq(classes.id, data.classId))
      .limit(1)
    if (!cls || cls.schoolId !== access.school.id || !canEditGrade(access, cls.gradeLevelId)) {
      return { ok: false, error: 'غير مصرح لك بالإرسال لهذا الفصل' }
    }
  } else if (data.studentId) {
    // A student id used to skip every check above, so a deputy scoped to one
    // grade could message any child in the school — and the id was never even
    // proved to belong to this school.
    const [student] = await db
      .select({ schoolId: students.schoolId, classId: students.classId })
      .from(students)
      .where(eq(students.id, data.studentId))
      .limit(1)
    if (!student || student.schoolId !== access.school.id) {
      return { ok: false, error: 'الطالب غير موجود في هذه المدرسة' }
    }
    const [cls] = student.classId
      ? await db.select({ gradeLevelId: classes.gradeLevelId }).from(classes).where(eq(classes.id, student.classId)).limit(1)
      : [undefined]
    if (!canEditGrade(access, cls?.gradeLevelId ?? null)) {
      return { ok: false, error: 'غير مصرح لك بالإرسال لهذا الطالب' }
    }
  } else if (!access.editAllGrades) {
    return { ok: false, error: 'التنبيهات العامة متاحة لمن يملك صلاحية على كل المراحل' }
  }

  const title = String(data.title ?? '').trim().slice(0, 200)
  const body = String(data.body ?? '').trim().slice(0, 4000)
  if (!title || !body) return { ok: false, error: 'العنوان والنص مطلوبان' }
  const type = ['info', 'warning', 'absence', 'grade'].includes(data.type) ? data.type : 'info'

  await db.insert(notifications).values({
    schoolId: access.school.id,
    fromUserId: access.userId,
    studentId: data.studentId || null,
    classId: data.classId || null,
    title,
    body,
    type,
    expiresAt: data.expiresAt || null
  })
  revalidatePath('/admin/notifications')
  return { ok: true }
}

export async function deleteNotification(id: string, schoolId: string) {
  const access = await getAdminAccess()
  if (!access || !access.canEdit || access.school.id !== schoolId) {
    return { ok: false as const, error: 'غير مصرح لك بهذا الإجراء' }
  }

  const [notice] = await db
    .select({ classId: notifications.classId, studentId: notifications.studentId })
    .from(notifications)
    .where(and(eq(notifications.id, id), eq(notifications.schoolId, schoolId)))
    .limit(1)
  if (!notice) return { ok: false as const, error: 'التنبيه غير موجود' }

  // Sending checks the grade scope; deleting has to as well, or a deputy could
  // remove a notice written for a stage that is not theirs.
  if (!access.editAllGrades) {
    let gradeLevelId: string | null = null
    const classId = notice.classId
      ?? (notice.studentId
        ? (await db.select({ classId: students.classId }).from(students).where(eq(students.id, notice.studentId)).limit(1))[0]?.classId ?? null
        : null)

    if (classId) {
      const [cls] = await db
        .select({ gradeLevelId: classes.gradeLevelId })
        .from(classes)
        .where(eq(classes.id, classId))
        .limit(1)
      gradeLevelId = cls?.gradeLevelId ?? null
    } else {
      // A school-wide notice needs school-wide rights to remove.
      return { ok: false as const, error: 'حذف التنبيهات العامة متاح لمن يملك صلاحية على كل المراحل' }
    }

    if (!canEditGrade(access, gradeLevelId)) {
      return { ok: false as const, error: 'غير مصرح لك بحذف تنبيه هذه المرحلة' }
    }
  }

  await db.delete(notifications).where(
    and(
      eq(notifications.id, id),
      eq(notifications.schoolId, schoolId)
    )
  )
  revalidatePath('/admin/notifications')
  return { ok: true as const }
}
