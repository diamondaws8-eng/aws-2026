'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { schoolStaff, user, account, session } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
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
  role: 'quality_manager' | 'principal' | 'deputy'
  allGrades: boolean
  gradeLevelIds: string[]
  canEdit: boolean
}

/** Only a deputy can be made read-only; managers always hold edit rights. */
function resolveCanEdit(role: StaffInput['role'], canEdit: boolean) {
  return role === 'deputy' ? canEdit : true
}

const ALLOWED_ROLES = ['quality_manager', 'principal', 'deputy'] as const
const isAllowedRole = (role: string): role is StaffInput['role'] =>
  (ALLOWED_ROLES as readonly string[]).includes(role)

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

  await db.update(user).set({ role: 'admin', updatedAt: new Date() }).where(eq(user.id, createdUser.id))

  await db.insert(schoolStaff).values({
    schoolId: access.school.id,
    userId: createdUser.id,
    fullName: input.fullName.trim(),
    phone: input.phone?.trim() || null,
    role: input.role,
    allGrades: input.allGrades,
    gradeLevelIds: JSON.stringify(input.allGrades ? [] : input.gradeLevelIds),
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

  await db.update(schoolStaff).set({
    fullName: input.fullName.trim(),
    phone: input.phone?.trim() || null,
    role: input.role,
    allGrades: input.allGrades,
    gradeLevelIds: JSON.stringify(input.allGrades ? [] : input.gradeLevelIds),
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

    const [staffUser] = await db.select({ email: user.email }).from(user).where(eq(user.id, staff.userId)).limit(1)

    await logAudit(access, 'staff.passwordReset', staff.fullName)

    revalidatePath('/admin/staff')
    return { ok: true as const, tempPassword, email: staffUser?.email ?? '' }
  } catch (error) {
    console.error('Reset Staff Password Error:', error)
    return { ok: false as const, error: 'حدث خطأ أثناء إعادة تعيين كلمة المرور' }
  }
}
