import { db } from '@/lib/db'
import { students, classes, gradeLevels } from '@/lib/db/schema'
import { eq, asc } from 'drizzle-orm'
import { requireAdminAccess, canViewGrade, canEditGrade } from '@/lib/admin-access'
import { PromoteClient } from './promote-client'

export const dynamic = 'force-dynamic'

export default async function PromotePage() {
  const access = await requireAdminAccess()
  const schoolId = access.school.id

  const [classRows, studentRows] = await Promise.all([
    db
      .select({
        id: classes.id,
        name: classes.name,
        gradeLevelId: classes.gradeLevelId,
        gradeName: gradeLevels.name,
        gradeOrder: gradeLevels.orderIndex,
      })
      .from(classes)
      .leftJoin(gradeLevels, eq(gradeLevels.id, classes.gradeLevelId))
      .where(eq(classes.schoolId, schoolId))
      .orderBy(asc(gradeLevels.orderIndex), asc(classes.name)),

    db
      .select({
        id: students.id,
        fullName: students.fullName,
        classId: students.classId,
      })
      .from(students)
      .where(eq(students.schoolId, schoolId))
      .orderBy(asc(students.fullName)),
  ])

  // A deputy sees and moves only their own stages, on both ends of the move.
  const visibleClasses = classRows
    .filter((c) => canViewGrade(access, c.gradeLevelId))
    .map((c) => ({
      id: c.id,
      name: c.name,
      gradeName: c.gradeName ?? 'بلا مرحلة',
      gradeOrder: c.gradeOrder ?? 0,
      canEdit: canEditGrade(access, c.gradeLevelId),
    }))

  const visibleIds = new Set(visibleClasses.map((c) => c.id))
  const roster = studentRows
    .filter((s) => s.classId && visibleIds.has(s.classId))
    .map((s) => ({ id: s.id, fullName: s.fullName, classId: s.classId! }))

  return (
    <PromoteClient
      classes={visibleClasses}
      students={roster}
      canEdit={access.canEdit}
      unassignedCount={studentRows.filter((s) => !s.classId).length}
    />
  )
}
