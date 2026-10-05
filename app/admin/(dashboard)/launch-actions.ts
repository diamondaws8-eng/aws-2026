'use server'

import { db } from '@/lib/db'
import { schools, schoolYears } from '@/lib/db/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getAdminAccess } from '@/lib/admin-access'
import { logAudit } from '@/lib/audit'
import { isValidDateString, today, formatDayGregorianAr } from '@/lib/utils'
import { shiftDate } from '@/lib/school-days'
import { LAUNCH_PHRASE, LAUNCH_MAX_DAYS_BACK, LAUNCH_MAX_DAYS_AHEAD } from '@/lib/launch-rules'

export type LaunchResult = { ok: true; liveSince: string } | { ok: false; error: string }

/**
 * «التشغيل من اليوم والبداية الحقيقية» — the one press that ends the setup.
 *
 * Until it is pressed the school is being prepared: nothing is recorded and
 * nothing is counted (see lib/launch.ts). Pressing it names the first real
 * day of study, and from that day the register opens, the points count and
 * the reminders begin. The same date becomes the start of the academic year,
 * because that is what «counting from» means everywhere else in the system.
 *
 * Once only. The write is conditional on the school still being in setup, so
 * two people pressing together produce one launch, and a second press on an
 * old tab is refused. Only wiping the trial data (the reset in settings) puts
 * a school back into setup.
 */
export async function launchSchool(startDate: string, phrase: string): Promise<LaunchResult> {
  const access = await getAdminAccess()
  if (!access || (access.role !== 'owner' && access.role !== 'quality_manager')) {
    return { ok: false, error: 'بدء التشغيل الفعلي متاح للمالك ومدير الجودة فقط' }
  }
  if (String(phrase ?? '').trim() !== LAUNCH_PHRASE) {
    return { ok: false, error: `اكتب كلمة «${LAUNCH_PHRASE}» للتأكيد` }
  }
  if (!isValidDateString(startDate)) return { ok: false, error: 'اختر يوم بداية الدراسة' }
  const todayStr = today()
  if (startDate < shiftDate(todayStr, -LAUNCH_MAX_DAYS_BACK) || startDate > shiftDate(todayStr, LAUNCH_MAX_DAYS_AHEAD)) {
    return { ok: false, error: 'يوم بداية الدراسة بعيد جداً عن اليوم — راجع التاريخ' }
  }

  const school = access.school
  if (school.liveSince) {
    return { ok: false, error: `بدأ التشغيل الفعلي من قبل (${formatDayGregorianAr(school.liveSince, true)})` }
  }

  try {
    const years = await db
      .select({ id: schoolYears.id, endDate: schoolYears.endDate, closedAt: schoolYears.closedAt })
      .from(schoolYears)
      .where(eq(schoolYears.schoolId, school.id))
    // A year cannot begin inside one that has already been closed and counted.
    const lastClosedEnd = years
      .filter((y) => y.closedAt && y.endDate)
      .reduce<string | null>((max, y) => (max && max > y.endDate! ? max : y.endDate), null)
    if (lastClosedEnd && startDate <= lastClosedEnd) {
      return { ok: false, error: `يوم البداية يجب أن يكون بعد نهاية العام المُقفل (${lastClosedEnd})` }
    }
    const open = years.find((y) => !y.closedAt) ?? null

    const launched = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(schools)
        .set({ liveSince: startDate, yearStartDate: startDate })
        // Still in setup: the press that arrives second finds nothing to change.
        .where(and(eq(schools.id, school.id), isNull(schools.liveSince)))
        .returning({ id: schools.id })
      if (!row) return false
      // The year's start is written in two places — the school row the points
      // read, and the open row of school_years the archive reads. Both move.
      if (open) {
        await tx.update(schoolYears).set({ label: school.academicYear, startDate }).where(eq(schoolYears.id, open.id))
      } else {
        await tx.insert(schoolYears).values({ schoolId: school.id, label: school.academicYear, startDate })
      }
      return true
    })
    if (!launched) return { ok: false, error: 'بدأ التشغيل الفعلي من قبل — حدِّث الصفحة' }

    await logAudit(access, 'school.launch', school.name, { startDate })

    revalidatePath('/admin', 'layout')
    revalidatePath('/teacher', 'layout')
    revalidatePath('/parent', 'layout')
    revalidatePath('/counselor', 'layout')
    return { ok: true, liveSince: startDate }
  } catch (error) {
    console.error('Launch School Error:', error)
    return { ok: false, error: 'تعذّر بدء التشغيل — لم يتغيّر شيء، أعد المحاولة' }
  }
}
