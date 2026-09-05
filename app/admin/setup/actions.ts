'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { schools } from '@/lib/db/schema'
import { headers } from 'next/headers'

export async function createSchool(data: { name: string; academicYear: string }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return { error: 'Unauthorized' }

  try {
    await db.insert(schools).values({
      name: data.name,
      academicYear: data.academicYear,
      adminId: session.user.id
    })
    return { ok: true }
  } catch (error) {
    console.error(error)
    return { error: 'Failed to create school' }
  }
}
