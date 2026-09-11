import { PortalLayout } from '@/components/portal-layout'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { teachers, schools, user } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { TeacherSetPasswordCard } from './set-password-card'
import { homePortalFor } from '@/lib/home-portal'

export default async function TeacherDashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/teacher/login')

  const [teacher] = await db.select().from(teachers).where(eq(teachers.userId, session.user.id)).limit(1)
  // Signed in, but not a teacher: take them to the portal that is theirs
  // rather than back to a login form that has nothing to tell them.
  if (!teacher) redirect((await homePortalFor(session.user.id, session.user.role)) ?? '/teacher/login')

  // While the account still holds the password the administration issued,
  // nothing else in the portal is reachable.
  const [me] = await db
    .select({ mustChange: user.mustChangePassword })
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1)
  if (me?.mustChange) {
    return <TeacherSetPasswordCard teacherName={teacher.fullName} />
  }

  const [school] = await db.select().from(schools).where(eq(schools.id, teacher.schoolId)).limit(1)

  return (
    <PortalLayout role="teacher" user={{ name: session.user.name, email: session.user.email }} schoolName={school?.name}>
      {children}
    </PortalLayout>
  )
}
