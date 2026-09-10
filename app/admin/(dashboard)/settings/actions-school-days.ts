'use server'

import { db } from '@/lib/db'
import { schools, schoolHolidays, gradeLevels } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getAdminAccess } from '@/lib/admin-access'
import { logAudit } from '@/lib/audit'
import { isValidDateString } from '@/lib/utils'

/**
 * Every export here is a public HTTP endpoint, so each one establishes who is
 * calling and works only on that caller's own school. The capability is
 * canManageSchoolDays, which the principal holds as well — see lib/admin-access.
 */

export type DaysResult = { ok: true } | { ok: false; error: string }

const MAX_HOLIDAYS = 60
const MAX_NAME = 80

async function requireDaysManager() {
  const access = await getAdminAccess()
  if (!access) return { error: 'غير مصرح بهذا الإجراء' as const, access: null }
  if (!access.canManageSchoolDays) {
    return { error: 'تعديل أيام الدراسة متاح لمدير المدرسة ومدير الجودة ومالك النظام' as const, access: null }
  }
  return { error: null, access }
}

/**
 * The weekly rest. Friday is fixed; only Saturday is anybody's to decide.
 *
 * `gradeLevelId` null sets the school's answer. Naming a stage sets that
 * stage's own — and `on` null there means it has no answer of its own and goes
 * back to following the school, which is where every stage starts.
 */
export async function setSaturdayIsSchoolDay(
  on: boolean | null,
  gradeLevelId?: string | null,
): Promise<DaysResult> {
  const { error, access } = await requireDaysManager()
  if (!access) return { ok: false, error }

  try {
    if (gradeLevelId) {
      const [stage] = await db
        .select({ id: gradeLevels.id, name: gradeLevels.name })
        .from(gradeLevels)
        .where(and(eq(gradeLevels.id, gradeLevelId), eq(gradeLevels.schoolId, access.school.id)))
        .limit(1)
      if (!stage) return { ok: false, error: 'المرحلة غير موجودة' }

      await db.update(gradeLevels)
        .set({ saturdayIsSchoolDay: on })
        .where(eq(gradeLevels.id, gradeLevelId))

      await logAudit(access, 'settings.update',
        `يوم السبت — ${stage.name}: ${on === null ? 'يتبع المدرسة' : on ? 'يوم دراسة' : 'إجازة'}`)
    } else {
      // The school's own answer is never absent: it is the value stages fall
      // back to, so it stays a plain true/false.
      await db.update(schools)
        .set({ saturdayIsSchoolDay: on === true })
        .where(eq(schools.id, access.school.id))

      await logAudit(access, 'settings.update', on ? 'تشغيل يوم السبت' : 'إيقاف يوم السبت')
    }

    revalidatePath('/admin', 'layout')
    return { ok: true }
  } catch (e) {
    console.error('Set Saturday Error:', e)
    return { ok: false, error: 'تعذّر حفظ إعداد يوم السبت' }
  }
}

export async function addSchoolHoliday(input: {
  name: string
  startDate: string
  endDate: string
  /** Null closes the whole school; a stage id closes only that stage. */
  gradeLevelId?: string | null
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { error, access } = await requireDaysManager()
  if (!access) return { ok: false, error }

  const name = String(input?.name ?? '').trim().slice(0, MAX_NAME)
  if (!name) return { ok: false, error: 'اسم الإجازة مطلوب' }

  const startDate = String(input?.startDate ?? '').trim()
  const endDate = String(input?.endDate ?? '').trim() || startDate
  if (!isValidDateString(startDate) || !isValidDateString(endDate)) {
    return { ok: false, error: 'التاريخ يجب أن يكون بصيغة YYYY-MM-DD' }
  }
  // A range that ends before it starts silently covers nothing, which looks
  // like the holiday was saved and then ignored.
  if (endDate < startDate) return { ok: false, error: 'تاريخ النهاية قبل تاريخ البداية' }

  try {
    const existing = await db
      .select({ id: schoolHolidays.id })
      .from(schoolHolidays)
      .where(eq(schoolHolidays.schoolId, access.school.id))
    if (existing.length >= MAX_HOLIDAYS) {
      return { ok: false, error: `الحد الأقصى ${MAX_HOLIDAYS} إجازة` }
    }

    // A stage id from the browser is only honoured if it is really this
    // school's, so a stray value cannot file a holiday under someone else.
    let gradeLevelId: string | null = null
    if (input.gradeLevelId) {
      const [stage] = await db
        .select({ id: gradeLevels.id })
        .from(gradeLevels)
        .where(and(eq(gradeLevels.id, input.gradeLevelId), eq(gradeLevels.schoolId, access.school.id)))
        .limit(1)
      if (!stage) return { ok: false, error: 'المرحلة غير موجودة' }
      gradeLevelId = stage.id
    }

    // The real id goes back to the browser. The list used to show the new row
    // under a made-up id until the next full load, so "delete" on a holiday
    // added a moment ago sent that made-up id here and was refused.
    const [inserted] = await db.insert(schoolHolidays).values({
      schoolId: access.school.id,
      gradeLevelId,
      name,
      startDate,
      endDate,
    }).returning({ id: schoolHolidays.id })

    await logAudit(access, 'settings.update', `إضافة إجازة: ${name}`, { startDate, endDate, gradeLevelId })
    revalidatePath('/admin', 'layout')
    return { ok: true, id: inserted.id }
  } catch (e) {
    console.error('Add Holiday Error:', e)
    return { ok: false, error: 'تعذّر إضافة الإجازة' }
  }
}

export async function deleteSchoolHoliday(id: string): Promise<DaysResult> {
  const { error, access } = await requireDaysManager()
  if (!access) return { ok: false, error }

  try {
    // Scoped to this school: an id from the browser proves nothing on its own.
    const removed = await db
      .delete(schoolHolidays)
      .where(and(eq(schoolHolidays.id, id), eq(schoolHolidays.schoolId, access.school.id)))
      .returning({ name: schoolHolidays.name })
    if (removed.length === 0) return { ok: false, error: 'الإجازة غير موجودة' }

    await logAudit(access, 'settings.update', `حذف إجازة: ${removed[0].name}`)
    revalidatePath('/admin', 'layout')
    return { ok: true }
  } catch (e) {
    console.error('Delete Holiday Error:', e)
    return { ok: false, error: 'تعذّر حذف الإجازة' }
  }
}

// The reader lives in lib/school-holidays.ts, not here. An export from a
// 'use server' file is a public HTTP endpoint, and one taking a schoolId would
// hand any caller who knows an id that school's calendar.
