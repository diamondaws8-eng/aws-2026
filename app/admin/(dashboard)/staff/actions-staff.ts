'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { schoolStaff, user, account, session, gradeLevels } from '@/lib/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { hashPassword } from 'better-auth/crypto'
import { getAdminAccess } from '@/lib/admin-access'
import { logAudit } from '@/lib/audit'

function generateTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export type StaffInput = {
  fullName: string
  email: string
  phone?: string
  role: 'quality_manager' | 'principal' | 'deputy' | 'counselor'
  allGrades: boolean
  gradeLevelIds: string[]
  canEdit: boolean
}

/**
 * Only a deputy can be made read-only; managers always hold edit rights. The
 * counsellor's authority is of a different kind entirely — it lives in
 * lib/counselor-access.ts — so this flag means nothing for them.
 */
function resolveCanEdit(role: StaffInput['role'], canEdit: boolean) {
  return role === 'deputy' ? canEdit : true
}

const ALLOWED_ROLES = ['quality_manager', 'principal', 'deputy', 'counselor'] as const
const isAllowedRole = (role: string): role is StaffInput['role'] =>
  (ALLOWED_ROLES as readonly string[]).includes(role)

/**
 * Grade ids arrive from the browser. A foreign one is not a way in — every
 * query is filtered by school as well — but it would leave a deputy staring at
 * empty pages with nothing to explain why, so it is rejected here.
 */
async function scopedGradeIds(schoolId: string, ids: string[]): Promise<string[] | null> {
  const wanted = [...new Set((ids ?? []).filter((id) => typeof id === 'string' && id))]
  if (wanted.length === 0) return []
  const rows = await db
    .select({ id: gradeLevels.id })
    .from(gradeLevels)
    .where(and(eq(gradeLevels.schoolId, schoolId), inArray(gradeLevels.id, wanted)))
  return rows.length === wanted.length ? wanted : null
}

/** Only the owner and quality managers may manage the admin team. */
async function requireStaffManager() {
  const access = await getAdminAccess()
  if (!access || !access.canManageStaff) return null
  return access
}

// ── Add a staff member (quality manager / deputy) ─────────────────────────────
export async function addStaff(input: StaffInput) {
  const access = await requireStaffManager()
  if (!access) return { ok: false as const, error: 'غير مصرح بهذا الإجراء' }

  const email = input.email.trim().toLowerCase()
  if (!email || !input.fullName.trim()) {
    return { ok: false as const, error: 'الاسم والبريد الإلكتروني مطلوبان' }
  }
  if (!isAllowedRole(input.role)) {
    return { ok: false as const, error: 'الدور المحدد غير صالح' }
  }

  const [existing] = await db.select().from(user).where(eq(user.email, email)).limit(1)
  if (existing) return { ok: false as const, error: 'هذا البريد الإلكتروني مستخدم بالفعل' }

  const verifiedGrades = input.allGrades ? [] : await scopedGradeIds(access.school.id, input.gradeLevelIds)
  if (verifiedGrades === null) {
    return { ok: false as const, error: 'إحدى المراحل المحددة ليست من مراحل هذه المدرسة' }
  }

  const tempPassword = generateTempPassword()

  try {
    await auth.api.signUpEmail({
      body: { email, password: tempPassword, name: input.fullName.trim() },
    })
  } catch (error) {
    console.error('addStaff signUpEmail Error:', error)
    return { ok: false as const, error: 'تعذّر إنشاء الحساب — تأكد من صحة البريد الإلكتروني' }
  }

  const [createdUser] = await db.select().from(user).where(eq(user.email, email)).limit(1)
  if (!createdUser) return { ok: false as const, error: 'تعذّر إنشاء الحساب' }

  // Handed over by another administrator, so the portal stays shut until this
  // account picks its own — the same rule teachers and parents already follow,
  // and this account carries more authority than either.
  await db.update(user)
    .set({ role: 'admin', mustChangePassword: true, updatedAt: new Date() })
    .where(eq(user.id, createdUser.id))

  await db.insert(schoolStaff).values({
    schoolId: access.school.id,
    userId: createdUser.id,
    fullName: input.fullName.trim(),
    phone: input.phone?.trim() || null,
    role: input.role,
    allGrades: input.allGrades,
    gradeLevelIds: JSON.stringify(input.allGrades ? [] : verifiedGrades),
    canEdit: resolveCanEdit(input.role, input.canEdit),
    // Password is shown once below and never stored in plaintext.
  })

  await logAudit(access, 'staff.create', input.fullName.trim(), { email, role: input.role })

  revalidatePath('/admin/staff')
  return { ok: true as const, email, tempPassword }
}

