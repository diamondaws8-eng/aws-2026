import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { toNextJsHandler } from 'better-auth/next-js'
import { db } from '@/lib/db'
import { schools, user } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

const handler = toNextJsHandler(auth.handler)

export const GET = handler.GET

/**
 * Two doors of better-auth's own are kept shut here.
 *
 * Sign-up. Accounts are opened only by the administration: pupils' parents
 * from the pupil list, teachers and staff from their pages — each through
 * `auth.api.signUpEmail` on the server, which never passes through here.
 * The public sign-up endpoint therefore has exactly one legitimate caller:
 * the very first owner, before the school row exists. After that, anyone on
 * the internet could open an account on this domain — with the default role
 * — so the door is shut.
 *
 * Everything else, for a parent still on the starter password. That password
 * is the same for every family and printed on the sign-in page, so a session
 * opened with it proves nothing yet. The portal makes such a session prove
 * itself with a child's identity number before it may choose a password — but
 * better-auth's own endpoints know nothing of that: `change-password` would
 * replace the starter password with no proof at all (leaving the real family
 * unable to get in with the one the school sent them), `update-user` would
 * rewrite the name the password card greets them with, and `revoke-sessions`
 * would sign them out half-way. Until the account is proven, a session may
 * sign in and sign out here, and nothing more.
 */
export async function POST(req: NextRequest) {
  const path = req.nextUrl.pathname
  if (path.endsWith('/sign-up/email')) {
    const [existingSchool] = await db.select({ id: schools.id }).from(schools).limit(1)
    if (existingSchool) return NextResponse.json({ error: 'التسجيل مغلق — الحسابات تُنشأ من إدارة المدرسة' }, { status: 403 })
  } else if (!path.endsWith('/sign-in/email') && !path.endsWith('/sign-out')) {
    // A question that could not be asked is not a «no»: better-auth reads the
    // session again a moment later and may well succeed where this read
    // failed, so passing the request on would let the very call through that
    // this check exists to stop.
    let locked: boolean
    try {
      const session = await auth.api.getSession({ headers: req.headers })
      locked = false
      if (session?.user && session.user.role === 'parent') {
        const [me] = await db
          .select({ locked: user.mustChangePassword })
          .from(user)
          .where(eq(user.id, session.user.id))
          .limit(1)
        locked = !!me?.locked
      }
    } catch (error) {
      console.error('Auth Gate Error:', error)
      return NextResponse.json({ error: 'تعذّر التحقق من الجلسة — حاول مرة أخرى' }, { status: 503 })
    }
    if (locked) {
      return NextResponse.json({ error: 'اختر كلمة مرور خاصة بك من بوابة ولي الأمر أولاً' }, { status: 403 })
    }
  }
  return handler.POST(req)
}
