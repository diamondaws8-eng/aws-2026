import { db } from '@/lib/db'
import { classes, gradeLevels } from '@/lib/db/schema'
import { and, eq, inArray } from 'drizzle-orm'

/**
 * What the sheet covers: the reader's permitted stages, narrowed — never
 * widened — by the stages and classes they picked on the page.
 *
 * The ids arrive in the URL, where anyone can type anything, so every one is
 * intersected with what the reader may see before it is used. A deputy who
 * pastes another stage's id gets their own stages back, not that one's.
 */
export type ScopeOption = { id: string; name: string }
export type ClassOption = ScopeOption & { gradeId: string }

export type AbsenceScope = {
  /** Class ids to query, or null for the whole school. */
  classIds: string[] | null
  /** What the reader may pick from. */
  stages: ScopeOption[]
  classes: ClassOption[]
  selectedStages: string[]
  selectedClasses: string[]
  /** «جميع المراحل», the stage names, or the class names — whatever was actually chosen. */
  scopeLabel: string
  /** Query to carry along when the date changes. */
  keepQuery: Record<string, string[]>
}

const list = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v : v ? [v] : []).flatMap((x) => x.split(',')).map((x) => x.trim()).filter(Boolean)

export async function resolveAbsenceScope(input: {
  schoolId: string
  /** Stage ids the reader may see, or null for all. */
  permittedGradeIds: string[] | null
  params: { stage?: string | string[]; class?: string | string[] }
}): Promise<AbsenceScope> {
  const { schoolId, permittedGradeIds, params } = input
  const empty: AbsenceScope = { classIds: [], stages: [], classes: [], selectedStages: [], selectedClasses: [], scopeLabel: 'المراحل المسندة إليك', keepQuery: {} }
  if (permittedGradeIds && permittedGradeIds.length === 0) return empty

  const [gradeRows, classRows] = await Promise.all([
    db.select({ id: gradeLevels.id, name: gradeLevels.name, order: gradeLevels.orderIndex })
      .from(gradeLevels)
      .where(and(eq(gradeLevels.schoolId, schoolId), permittedGradeIds ? inArray(gradeLevels.id, permittedGradeIds) : undefined)),
    db.select({ id: classes.id, name: classes.name, gradeId: classes.gradeLevelId })
      .from(classes)
      .where(and(eq(classes.schoolId, schoolId), permittedGradeIds ? inArray(classes.gradeLevelId, permittedGradeIds) : undefined)),
  ])
  const collator = new Intl.Collator('ar')
  const stages = gradeRows.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || collator.compare(a.name, b.name)).map(({ id, name }) => ({ id, name }))
  const allClasses = classRows.sort((a, b) => collator.compare(a.name, b.name))

  const stageIds = new Set(stages.map((s) => s.id))
  const selectedStages = list(params.stage).filter((id) => stageIds.has(id))
  const inStages = selectedStages.length ? allClasses.filter((c) => selectedStages.includes(c.gradeId)) : allClasses
  const classIdsIn = new Set(inStages.map((c) => c.id))
  const selectedClasses = list(params.class).filter((id) => classIdsIn.has(id))

  const chosen = selectedClasses.length ? inStages.filter((c) => selectedClasses.includes(c.id)) : inStages
  const classIds = selectedStages.length || selectedClasses.length || permittedGradeIds ? chosen.map((c) => c.id) : null

  const gradeName = new Map(stages.map((s) => [s.id, s.name]))
  const scopeLabel = selectedClasses.length
    ? `فصل ${chosen.map((c) => c.name).join('، ')}`
    : selectedStages.length
      ? selectedStages.map((id) => gradeName.get(id) ?? '').filter(Boolean).join('، ')
      : permittedGradeIds
        ? stages.map((s) => s.name).join('، ')
        : 'جميع المراحل'

  const keepQuery: Record<string, string[]> = {}
  if (selectedStages.length) keepQuery.stage = selectedStages
  if (selectedClasses.length) keepQuery.class = selectedClasses

  return { classIds, stages, classes: allClasses, selectedStages, selectedClasses, scopeLabel, keepQuery }
}
