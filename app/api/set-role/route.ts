import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { user } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { role } = await req.json()
  if (!['admin', 'teacher', 'parent'].includes(role)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  await db.update(user).set({ role, updatedAt: new Date() }).where(eq(user.id, session.user.id))
  return NextResponse.json({ ok: true })
}
