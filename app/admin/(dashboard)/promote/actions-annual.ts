'use server'

import { db } from '@/lib/db'
import { students, classes, schools } from '@/lib/db/schema'
import { eq, and, inArray, ne } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getAdminAccess } from '@/lib/admin-access'
import { logAudit } from '@/lib/audit'

/**
 * The end-of-year move, driven by each class's stated destination.
 *
 * It crosses stages and buildings, so it is not a grade-scoped operation: it
 * belongs to whoever holds the whole school. A principal of the primary side
 * cannot be asked to push pupils into an intermediate side they hold no rights
 * over, and asking two principals to each do half is how a year group ends up
 * split across two registers.
 */

export type AnnualResult =
  | { ok: true; moved: number; graduated: number; untouched: number }
  | { ok: false; error: string }

async function requireWholeSchoolEditor() {
  const access = await getAdminAccess()
  if (!access) return { error: 'غير مصرح بهذا الإجراء' as const, access: null }
  if (!access.editAllGrades) {
    return { error: 'الترحيل السنوي وخريطة الترقية لمالك النظام ومدير الجودة فقط' as const, access: null }
  }
  return { error: null, access }
}

/** Set (or clear) where one class sends its pupils, or mark it the end of a path. */
export async function setPromotionTarget(
  classId: string,
  targetClassId: string | null,
  isTerminal: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error, access } = await requireWholeSchoolEditor()
  if (!access) return { ok: false, error }

  try {
    const [source] = await db
      .select({ id: classes.id })
      .from(classes)
      .where(and(eq(classes.id, classId), eq(classes.schoolId, access.school.id)))
      .limit(1)
    if (!source) return { ok: false, error: 'الفصل غير موجود' }

    // A class that graduates its pupils cannot also send them onward: the two
    // answers contradict, and stored together one of them would win silently.
    const target = isTerminal ? null : targetClassId

    if (target) {
      if (target === classId) return { ok: false, error: 'لا يمكن أن يُرحَّل الفصل إلى نفسه' }
      const [dest] = await db
        .select({ id: classes.id })
        .from(classes)
        .where(and(eq(classes.id, target), eq(classes.schoolId, access.school.id)))
        .limit(1)
      if (!dest) return { ok: false, error: 'الفصل المستهدف غير موجود' }
    }

    await db.update(classes)
      .set({ promotesToClassId: target, isTerminal: !!isTerminal })
      .where(eq(classes.id, classId))

    revalidatePath('/admin/promote')
    return { ok: true }
  } catch (e) {
    console.error('Set Promotion Target Error:', e)
    return { ok: false, error: 'تعذّر حفظ وجهة الترقية' }
  }
}

/**
 * Run the whole map at once. `holdBack` names the pupils who repeat the year
 * and stay exactly where they are.
 */
export async function runAnnualPromotion(holdBack: string[] = []): Promise<AnnualResult> {
  const { error, access } = await requireWholeSchoolEditor()
  if (!access) return { ok: false, error }

  try {
    const schoolId = access.school.id
    const held = new Set((holdBack ?? []).filter((s) => typeof s === 'string' && s))

    const [classRows, studentRows, [school]] = await Promise.all([
      db.select({
          id: classes.id,
          promotesTo: classes.promotesToClassId,
          isTerminal: classes.isTerminal,
        })
        .from(classes)
        .where(eq(classes.schoolId, schoolId)),
      db.select({ id: students.id, classId: students.classId })
        .from(students)
        .where(and(eq(students.schoolId, schoolId), eq(students.status, 'active'))),
      db.select({ year: schools.academicYear }).from(schools).where(eq(schools.id, schoolId)).limit(1),
    ])

    const byId = new Map(classRows.map((c) => [c.id, c]))

    /**
     * Every pupil's destination is decided from the register as it stands
     * BEFORE a single row is written. Applying the map class by class instead
     * would carry a year group straight through a chain: with 4→5 and 5→6 run
     * in that order, the fourth grade lands in the fifth and is then swept on
     * into the sixth in the very same run.
     */
    const moveTo = new Map<string, string[]>()
    const graduating: string[] = []
    const graduatingFrom = new Map<string, string>()
    let untouched = 0

    for (const s of studentRows) {
      if (!s.classId || held.has(s.id)) { untouched++; continue }
      const cls = byId.get(s.classId)
      if (!cls) { untouched++; continue }

      if (cls.isTerminal) {
        graduating.push(s.id)
        graduatingFrom.set(s.id, s.classId)
      } else if (cls.promotesTo && byId.has(cls.promotesTo)) {
        const list = moveTo.get(cls.promotesTo) ?? []
        list.push(s.id)
        moveTo.set(cls.promotesTo, list)
      } else {
        // No destination stated: left exactly where they are, and counted, so
        // the screen can say so instead of implying everyone was handled.
        untouched++
      }
    }

    let moved = 0
    await db.transaction(async (tx) => {
      for (const [targetClassId, ids] of moveTo) {
        if (ids.length === 0) continue
        await tx.update(students).set({ classId: targetClassId }).where(inArray(students.id, ids))
        moved += ids.length
      }

      // Graduates keep every record they ever made; they lose only their seat.
      for (const id of graduating) {
        await tx.update(students).set({
          status: 'graduated',
          classId: null,
          graduatedFromClassId: graduatingFrom.get(id) ?? null,
          graduatedAt: new Date(),
          graduationYear: school?.year ?? null,
        }).where(eq(students.id, id))
      }
    })

    await logAudit(access, 'students.annualPromotion', `العام ${school?.year ?? ''}`.trim(), {
      moved,
      graduated: graduating.length,
      untouched,
      heldBack: held.size,
    })

    revalidatePath('/admin/promote')
    revalidatePath('/admin/students')
    revalidatePath('/admin')
    return { ok: true, moved, graduated: graduating.length, untouched }
  } catch (e) {
    console.error('Annual Promotion Error:', e)
    return { ok: false, error: 'حدث خطأ أثناء الترحيل السنوي — لم يتم تعديل أي بيانات' }
  }
}

/** Put a graduate back on the rolls — for an end-of-year run made too early. */
export async function undoGraduation(studentId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error, access } = await requireWholeSchoolEditor()
  if (!access) return { ok: false, error }

  try {
    const [s] = await db
      .select({ id: students.id, from: students.graduatedFromClassId })
      .from(students)
      .where(and(
        eq(students.id, studentId),
        eq(students.schoolId, access.school.id),
        ne(students.status, 'active'),
      ))
      .limit(1)
    if (!s) return { ok: false, error: 'الطالب غير موجود أو ليس متخرجاً' }
    if (!s.from) return { ok: false, error: 'لا يوجد فصل مسجَّل للعودة إليه — أعِده يدوياً من صفحة الطلاب' }

    await db.update(students).set({
      status: 'active',
      classId: s.from,
      graduatedAt: null,
      graduatedFromClassId: null,
      graduationYear: null,
    }).where(eq(students.id, studentId))

    await logAudit(access, 'students.annualPromotion', 'تراجع عن تخرّج طالب', { studentId })
    revalidatePath('/admin/promote')
    revalidatePath('/admin/students')
    return { ok: true }
  } catch (e) {
    console.error('Undo Graduation Error:', e)
    return { ok: false, error: 'تعذّر التراجع' }
  }
}
