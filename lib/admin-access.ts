import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { schools, schoolStaff } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache } from 'react'

// ─── Admin-portal roles ───────────────────────────────────────────────────────
// owner            → schools.adminId (never stored in school_staff, never deletable)
// quality_manager  → sees the whole school, controls all grades or only assigned ones
// principal        → runs the grades assigned to him, with full control over them
// deputy           → scoped to assigned grades, may be read-only
export type AdminRole = 'owner' | 'quality_manager' | 'principal' | 'deputy'

export const ROLE_LABELS: Record<AdminRole, string> = {
  owner: 'المالك والمدير التنفيذي',
  quality_manager: 'مدير الجودة',
  principal: 'مدير مدرسة',
  deputy: 'وكيل',
}

/** Roles kept in school_staff that do not grant the admin portal. */
export const NON_ADMIN_STAFF_LABELS: Record<string, string> = {
  counselor: 'موجه طلابي',
}

/** Roles that can be created from the staff page (the owner is not one of them). */
export const STAFF_ROLES = ['quality_manager', 'principal', 'deputy', 'counselor'] as const
export type StaffRole = (typeof STAFF_ROLES)[number]

export type School = typeof schools.$inferSelect

export type AdminAccess = {
  userId: string
  name: string
  email: string
  school: School
  role: AdminRole
  roleLabel: string
  staffId: string | null

  /** Grades this user is allowed to see. */
  viewAllGrades: boolean
  /** Grades this user is allowed to change. */
  editAllGrades: boolean
  /** Assigned grade level ids (meaningful only when the matching "all" flag is false). */
  gradeIds: string[]
  /** false = read-only account. */
  canEdit: boolean

  canManageStaff: boolean
  canManageTeachers: boolean
  canManageSchoolSettings: boolean
  /** May download a backup at all. */
  canBackup: boolean
  /** true = the backup covers the whole school, false = only the assigned grades. */
  backupAllGrades: boolean
  /** Restoring replaces everything, so it stays with the owner. */
  canRestore: boolean
}

function parseGradeIds(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

/**
 * Cached per request: the layout, the page and any server action in the same
 * render share one session + school lookup instead of repeating it each time.
 */
export const getAdminAccess = cache(async (): Promise<AdminAccess | null> => {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return null

  const base = { userId: session.user.id, name: session.user.name, email: session.user.email }

  // 1) Owner — the account the school was created with
  const [ownedSchool] = await db.select().from(schools).where(eq(schools.adminId, session.user.id)).limit(1)
  if (ownedSchool) {
    return {
      ...base,
      school: ownedSchool,
      role: 'owner',
      roleLabel: ROLE_LABELS.owner,
      staffId: null,
      viewAllGrades: true,
      editAllGrades: true,
      gradeIds: [],
      canEdit: true,
      canManageStaff: true,
      canManageTeachers: true,
      canManageSchoolSettings: true,
      canBackup: true,
      backupAllGrades: true,
      canRestore: true,
    }
  }

  // 2) Staff — quality manager, principal or deputy
  const [staff] = await db.select().from(schoolStaff).where(eq(schoolStaff.userId, session.user.id)).limit(1)
  if (!staff) return null

  // The counsellor sits in the same staff table but is not an administrator:
  // they work from /counselor and hold none of the powers below.
  if (staff.role === 'counselor') return null

  const [school] = await db.select().from(schools).where(eq(schools.id, staff.schoolId)).limit(1)
  if (!school) return null


  const role: AdminRole =
    staff.role === 'quality_manager' ? 'quality_manager'
    : staff.role === 'principal' ? 'principal'
    : 'deputy'
  const gradeIds = parseGradeIds(staff.gradeLevelIds)
  const isQualityManager = role === 'quality_manager'
  const isPrincipal = role === 'principal'
  // Managers always hold edit rights; only a deputy can be made read-only.
  const canEdit = isQualityManager || isPrincipal ? true : staff.canEdit

  return {
    ...base,
    school,
    role,
    roleLabel: ROLE_LABELS[role],
    staffId: staff.id,
    // A quality manager always sees the whole school; a principal and a deputy
    // only the grades assigned to them.
    viewAllGrades: isQualityManager ? true : staff.allGrades,
    editAllGrades: staff.allGrades && canEdit,
    gradeIds,
    canEdit,
    canManageStaff: isQualityManager,
    canManageTeachers: isQualityManager,
    canManageSchoolSettings: isQualityManager,
    // Quality managers back up the whole school; principals back up their grades.
    canBackup: isQualityManager || isPrincipal,
    backupAllGrades: isQualityManager || staff.allGrades,
    canRestore: false, // owner only — restoring replaces the whole school
  }
})

/** Same as getAdminAccess but redirects instead of returning null. */
export async function requireAdminAccess(): Promise<AdminAccess> {
  const access = await getAdminAccess()
  if (access) return access

  // Not attached to any school — decide where to send them.
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/admin/login')

  // A counsellor who lands here has a portal of their own; sending them to the
  // first-time setup screen instead would be nonsense.
  const [staff] = await db
    .select({ role: schoolStaff.role })
    .from(schoolStaff)
    .where(eq(schoolStaff.userId, session.user.id))
    .limit(1)
  if (staff?.role === 'counselor') redirect('/counselor')

  redirect('/admin/setup')
}

export function canViewGrade(access: AdminAccess, gradeId: string | null): boolean {
  if (access.viewAllGrades) return true
  if (!gradeId) return false
  return access.gradeIds.includes(gradeId)
}

export function canEditGrade(access: AdminAccess, gradeId: string | null): boolean {
  if (!access.canEdit) return false
  if (access.editAllGrades) return true
  if (!gradeId) return false
  return access.gradeIds.includes(gradeId)
}