// ── Edit a staff member's details and scope ───────────────────────────────────
export async function editStaff(staffId: string, input: Omit<StaffInput, 'email'>) {
  const access = await requireStaffManager()
  if (!access) return { ok: false as const, error: 'غير مصرح بهذا الإجراء' }

  if (!isAllowedRole(input.role)) {
    return { ok: false as const, error: 'الدور المحدد غير صالح' }
  }

  const [staff] = await db.select().from(schoolStaff).where(eq(schoolStaff.id, staffId)).limit(1)
  if (!staff || staff.schoolId !== access.school.id) {
    return { ok: false as const, error: 'غير مصرح بالوصول لهذا الحساب' }
  }

  const verifiedGrades = input.allGrades ? [] : await scopedGradeIds(access.school.id, input.gradeLevelIds)
  if (verifiedGrades === null) {
    return { ok: false as const, error: 'إحدى المراحل المحددة ليست من مراحل هذه المدرسة' }
  }

  await db.update(schoolStaff).set({
    fullName: input.fullName.trim(),
    phone: input.phone?.trim() || null,
    role: input.role,
    allGrades: input.allGrades,
    gradeLevelIds: JSON.stringify(input.allGrades ? [] : verifiedGrades),
    canEdit: resolveCanEdit(input.role, input.canEdit),
  }).where(eq(schoolStaff.id, staffId))

  await db.update(user).set({ name: input.fullName.trim(), updatedAt: new Date() }).where(eq(user.id, staff.userId))

  await logAudit(access, 'staff.update', input.fullName.trim(), { role: input.role, allGrades: input.allGrades })

  revalidatePath('/admin/staff')
  return { ok: true as const }
}

// ── Delete a staff member ─────────────────────────────────────────────────────
// The owner is never in this table, so the owner can never be deleted here.
export async function deleteStaff(staffId: string) {
  const access = await requireStaffManager()
  if (!access) return { ok: false as const, error: 'غير مصرح بهذا الإجراء' }

  const [staff] = await db.select().from(schoolStaff).where(eq(schoolStaff.id, staffId)).limit(1)
  if (!staff || staff.schoolId !== access.school.id) {
    return { ok: false as const, error: 'غير مصرح بالوصول لهذا الحساب' }
  }
  if (staff.userId === access.userId) {
    return { ok: false as const, error: 'لا يمكنك حذف حسابك الخاص' }
  }

  await db.transaction(async (tx) => {
    await tx.delete(schoolStaff).where(eq(schoolStaff.id, staffId))
    await tx.delete(account).where(eq(account.userId, staff.userId))
    await tx.delete(session).where(eq(session.userId, staff.userId))
    await tx.delete(user).where(eq(user.id, staff.userId))
  })

  await logAudit(access, 'staff.delete', staff.fullName, { role: staff.role })

  revalidatePath('/admin/staff')
  return { ok: true as const }
}

// ── Reset a staff member's password ───────────────────────────────────────────
export async function resetStaffPassword(staffId: string) {
  const access = await requireStaffManager()
  if (!access) return { ok: false as const, error: 'غير مصرح بهذا الإجراء' }

  const [staff] = await db.select().from(schoolStaff).where(eq(schoolStaff.id, staffId)).limit(1)
  if (!staff || staff.schoolId !== access.school.id) {
    return { ok: false as const, error: 'غير مصرح بالوصول لهذا الحساب' }
  }

  try {
    const tempPassword = generateTempPassword()
    const hashed = await hashPassword(tempPassword)

    await db.update(account).set({ password: hashed, updatedAt: new Date() })
      .where(and(eq(account.userId, staff.userId), eq(account.providerId, 'credential')))

    await db.update(user)
      .set({ mustChangePassword: true, updatedAt: new Date() })
      .where(eq(user.id, staff.userId))

    const [staffUser] = await db.select({ email: user.email }).from(user).where(eq(user.id, staff.userId)).limit(1)

    await logAudit(access, 'staff.passwordReset', staff.fullName)

    revalidatePath('/admin/staff')
    return { ok: true as const, tempPassword, email: staffUser?.email ?? '' }
  } catch (error) {
    console.error('Reset Staff Password Error:', error)
    return { ok: false as const, error: 'حدث خطأ أثناء إعادة تعيين كلمة المرور' }
  }
}
