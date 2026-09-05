'use server'

import { db } from '@/lib/db'
import { teachers, user } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'

export async function updateTeacherSettings(teacherId: string, input: { phone: string; whatsappTemplates: { positive: string[], negative: string[] } }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')

  await db.update(teachers).set({
    phone: input.phone,
    whatsappTemplates: JSON.stringify(input.whatsappTemplates),
  }).where(eq(teachers.id, teacherId))
  
  revalidatePath('/teacher/settings')
  return { ok: true }
}

export async function getTeacherSettings() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')

  const [teacher] = await db.select().from(teachers).where(eq(teachers.userId, session.user.id)).limit(1)
  if (!teacher) throw new Error('Not found')

  const templates = teacher.whatsappTemplates ? JSON.parse(teacher.whatsappTemplates as string) : { positive: [], negative: [] }
  return { teacherId: teacher.id, phone: teacher.phone || '', templates }
}
