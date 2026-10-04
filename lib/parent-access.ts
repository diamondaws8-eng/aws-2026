import { cache } from 'react'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { user, session as sessionTable, students, verification } from '@/lib/db/schema'
import { and, eq, gt, lt, count } from 'drizzle-orm'
import { homePortalFor } from '@/lib/home-portal'
import { asciiDigits } from '@/lib/utils'

/**
 * Who is asking, on the parent portal — and whether they may be answered yet.
 *
 * Deliberately not in a 'use server' file: every export from one of those is a
 * public HTTP endpoint.
 *
 * A new parent account opens with a starter password that is the same for
 * every family and printed on the sign-in page. The portal replaced itself
 * with a "choose your own password" card until that was done — but only in
 * the layout, and a layout does not stop the page beneath it from running.
 * Anybody who knew a parent's mobile number could sign in with the starter
 * password and be sent the child's record under the card. So the lock lives
 * here, where the data is asked for: every reader checks `mustChangePassword`
 * and gives nothing while it is set.
 */
export type ParentAccess = {
  id: string
  name: string
  email: string
  /** Still on the starter password: nothing about any child may be returned. */
  mustChangePassword: boolean
  /** This browser's own session, so the others can be closed without it. */
  sessionToken: string
}

/** The signed-in parent, or null for anybody else. Cached per request. */
export const getParentAccess = cache(async (): Promise<ParentAccess | null> => {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user || session.user.role !== 'parent') return null
  /**
   * Read through the session row itself, not only the user. The session is
   * answered from a signed cookie for five minutes without asking the database
   * (lib/auth.ts), so a session that was just closed — because the family chose
   * its password, or the office reset it — would otherwise go on being let in
   * for those five minutes, which is exactly when closing it matters.
   */
  const [me] = await db
    .select({ mustChange: user.mustChangePassword })
    .from(sessionTable)
    .innerJoin(user, eq(user.id, sessionTable.userId))
    .where(and(eq(sessionTable.token, session.session.token), eq(sessionTable.userId, session.user.id)))
    .limit(1)
  if (!me) return null
  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    mustChangePassword: me.mustChange,
    sessionToken: session.session.token,
  }
})

/**
 * For pages and their readers: sends anybody who is not a signed-in parent to
 * where they belong. The caller must still refuse to return data while
 * `mustChangePassword` is set — the layout shows the password card then, and
 * a redirect from here would only loop back to the same page.
 */
export async function requireParent(): Promise<ParentAccess> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/parent/login')
  if (session.user.role !== 'parent') redirect((await homePortalFor(session.user.id, session.user.role)) ?? '/')
  const access = await getParentAccess()
  if (!access) redirect('/parent/login')
  return access
}

/**
 * For server actions and route handlers: the parent, only once they have a
 * password of their own. Null for everybody else — the caller returns its own
 * "not allowed" answer instead of redirecting.
 */
export async function getUnlockedParent(): Promise<ParentAccess | null> {
  const access = await getParentAccess()
  return access && !access.mustChangePassword ? access : null
}

/**
 * The identity numbers the school holds for this parent's children.
 *
 * The starter password proves nothing — it is the same for every family. What
 * a stranger who only knows a parent's mobile number does not have is the
 * child's identity number, and every family does. So choosing the first
 * password asks for one of these. An account whose children have none on file
 * cannot be proven at all, and is not let through: the office records the
 * number first.
 */
export async function childIdentityNumbers(parentUserId: string): Promise<string[]> {
  const rows = await db
    .select({ nationalId: students.nationalId })
    .from(students)
    .where(eq(students.parentUserId, parentUserId))
  return [...new Set(rows.map((r) => asciiDigits(r.nationalId).replace(/\D/g, '')).filter((v) => v.length >= 5))]
}

/**
 * Guessing has to cost something, or the identity question is only a longer
 * password to try. Each attempt is kept for an hour in better-auth's own
 * `verification` table — it is there already, and nothing else in this system
 * writes to it — and the card stops answering once there are too many.
 *
 * Ten digits at eight tries an hour is out of reach. The price is that a
 * stranger can lock a family out for an hour by guessing badly; the office
 * resetting the account's password clears the count.
 */
export const IDENTITY_TRIES_PER_HOUR = 8
const IDENTITY_WINDOW_MS = 60 * 60 * 1000
const identityTriesKey = (parentUserId: string) => `parent-identity:${parentUserId}`

/**
 * Count this attempt, and say how many there have been this hour — this one
 * included.
 *
 * Written down before the number is compared, not after a wrong one: guesses
 * sent together would otherwise all read «no tries yet» before any of them
 * had been recorded, and one burst would test hundreds. A right answer wipes
 * the count (clearIdentityTries). An attempt past the limit is not kept — it
 * was never compared, and keeping it would let a stranger hold a family locked
 * out for as long as they went on asking.
 */
export async function countIdentityTry(parentUserId: string): Promise<number> {
  const now = new Date()
  const key = identityTriesKey(parentUserId)
  const id = crypto.randomUUID()
  await db.delete(verification).where(and(eq(verification.identifier, key), lt(verification.expiresAt, now)))
  await db.insert(verification).values({
    id,
    identifier: key,
    value: 'try',
    expiresAt: new Date(now.getTime() + IDENTITY_WINDOW_MS),
    createdAt: now,
    updatedAt: now,
  })
  const [row] = await db
    .select({ n: count() })
    .from(verification)
    .where(and(eq(verification.identifier, key), gt(verification.expiresAt, now)))
  const tries = Number(row?.n ?? 0)
  if (tries > IDENTITY_TRIES_PER_HOUR) await db.delete(verification).where(eq(verification.id, id))
  return tries
}

export async function clearIdentityTries(parentUserId: string): Promise<void> {
  await db.delete(verification).where(eq(verification.identifier, identityTriesKey(parentUserId)))
}
