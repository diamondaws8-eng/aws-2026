'use server'

import { db } from '@/lib/db'
import { students, classes } from '@/lib/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getAdminAccess, canEditGrade } from '@/lib/admin-access'
import { logAudit } from '@/lib/audit'

/**
 * Moving a year group up a grade.
 *
 * Doing this one pupil at a time through the edit form is 365 forms at the end
 * of every year, which is both a day's work and 365 chances to put a child in
 * the wrong class.
 *
 * What a move does NOT touch is the history: daily_records, lesson_records and
 * student_points all keep the class id they were written under, so last year's
 * register still reads as last year's class. Only students.classId moves, which
 * is what "where this pupil sits now" means.
 */

export type TransferResult =
  | { ok: true; moved: number }
  | { ok: false; error: string }

const MAX_BATCH = 500

export async function transferStudents(
  studentIds: string[],
  targetClassId: string,
): Promise<TransferResult> {
  try {
    const access = await getAdminAccess()
    if (!access) return { ok: false, error: 'غير مصرح بهذا الإجراء' }
    if (!access.canEdit) return { ok: false, error: 'حسابك للقراءة فقط' }

    const ids = [...new Set((studentIds ?? []).filter((s) => typeof s === 'string' && s))]
    if (ids.length === 0) return { ok: false, error: 'لم يُحدَّد أي طالب' }
    if (ids.length > MAX_BATCH) return { ok: false, error: `الحد الأقصى ${MAX_BATCH} طالب في المرة الواحدة` }

    // The destination must exist in this school, and be a grade this account
    // may edit — otherwise a deputy could push pupils into a stage they have
    // no business touching.
    const [target] = await db
      .select({ id: classes.id, name: classes.name, gradeLevelId: classes.gradeLevelId })
      .from(classes)
      .where(and(eq(classes.id, targetClassId), eq(classes.schoolId, access.school.id)))
      .limit(1)
    if (!target) return { ok: false, error: 'الفصل المستهدف غير موجود' }
    if (!canEditGrade(access, target.gradeLevelId)) {
      return { ok: false, error: 'لا تملك صلاحية التعديل على مرحلة الفصل المستهدف' }
    }

    // Every pupil named must be in this school, and in a grade this account may
    // edit. Anything else in the list is refused rather than quietly skipped —
    // a transfer that moves 30 of the 40 you selected and says nothing is worse
    // than one that refuses.
    const rows = await db
      .select({ id: students.id, classId: students.classId, gradeLevelId: classes.gradeLevelId })
      .from(students)
      .leftJoin(classes, eq(students.classId, classes.id))
      .where(and(eq(students.schoolId, access.school.id), inArray(students.id, ids)))

    if (rows.length !== ids.length) {
      return { ok: false, error: 'بعض الطلاب المحددين غير موجودين في هذه المدرسة' }
    }
    const blocked = rows.filter((r) => !canEditGrade(access, r.gradeLevelId))
    if (blocked.length > 0) {
      return { ok: false, error: `${blocked.length} من الطلاب المحددين في مرحلة لا تملك صلاحية تعديلها` }
    }

    const alreadyThere = rows.filter((r) => r.classId === targetClassId).length
    const toMove = rows.filter((r) => r.classId !== targetClassId).map((r) => r.id)
    if (toMove.length === 0) {
      return { ok: false, error: 'كل الطلاب المحددين في هذا الفصل بالفعل' }
    }

    await db.update(students).set({ classId: targetClassId }).where(inArray(students.id, toMove))

    await logAudit(access, 'student.transfer', `إلى فصل ${target.name}`, {
      moved: toMove.length,
      alreadyThere,
      targetClassId,
    })

    revalidatePath('/admin/promote')
    revalidatePath('/admin/students')
    revalidatePath('/admin/grade-levels')
    return { ok: true, moved: toMove.length }
  } catch (error) {
    console.error('Transfer Students Error:', error)
    return { ok: false, error: 'حدث خطأ أثناء الترحيل' }
  }
}
