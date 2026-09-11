import { db } from '@/lib/db'
import { schools, schoolStaff, teachers } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

/**
 * Where a signed-in account belongs.
 *
 * A teacher who types their password into the counsellor's login form is
 * signed in — the credentials are real — and then bounced by the counsellor
 * layout back to the same login form, with nothing to say why. Sending them
 * to their own portal instead answers the question they actually had.
 * Null means the account belongs nowhere yet (a fresh owner before setup).
 */
export async function homePortalFor(userId: string, role: string | null | undefined): Promise<string | null> {
  if (role === 'parent') return '/parent'
  const [[teacher], [owned], [staff]] = await Promise.all([
    db.select({ id: teachers.id }).from(teachers).where(eq(teachers.userId, userId)).limit(1),
    db.select({ id: schools.id }).from(schools).where(eq(schools.adminId, userId)).limit(1),
    db.select({ role: schoolStaff.role }).from(schoolStaff).where(eq(schoolStaff.userId, userId)).limit(1),
  ])
  if (teacher) return '/teacher'
  if (owned) return '/admin'
  if (staff) return staff.role === 'counselor' ? '/counselor' : '/admin'
  return null
}
