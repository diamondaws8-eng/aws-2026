'use server'

import { db } from '@/lib/db'
import { notifications, classes } from '@/lib/db/schema'
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
  } else if (!data.studentId && !access.editAllGrades) {
    return { ok: false, error: 'التنبيهات العامة متاحة لمن يملك صلاحية على كل المراحل' }
  }

  await db.insert(notifications).values({
    schoolId: access.school.id,
    fromUserId: access.userId,
    studentId: data.studentId || null,
    classId: data.classId || null,
    title: data.title,
    body: data.body,
    type: data.type,
    expiresAt: data.expiresAt || null
  })
  revalidatePath('/admin/notifications')
  return { ok: true }
}

export async function deleteNotification(id: string, schoolId: string) {
  const access = await getAdminAccess()
  if (!access || !access.canEdit || access.school.id !== schoolId) return
  await db.delete(notifications).where(
    and(
      eq(notifications.id, id),
      eq(notifications.schoolId, schoolId)
    )
  )
  revalidatePath('/admin/notifications')
}
