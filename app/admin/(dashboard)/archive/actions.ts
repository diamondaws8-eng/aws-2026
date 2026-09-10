'use server'

import { db } from '@/lib/db'
import { schools, schoolYears } from '@/lib/db/schema'
import { eq, and, isNull, desc, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getAdminAccess } from '@/lib/admin-access'
import { logAudit } from '@/lib/audit'
import { isValidDateString } from '@/lib/utils'

/**
 * Opening and closing an academic year.
 *
 * Closing moves nothing. It writes down where the year ended, keeps the figures
 * as they stood that day, and points the school at the next one. Every register
 * entry stays exactly where it was written — which is what lets the archive
 * show any past year, and what lets a parent still see their child's first
 * year three years later.
 */

export type YearResult = { ok: true; message: string } | { ok: false; error: string }

async function requireYearManager() {
  const access = await getAdminAccess()
  if (!access) return { error: 'غير مصرح بهذا الإجراء' as const, access: null }
  // Closing a year resets what every portal in the school counts, so it sits
  // with whoever answers for the whole school.
  if (!access.editAllGrades) {
    return { error: 'إقفال العام لمالك النظام ومدير الجودة فقط' as const, access: null }
  }
  return { error: null, access }
}

/**
 * Records the year the school is already living in.
 *
 * A school that has been running before this feature existed has records but no
 * year row. This writes one from what the settings already say, so the first
 * close has something to close.
 */
export async function openCurrentYear(startDate: string): Promise<YearResult> {
  const { error, access } = await requireYearManager()
  if (!access) return { ok: false, error }

  if (!isValidDateString(startDate)) {
    return { ok: false, error: 'تاريخ البداية يجب أن يكون بصيغة YYYY-MM-DD' }
  }

  try {
    const [open] = await db
      .select({ id: schoolYears.id, label: schoolYears.label })
      .from(schoolYears)
      .where(and(eq(schoolYears.schoolId, access.school.id), isNull(schoolYears.closedAt)))
      .limit(1)
    if (open) return { ok: false, error: `العام ${open.label} مفتوح بالفعل` }

    await db.insert(schoolYears).values({
      schoolId: access.school.id,
      label: access.school.academicYear,
      startDate,
    })
    // The year's start is also where points count from, so the two can never
    // disagree: one date, written in both places at once.
    await db.update(schools).set({ yearStartDate: startDate }).where(eq(schools.id, access.school.id))

    await logAudit(access, 'year.open', access.school.academicYear, { startDate })
    revalidatePath('/admin', 'layout')
    return { ok: true, message: `فُتح العام ${access.school.academicYear} ابتداءً من ${startDate}` }
  } catch (e) {
    console.error('Open Year Error:', e)
    return { ok: false, error: 'تعذّر فتح العام' }
  }
}

/**
 * Closes the running year and opens the next.
 *
 * Deliberately does NOT touch a single record. The new year starts at zero
 * because every total counts from the new start date, not because anything was
 * emptied — so last year stays readable in the archive, and a pupil's history
 * follows the pupil rather than the calendar.
 */
export async function closeYearAndOpenNext(input: {
  endDate: string
  nextLabel: string
  nextStartDate: string
}): Promise<YearResult> {
  const { error, access } = await requireYearManager()
  if (!access) return { ok: false, error }

  const endDate = String(input?.endDate ?? '').trim()
  const nextLabel = String(input?.nextLabel ?? '').trim().slice(0, 20)
  const nextStartDate = String(input?.nextStartDate ?? '').trim()

  if (!isValidDateString(endDate) || !isValidDateString(nextStartDate)) {
    return { ok: false, error: 'التواريخ يجب أن تكون بصيغة YYYY-MM-DD' }
  }
  if (!nextLabel) return { ok: false, error: 'اسم العام الجديد مطلوب' }

  try {
    const [open] = await db
      .select({ id: schoolYears.id, label: schoolYears.label, startDate: schoolYears.startDate })
      .from(schoolYears)
      .where(and(eq(schoolYears.schoolId, access.school.id), isNull(schoolYears.closedAt)))
      .orderBy(desc(schoolYears.startDate))
      .limit(1)
    if (!open) return { ok: false, error: 'لا يوجد عام مفتوح ليُقفل — افتح العام الحالي أولاً' }

    if (endDate < open.startDate) {
      return { ok: false, error: 'تاريخ نهاية العام قبل تاريخ بدايته' }
    }
    if (nextStartDate <= endDate) {
      return { ok: false, error: 'العام الجديد يجب أن يبدأ بعد نهاية العام المُقفل' }
    }
    if (nextLabel === open.label) {
      return { ok: false, error: 'اسم العام الجديد مطابق للعام المُقفل' }
    }

    // Counted once, now, and kept — see the note on schoolYears.summary.
    const { summariseYear } = await import('@/lib/school-years')
    const summary = await summariseYear(access.school.id, open.startDate, endDate)

    await db.transaction(async (tx) => {
      await tx.update(schoolYears).set({
        endDate,
        closedAt: new Date(),
        closedByUserId: access.userId,
        closedByName: access.name,
        summary: JSON.stringify(summary),
      }).where(eq(schoolYears.id, open.id))

      await tx.insert(schoolYears).values({
        schoolId: access.school.id,
        label: nextLabel,
        startDate: nextStartDate,
      })

      // Everything the portals count from: the label marks are stamped with,
      // the date totals start at, and the term back to the first.
      await tx.update(schools).set({
        academicYear: nextLabel,
        yearStartDate: nextStartDate,
        currentSemester: 'first',
      }).where(eq(schools.id, access.school.id))

      // Housekeeping nobody else does: sign-in sessions expire after a week
      // but their rows never left the table. A year of three hundred people
      // signing in is thousands of dead rows — swept once, here.
      await tx.execute(sql`DELETE FROM "session" WHERE "expiresAt" < now()`)
      // Announcements that already expired are filtered out of every screen
      // but were never removed, and a family's bell keeps every read notice
      // forever. A year is long enough for both.
      await tx.execute(sql`DELETE FROM notifications WHERE expires_at IS NOT NULL AND expires_at < now() - interval '30 days'`)
      await tx.execute(sql`DELETE FROM user_notifications WHERE read_at IS NOT NULL AND created_at < now() - interval '365 days'`)
    })

    await logAudit(access, 'year.close', `${open.label} ← ${nextLabel}`, {
      closedYear: open.label,
      range: `${open.startDate} .. ${endDate}`,
      nextLabel,
      nextStartDate,
      summary,
    })

    revalidatePath('/admin', 'layout')
    revalidatePath('/teacher', 'layout')
    revalidatePath('/parent', 'layout')
    return {
      ok: true,
      message: `أُقفل العام ${open.label}، وبدأ العام ${nextLabel} من ${nextStartDate}. كل العدادات تبدأ من الصفر، وبيانات ${open.label} محفوظة في الأرشيف.`,
    }
  } catch (e) {
    console.error('Close Year Error:', e)
    return { ok: false, error: 'تعذّر إقفال العام — لم يتغيّر شيء' }
  }
}
