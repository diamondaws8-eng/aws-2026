'use server'

import { db } from '@/lib/db'
import { students, classes, schools } from '@/lib/db/schema'
import { eq, and, inArray, ne } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getAdminAccess } from '@/lib/admin-access'
import { logAudit } from '@/lib/audit'
import { planPromotion, destinationsOf, parseExtraDestinations } from '@/lib/promotion-plan'

/** More hand-picked destinations than this is not a school's promotion. */
const MAX_ASSIGNMENTS = 5000

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

/** A class can be shared between this many destinations in all. */
const MAX_DESTINATIONS = 6

/**
 * Set (or clear) where one class sends its pupils, or mark it the end of a path.
 *
 * `extraTargetIds` are further destinations beyond the main one: a class given
 * any is shared out between all of them at the end of the year, so that the
 * receiving classes finish level. See lib/promotion-plan.ts.
 */
export async function setPromotionTarget(
  classId: string,
  targetClassId: string | null,
  isTerminal: boolean,
  extraTargetIds: string[] = [],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error, access } = await requireWholeSchoolEditor()
  if (!access) return { ok: false, error }

  try {
    const schoolClasses = await db
      .select({ id: classes.id })
      .from(classes)
      .where(eq(classes.schoolId, access.school.id))
    const known = new Set(schoolClasses.map((c) => c.id))
    if (!known.has(classId)) return { ok: false, error: 'الفصل غير موجود' }

    // A class that graduates its pupils cannot also send them onward: the two
    // answers contradict, and stored together one of them would win silently.
    const target = isTerminal ? null : targetClassId

    if (target) {
      if (target === classId) return { ok: false, error: 'لا يمكن أن يُرحَّل الفصل إلى نفسه' }
      if (!known.has(target)) return { ok: false, error: 'الفصل المستهدف غير موجود' }
    }

    // Extra destinations mean nothing without a main one, and every id is the
    // browser's word until it is found among this school's own classes.
    const requested = Array.isArray(extraTargetIds)
      ? extraTargetIds.filter((id): id is string => typeof id === 'string' && !!id)
      : []
    const extras = target ? [...new Set(requested)].filter((id) => id !== target) : []
    if (extras.includes(classId)) return { ok: false, error: 'لا يمكن أن يُرحَّل الفصل إلى نفسه' }
    if (extras.some((id) => !known.has(id))) return { ok: false, error: 'أحد الفصول المستهدفة غير موجود' }
    if (extras.length + 1 > MAX_DESTINATIONS) {
      return { ok: false, error: `أقصى عدد للوجهات ${MAX_DESTINATIONS} فصول` }
    }

    await db.update(classes)
      .set({
        promotesToClassId: target,
        extraPromotionClassIds: extras.length ? JSON.stringify(extras) : null,
        isTerminal: !!isTerminal,
      })
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
 * and stay exactly where they are. `assignments` carries the destinations
 * picked by hand for pupils of a class that is shared between several — the
 * rest of such a class is dealt out evenly.
 */
export async function runAnnualPromotion(
  holdBack: string[] = [],
  assignments: Record<string, string> = {},
): Promise<AnnualResult> {
  const { error, access } = await requireWholeSchoolEditor()
  if (!access) return { ok: false, error }

  try {
    const schoolId = access.school.id
    const held = new Set((Array.isArray(holdBack) ? holdBack : []).filter((s) => typeof s === 'string' && s))
    const overrides: Record<string, string> = {}
    if (assignments && typeof assignments === 'object') {
      for (const [studentId, classId] of Object.entries(assignments).slice(0, MAX_ASSIGNMENTS)) {
        if (typeof classId === 'string' && classId) overrides[studentId] = classId
      }
    }

    const [classRows, studentRows, [school]] = await Promise.all([
      db.select({
          id: classes.id,
          promotesTo: classes.promotesToClassId,
          extra: classes.extraPromotionClassIds,
          isTerminal: classes.isTerminal,
        })
        .from(classes)
        .where(eq(classes.schoolId, schoolId)),
      db.select({ id: students.id, fullName: students.fullName, classId: students.classId })
        .from(students)
        .where(and(eq(students.schoolId, schoolId), eq(students.status, 'active'))),
      db.select({ year: schools.academicYear }).from(schools).where(eq(schools.id, schoolId)).limit(1),
    ])

    /**
     * Every pupil's destination is decided from the register as it stands
     * BEFORE a single row is written. Applying the map class by class instead
     * would carry a year group straight through a chain: with 4→5 and 5→6 run
     * in that order, the fourth grade lands in the fifth and is then swept on
     * into the sixth in the very same run.
     *
     * The decision itself is lib/promotion-plan.ts — the same function the
     * screen ran to draw the preview. The screen sends back the destination
     * it showed for every pupil of a shared-out class, so those pupils go
     * where they were shown even if the register changed in between; only a
     * pupil the screen never saw is dealt here. An assignment naming a class
     * that is not one of the pupil's destinations is ignored, and the pupil is
     * dealt like the rest; a pupil in a class with no destination stays where
     * they are and is counted, so the screen can say so instead of implying
     * everyone was handled.
     */
    const known = new Set(classRows.map((c) => c.id))
    const plan = planPromotion({
      classes: classRows.map((c) => ({
        id: c.id,
        destinations: destinationsOf(c.id, c.promotesTo, parseExtraDestinations(c.extra), (id) => known.has(id)),
        isTerminal: c.isTerminal,
      })),
      students: studentRows,
      held,
      overrides,
    })

    const moveTo = new Map<string, string[]>()
    for (const [studentId, targetClassId] of plan.moves) {
      const list = moveTo.get(targetClassId) ?? []
      list.push(studentId)
      moveTo.set(targetClassId, list)
    }
    const classOf = new Map(studentRows.map((s) => [s.id, s.classId]))
    const graduating = plan.graduating
    const graduatingFrom = new Map<string, string>()
    for (const id of graduating) {
      const from = classOf.get(id)
      if (from) graduatingFrom.set(id, from)
    }
    const untouched = plan.untouched

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
      ...(plan.splitCount ? { split: plan.splitCount } : {}),
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
