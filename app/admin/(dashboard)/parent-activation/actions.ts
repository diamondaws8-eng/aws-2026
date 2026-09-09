'use server'

import { db } from '@/lib/db'
import { schools, students, classes, parentActivationLog } from '@/lib/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getAdminAccess, canViewGrade } from '@/lib/admin-access'
import { logAudit } from '@/lib/audit'
import { MAX_ACTIVATION_MESSAGE } from '@/lib/parent-activation'

/**
 * Every export here is a public HTTP endpoint. Both of them therefore establish
 * who is calling before anything else, and the one that writes proves the
 * parents named actually belong to children inside the caller's own grades —
 * otherwise a deputy of one stage could log outreach against the whole school,
 * or against ids that are not parents at all.
 */

export type ActionResult = { ok: true } | { ok: false; error: string }

export async function saveActivationMessage(message: string): Promise<ActionResult> {
  try {
    const access = await getAdminAccess()
    if (!access) return { ok: false, error: 'غير مصرح بهذا الإجراء' }
    if (!access.canManageSchoolSettings) {
      return { ok: false, error: 'تعديل نص الرسالة متاح لمدير الجودة ومالك النظام' }
    }

    const clean = String(message ?? '').trim().slice(0, MAX_ACTIVATION_MESSAGE)
    if (clean.length < 20) return { ok: false, error: 'نص الرسالة قصير جداً' }

    await db.update(schools)
      .set({ parentActivationMessage: clean })
      .where(eq(schools.id, access.school.id))

    await logAudit(access, 'settings.update', 'نص رسالة تفعيل حسابات أولياء الأمور')
    revalidatePath('/admin/parent-activation')
    return { ok: true }
  } catch (error) {
    console.error('Save Activation Message Error:', error)
    return { ok: false, error: 'تعذّر حفظ نص الرسالة' }
  }
}

/**
 * Records that these families have now been asked.
 *
 * Called after the WhatsApp tab is opened, never before: the point of the log
 * is "who have we already contacted", and marking somebody contacted when the
 * message was never sent is exactly the failure it exists to prevent.
 */
export async function logActivationOutreach(parentUserIds: string[]): Promise<ActionResult> {
  try {
    const access = await getAdminAccess()
    if (!access) return { ok: false, error: 'غير مصرح بهذا الإجراء' }

    const wanted = [...new Set((parentUserIds ?? []).filter((id) => typeof id === 'string' && id))]
    if (wanted.length === 0) return { ok: false, error: 'لم يُحدَّد أحد' }
    if (wanted.length > 500) return { ok: false, error: 'عدد كبير جداً في طلب واحد' }

    // Only parents of children this account is allowed to see, and only inside
    // this school. Anything else in the list is silently dropped rather than
    // trusted.
    const rows = await db
      .select({ parentUserId: students.parentUserId, gradeLevelId: classes.gradeLevelId })
      .from(students)
      .leftJoin(classes, eq(students.classId, classes.id))
      .where(and(
        eq(students.schoolId, access.school.id),
        inArray(students.parentUserId, wanted),
      ))

    const allowed = [...new Set(
      rows.filter((r) => canViewGrade(access, r.gradeLevelId)).map((r) => r.parentUserId!),
    )]
    if (allowed.length === 0) return { ok: false, error: 'لا يوجد ولي أمر ضمن نطاقك في هذا الطلب' }

    await db.insert(parentActivationLog).values(
      allowed.map((parentUserId) => ({
        schoolId: access.school.id,
        parentUserId,
        sentByUserId: access.userId,
      })),
    )

    revalidatePath('/admin/parent-activation')
    return { ok: true }
  } catch (error) {
    console.error('Log Activation Outreach Error:', error)
    return { ok: false, error: 'تعذّر تسجيل الإرسال' }
  }
}
