import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { user, schools } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'

/**
 * First-time setup only.
 *
 * This exists so the very first account can mark itself as an admin before the
 * school row exists. Once a school is there, admin accounts come from فريق
 * الإدارة — leaving this open would let any signed-in parent or teacher stamp
 * themselves 'admin' and walk past the guard on /admin/setup.
 */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [existingSchool] = await db.select({ id: schools.id }).from(schools).limit(1)
  if (existingSchool) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { role } = await req.json()
  if (role !== 'admin') return NextResponse.json({ error: 'Invalid role' }, { status: 400 })

  await db.update(user).set({ role, updatedAt: new Date() }).where(eq(user.id, session.user.id))
  return NextResponse.json({ ok: true })
}
