import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { students, user } from '@/lib/db/schema'
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

  // Get school name from first linked student
  const [firstStudent] = await db
    .select()
    .from(students)
    .where(eq(students.parentUserId, session.user.id))
    .limit(1)

  // We don't have a direct school name lookup here without joining,
  // but we can pass a fallback
  const schoolName = 'مدارس الأوس الأهلية - متابعة الطالب'

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
