import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { students, user, schools } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { PortalLayout } from '@/components/portal-layout'
import { SetPasswordCard } from './set-password-card'

export default async function ParentDashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/parent/login')

  // While the account still has the shared starter password, nothing else is
  // reachable — the parent must pick their own password first.
  const [me] = await db
    .select({ mustChange: user.mustChangePassword })
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1)
  if (me?.mustChange) {
    return <SetPasswordCard parentName={session.user.name} />
  }

  // The school's real name, through the first linked child. It used to be a
  // hard-coded string — right until the day the school is renamed or a second
  // one exists, and then wrong on every parent's screen.
  const [row] = await db
    .select({ schoolName: schools.name })
    .from(students)
    .innerJoin(schools, eq(schools.id, students.schoolId))
    .where(eq(students.parentUserId, session.user.id))
    .limit(1)
  const schoolName = row?.schoolName ?? 'بوابة ولي الأمر'

  return (
    <PortalLayout
      role="parent"
      user={{ name: session.user.name, email: session.user.email }}
      schoolName={schoolName}
    >
      {children}
    </PortalLayout>
  )
}
