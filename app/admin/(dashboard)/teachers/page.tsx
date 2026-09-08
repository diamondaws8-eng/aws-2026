import { db } from '@/lib/db'
import { teachers } from '@/lib/db/schema'
import { eq, asc } from 'drizzle-orm'
import TeachersClient from './teachers-client'
import { requireAdminAccess } from '@/lib/admin-access'

export const dynamic = 'force-dynamic'

export default async function TeachersPage() {
  const access = await requireAdminAccess()
  const school = access.school

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

      <TeachersClient teachers={teachersList} schoolId={school.id} canManage={access.canManageTeachers} />
    </div>
  )
}
