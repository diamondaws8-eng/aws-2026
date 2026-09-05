'use server'

import { db } from '@/lib/db'
import { notifications } from '@/lib/db/schema'
import { revalidatePath } from 'next/cache'
import { eq, and } from 'drizzle-orm'

export async function sendNotification(data: any) {
  await db.insert(notifications).values({
    schoolId: data.schoolId,
    fromUserId: data.fromUserId,
    studentId: data.studentId || null,
    classId: data.classId || null,
    title: data.title,
    body: data.body,
    type: data.type,
    expiresAt: data.expiresAt || null
  })
  revalidatePath('/admin/notifications')
}

export async function deleteNotification(id: string, schoolId: string) {
  await db.delete(notifications).where(
    and(
      eq(notifications.id, id),
      eq(notifications.schoolId, schoolId)
    )
  )
  revalidatePath('/admin/notifications')
}
