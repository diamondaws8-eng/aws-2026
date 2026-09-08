import { db } from '@/lib/db'
import { schoolStaff, gradeLevels, user } from '@/lib/db/schema'
import { eq, asc } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { requireAdminAccess, ROLE_LABELS } from '@/lib/admin-access'
import StaffClient from './staff-client'

export const dynamic = 'force-dynamic'

export default async function StaffPage() {
  const access = await requireAdminAccess()
  if (!access.canManageStaff) redirect('/admin')

  const rows = await db
    .select({
      id: schoolStaff.id,
      userId: schoolStaff.userId,
      fullName: schoolStaff.fullName,
      phone: schoolStaff.phone,
      role: schoolStaff.role,
      allGrades: schoolStaff.allGrades,
      gradeLevelIds: schoolStaff.gradeLevelIds,
      canEdit: schoolStaff.canEdit,
      tempPassword: schoolStaff.tempPassword,
      email: user.email,
    })
    .from(schoolStaff)
    .leftJoin(user, eq(schoolStaff.userId, user.id))
    .where(eq(schoolStaff.schoolId, access.school.id))
    .orderBy(asc(schoolStaff.fullName))

  const grades = await db
    .select({ id: gradeLevels.id, name: gradeLevels.name })
    .from(gradeLevels)
    .where(eq(gradeLevels.schoolId, access.school.id))
    .orderBy(asc(gradeLevels.orderIndex))

  // The owner is shown at the top of the list and can never be removed here.
  const [owner] = await db
    .select({ name: user.name, email: user.email })
    .from(user)
    .where(eq(user.id, access.school.adminId))
    .limit(1)

  const staffList = rows.map((r) => ({
    ...r,
    gradeIds: (() => {
      try {
        const parsed = JSON.parse(r.gradeLevelIds ?? '[]')
        return Array.isArray(parsed) ? (parsed as string[]) : []
      } catch {
        return [] as string[]
      }
    })(),
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">فريق الإدارة</h1>
        <p className="text-muted-foreground mt-1">
          إدارة حسابات مديري الجودة والوكلاء وصلاحياتهم على المراحل الدراسية
        </p>
      </div>

      <StaffClient
        staff={staffList}
        grades={grades}
        ownerName={owner?.name ?? 'المالك'}
        ownerEmail={owner?.email ?? ''}
        ownerLabel={ROLE_LABELS.owner}
        currentUserId={access.userId}
      />
    </div>
  )
}
