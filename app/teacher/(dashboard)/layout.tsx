import { PortalLayout } from '@/components/portal-layout'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { teachers, schools } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

export default async function TeacherDashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/teacher/login')

  const [teacher] = await db.select().from(teachers).where(eq(teachers.userId, session.user.id)).limit(1)
  if (!teacher) redirect('/teacher/login')

  const [school] = await db.select().from(schools).where(eq(schools.id, teacher.schoolId)).limit(1)

  return (
    <PortalLayout role="teacher" user={{ name: session.user.name, email: session.user.email }} schoolName={school?.name}>
      {children}
    </PortalLayout>
  )
}
