import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { user, teachers, students } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getAdminAccess } from '@/lib/admin-access'

export default async function SetupLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/admin/login')

  // Anyone who already belongs to a school (owner or staff) must not create another one.
  const access = await getAdminAccess()
  if (access) redirect('/admin')

  // A teacher or parent who opens the admin portal used to land here and could
  // create a duplicate school by accident — send them to their own portal.
  const [me] = await db.select({ role: user.role }).from(user).where(eq(user.id, session.user.id)).limit(1)
  if (me?.role === 'teacher') redirect('/teacher')
  if (me?.role === 'parent') redirect('/parent')

  // Belt and braces: the role column could be stale, so check the actual records too.
  const [asTeacher] = await db.select({ id: teachers.id }).from(teachers).where(eq(teachers.userId, session.user.id)).limit(1)
  if (asTeacher) redirect('/teacher')
  const [asParent] = await db.select({ id: students.id }).from(students).where(eq(students.parentUserId, session.user.id)).limit(1)
  if (asParent) redirect('/parent')

  return <>{children}</>
}
