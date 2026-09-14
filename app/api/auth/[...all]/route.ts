import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { toNextJsHandler } from 'better-auth/next-js'
import { db } from '@/lib/db'
import { schools } from '@/lib/db/schema'

const handler = toNextJsHandler(auth.handler)

export const GET = handler.GET

/**
 * Accounts are opened only by the administration: pupils' parents from the
 * pupil list, teachers and staff from their pages — each through
 * `auth.api.signUpEmail` on the server, which never passes through here.
 * The public sign-up endpoint therefore has exactly one legitimate caller:
 * the very first owner, before the school row exists. After that, anyone on
 * the internet could open an account on this domain — with the default role
 * — so the door is shut.
 */
export async function POST(req: NextRequest) {
  if (req.nextUrl.pathname.endsWith('/sign-up/email')) {
    const [existingSchool] = await db.select({ id: schools.id }).from(schools).limit(1)
    if (existingSchool) return NextResponse.json({ error: 'التسجيل مغلق — الحسابات تُنشأ من إدارة المدرسة' }, { status: 403 })
  }
  return handler.POST(req)
}
