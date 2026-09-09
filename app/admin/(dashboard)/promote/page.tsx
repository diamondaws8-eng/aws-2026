import { db } from '@/lib/db'
import { students, classes, gradeLevels } from '@/lib/db/schema'
import { eq, and, asc, desc } from 'drizzle-orm'
import { requireAdminAccess, canViewGrade, canEditGrade } from '@/lib/admin-access'
import { PromoteClient } from './promote-client'

export const dynamic = 'force-dynamic'

export default async function PromotePage() {
  const access = await requireAdminAccess()
  const schoolId = access.school.id

  const [classRows, studentRows, graduatedRows] = await Promise.all([
    db
      .select({
        id: classes.id,
        name: classes.name,
        gradeLevelId: classes.gradeLevelId,
        gradeName: gradeLevels.name,
        gradeOrder: gradeLevels.orderIndex,
        promotesToClassId: classes.promotesToClassId,
        isTerminal: classes.isTerminal,
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
      .where(and(eq(students.schoolId, schoolId), eq(students.status, 'active')))
      .orderBy(asc(students.fullName)),

    // Those who have already left, newest first — the record the school keeps
    // instead of deleting them.
    db
      .select({
        id: students.id,
        fullName: students.fullName,
        graduationYear: students.graduationYear,
        graduatedAt: students.graduatedAt,
      })
      .from(students)
      .where(and(eq(students.schoolId, schoolId), eq(students.status, 'graduated')))
      .orderBy(desc(students.graduatedAt))
      .limit(200),
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
      promotesToClassId: c.promotesToClassId,
      isTerminal: c.isTerminal,
    }))

  const visibleIds = new Set(visibleClasses.map((c) => c.id))
  const roster = studentRows
    .filter((s) => s.classId && visibleIds.has(s.classId))
    .map((s) => ({ id: s.id, fullName: s.fullName, classId: s.classId! }))

  // The map is school-wide, so the editor needs every class by name — a target
  // in another stage is exactly the case it exists for.
  const allClassLabels = classRows.map((c) => ({
    id: c.id,
    label: `${c.gradeName ?? 'بلا مرحلة'} — ${c.name}`,
  }))

  return (
    <PromoteClient
      classes={visibleClasses}
      students={roster}
      canEdit={access.canEdit}
      canRunAnnual={access.editAllGrades}
      allClassLabels={allClassLabels}
      studentsPerClass={Object.fromEntries(
        classRows.map((c) => [c.id, studentRows.filter((s) => s.classId === c.id).length]),
      )}
      graduated={graduatedRows.map((g) => ({
        id: g.id,
        fullName: g.fullName,
        graduationYear: g.graduationYear,
        graduatedAt: g.graduatedAt ? g.graduatedAt.toISOString() : null,
      }))}
      unassignedCount={studentRows.filter((s) => !s.classId).length}
    />
  )
}
