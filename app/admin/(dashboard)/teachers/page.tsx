import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { schools, teachers } from '@/lib/db/schema'
import { eq, asc } from 'drizzle-orm'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import TeachersClient from './teachers-client'

export const dynamic = 'force-dynamic'

export default async function TeachersPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/admin/login')
  
  const [school] = await db.select().from(schools).where(eq(schools.adminId, session.user.id)).limit(1)
  if (!school) redirect('/admin/setup')

  const teachersList = await db
    .select()
    .from(teachers)
    .where(eq(teachers.schoolId, school.id))
    .orderBy(asc(teachers.fullName))

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground">المعلمون</h1>
          <p className="text-muted-foreground mt-1">إدارة حسابات المعلمين</p>
        </div>
      </div>

      <TeachersClient teachers={teachersList} schoolId={school.id} />
    </div>
  )
}
