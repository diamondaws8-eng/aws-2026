import { requireCounselor, getCounselorClassIds, staffCoveringGrade } from '@/lib/counselor-access'
import { db } from '@/lib/db'
import { schoolStaff, gradeLevels, students } from '@/lib/db/schema'
import { eq, and, inArray, sql } from 'drizzle-orm'
import { parseTemplates, parseCasePrefs } from '@/lib/counselor-settings'
import { parentActivation } from '@/lib/notifications'
import { CounselorSettingsClient } from './settings-client'

export const dynamic = 'force-dynamic'

export default async function CounselorSettingsPage() {
  const access = await requireCounselor()

  const [me] = await db
    .select({
      phone: schoolStaff.phone,
      templates: schoolStaff.whatsappTemplates,
      prefs: schoolStaff.casePrefs,
    })
    .from(schoolStaff)
    .where(eq(schoolStaff.id, access.staffId))
    .limit(1)

  // The stages this person answers for, named — an id in a settings screen
  // tells nobody anything.
  const grades = access.allGrades
    ? await db
        .select({ id: gradeLevels.id, name: gradeLevels.name })
        .from(gradeLevels)
        .where(eq(gradeLevels.schoolId, access.schoolId))
        .orderBy(gradeLevels.orderIndex)
    : access.gradeIds.length
      ? await db
          .select({ id: gradeLevels.id, name: gradeLevels.name })
          .from(gradeLevels)
          .where(and(eq(gradeLevels.schoolId, access.schoolId), inArray(gradeLevels.id, access.gradeIds)))
          .orderBy(gradeLevels.orderIndex)
      : []

  const classIds = await getCounselorClassIds(access)

  const [studentCountRows, activation, coverage] = await Promise.all([
    classIds.length
      ? db
          .select({ n: sql<number>`COUNT(*)`.mapWith(Number) })
          .from(students)
          .where(inArray(students.classId, classIds))
      : Promise.resolve([{ n: 0 }]),
    parentActivation(access.schoolId),
    // Shown before it is needed on purpose: a stage with nobody to escalate to
    // is discovered today, in a settings screen, and not in the middle of a
    // case that then has nowhere to go.
    Promise.all(
      grades.map(async (g) => ({
        gradeId: g.id,
        gradeName: g.name,
        targets: await staffCoveringGrade(access.schoolId, g.id),
      })),
    ),
  ])

  return (
    <CounselorSettingsClient
      name={access.name}
      schoolName={access.schoolName}
      allGrades={access.allGrades}
      gradeNames={grades.map((g) => g.name)}
      classCount={classIds.length}
      studentCount={studentCountRows[0]?.n ?? 0}
      coverage={coverage}
      parentActivation={activation}
      initialPhone={me?.phone ?? ''}
      initialTemplates={parseTemplates(me?.templates)}
      initialPrefs={parseCasePrefs(me?.prefs)}
    />
  )
}
