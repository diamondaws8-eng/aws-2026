'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { teachers, user, schools, account, session, subjects, dailyRecords, gradeLevels, classes, userNotifications } from '@/lib/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { hashPassword } from 'better-auth/crypto'
import { getAdminAccess } from '@/lib/admin-access'
import { logAudit } from '@/lib/audit'

/** Teacher accounts are school-wide, so only the owner and quality managers manage them. */
async function requireTeacherManager() {
  const access = await getAdminAccess()
  if (!access || !access.canManageTeachers) return null
  return access
}

function generateTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

/**
 * Adding a teacher now says, in one step, three things that used to be set in
 * three different places (or never): which stages they belong to, what they
 * teach, and in which classes. Leaving those to a second visit is how nineteen
 * teachers ended up with no subject at all — and a class with no assigned
 * subject stays open to every teacher in the school.
 *
 * More than one teacher may hold the same subject: subjects are stored per
 * class, so "رياضيات" in 5\1 and "رياضيات" in 5\2 are separate rows with
 * separate teachers, and even the same class may carry the subject twice when
 * two teachers share it.
 */
export async function addTeacher(input: {
  fullName: string
  phone: string
  allGrades?: boolean
  gradeLevelIds?: string[]
  subjectName?: string
  classIds?: string[]
}) {
  const access = await requireTeacherManager()
  if (!access) return { ok: false as const, error: 'غير مصرح لك بهذا الإجراء' }
  const school = access.school

  const fullName = String(input.fullName ?? '').trim().slice(0, 120)
  const phoneDigits = String(input.phone ?? '').replace(/\D/g, '')
  if (!fullName) return { ok: false as const, error: 'اسم المعلم مطلوب' }
  if (phoneDigits.length < 9) return { ok: false as const, error: 'رقم الجوال غير صالح' }

  const email = `${phoneDigits}@teacher.midad.local`

  // The number is the login, so a repeat would collide inside better-auth and
  // surface as a blank error the admin could not act on.
  const [taken] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1)
  if (taken) return { ok: false as const, error: 'رقم الجوال مستخدم بحساب آخر — اختر رقماً غيره' }

  const tempPassword = generateTempPassword()

  try {
    await auth.api.signUpEmail({
      body: { email, password: tempPassword, name: fullName }
    })
  } catch (error) {
    console.error('Add Teacher signUp Error:', error)
    return { ok: false as const, error: 'تعذّر إنشاء حساب الدخول لهذا المعلم' }
  }
  
  // The starter password is handed over on paper, so the portal stays closed
  // until the teacher replaces it with one only they know.
  await db.update(user)
    .set({ role: 'teacher', mustChangePassword: true, updatedAt: new Date() })
    .where(eq(user.email, email))
  
  const [createdUser] = await db.select().from(user).where(eq(user.email, email)).limit(1)
  
  // The password is returned once for the admin to hand over — never stored in
  // plaintext. If it is lost, use "إعادة تعيين كلمة المرور".
  // Stage ids arrive from the browser, so only ones that belong to this school
  // are kept — a foreign id would silently widen the ceiling it is meant to set.
  const allGrades = input.allGrades !== false && (input.gradeLevelIds ?? []).length === 0
  const gradeIds = allGrades ? [] : await verifiedGradeIds(school.id, input.gradeLevelIds ?? [])
  if (!allGrades && gradeIds.length === 0) {
    return { ok: false as const, error: 'اختر مرحلة واحدة على الأقل، أو اختر «كل المراحل»' }
  }

  await db.insert(teachers).values({
    schoolId: school.id,
    userId: createdUser.id,
    fullName,
    phone: input.phone,
    allGrades,
    gradeLevelIds: JSON.stringify(gradeIds),
  })

  // The subject, in the classes chosen — this is what actually decides which
  // classes the teacher sees, and closes those classes to everybody else.
  const subjectName = String(input.subjectName ?? '').trim().slice(0, 80)
  let subjectsCreated = 0
  if (subjectName && (input.classIds ?? []).length > 0) {
    const allowed = await classesInGrades(school.id, allGrades ? null : gradeIds, input.classIds ?? [])
    if (allowed.length > 0) {
      await db.insert(subjects).values(
        allowed.map((classId) => ({
          schoolId: school.id,
          classId,
          name: subjectName,
          teacherUserId: createdUser.id,
        })),
      )
      subjectsCreated = allowed.length
    }
  }

  await logAudit(access, 'teacher.create', fullName, {
    email,
    allGrades,
    grades: gradeIds.length,
    subject: subjectName || null,
    classes: subjectsCreated,
  })

  revalidatePath('/admin/teachers')
  revalidatePath('/admin/grade-levels')
  return { ok: true as const, email, tempPassword, subjectsCreated }
}

/** Only stage ids that really belong to this school. */
async function verifiedGradeIds(schoolId: string, ids: string[]): Promise<string[]> {
  const wanted = [...new Set(ids.filter((v) => typeof v === 'string' && v))]
  if (wanted.length === 0) return []
  const rows = await db
    .select({ id: gradeLevels.id })
    .from(gradeLevels)
    .where(and(eq(gradeLevels.schoolId, schoolId), inArray(gradeLevels.id, wanted)))
  return rows.map((r) => r.id)
}

/** Only classes in this school, and inside the ceiling just set for the teacher. */
async function classesInGrades(
  schoolId: string,
  gradeIds: string[] | null,
  classIds: string[],
): Promise<string[]> {
  const wanted = [...new Set(classIds.filter((v) => typeof v === 'string' && v))]
  if (wanted.length === 0) return []
  const rows = await db
    .select({ id: classes.id, gradeLevelId: classes.gradeLevelId })
    .from(classes)
    .where(and(eq(classes.schoolId, schoolId), inArray(classes.id, wanted)))
  return rows
    .filter((c) => gradeIds === null || gradeIds.includes(c.gradeLevelId))
    .map((c) => c.id)
}

export async function deleteTeacher(teacherId: string, userId: string) {
  const access = await requireTeacherManager()
  if (!access) return { ok: false as const, error: 'غير مصرح لك بهذا الإجراء' }
  const [teacher] = await db.select().from(teachers).where(eq(teachers.id, teacherId)).limit(1)
  if (!teacher || teacher.schoolId !== access.school.id || teacher.userId !== userId) {
    return { ok: false as const, error: 'المعلم غير موجود' }
  }

  try {
    // Subjects stay, but must not point at an account that no longer exists.
    const assigned = await db.select({ id: subjects.id }).from(subjects).where(eq(subjects.teacherUserId, userId))

    await db.transaction(async (tx) => {
      await tx.update(subjects).set({ teacherUserId: null }).where(eq(subjects.teacherUserId, userId))
      // An absence is only reopenable by the teacher who recorded it. Leaving
      // their id on the row after the account is gone would lock that day's
      // register for everyone, so ownership is released with the account.
      await tx.update(dailyRecords)
        .set({ absenceMarkedBy: null, absenceMarkedAt: null })
        .where(eq(dailyRecords.absenceMarkedBy, userId))
      // Their inbox goes with the account — rows addressed to a user id that is
      // about to stop existing. Their lessons, marks and cases stay: that is
      // the pupils' history, shown as «معلم محذوف».
      await tx.delete(userNotifications).where(eq(userNotifications.recipientUserId, userId))
      await tx.delete(teachers).where(eq(teachers.id, teacherId))
      await tx.delete(account).where(eq(account.userId, userId))
      await tx.delete(session).where(eq(session.userId, userId))
      await tx.delete(user).where(eq(user.id, userId))
    })

    await logAudit(access, 'teacher.delete', teacher.fullName, { unassignedSubjects: assigned.length })

    revalidatePath('/admin/teachers')
    revalidatePath('/admin/grade-levels')
    return { ok: true as const, unassignedSubjects: assigned.length }
  } catch (error) {
    console.error('Delete Teacher Error:', error)
    return { ok: false as const, error: 'حدث خطأ أثناء حذف المعلم' }
  }
}

export async function editTeacher(
  teacherId: string,
  userId: string,
  input: { fullName: string; phone: string; allGrades?: boolean; gradeLevelIds?: string[] },
) {
  const access = await requireTeacherManager()
  if (!access) return { ok: false as const, error: 'غير مصرح لك بهذا الإجراء' }
  const [teacher] = await db.select().from(teachers).where(eq(teachers.id, teacherId)).limit(1)
  if (!teacher || teacher.schoolId !== access.school.id) {
    return { ok: false as const, error: 'المعلم غير موجود' }
  }

  const fullName = String(input.fullName ?? '').trim().slice(0, 120)
  if (!fullName) return { ok: false as const, error: 'اسم المعلم مطلوب' }

  // Stages are only rewritten when the caller actually sent them, so an older
  // form that knows nothing about stages cannot blank a teacher's ceiling.
  let scope: { allGrades: boolean; gradeLevelIds: string } | null = null
  if (input.allGrades !== undefined || input.gradeLevelIds !== undefined) {
    const allGrades = input.allGrades === true
    const gradeIds = allGrades ? [] : await verifiedGradeIds(access.school.id, input.gradeLevelIds ?? [])
    if (!allGrades && gradeIds.length === 0) {
      return { ok: false as const, error: 'اختر مرحلة واحدة على الأقل، أو اختر «كل المراحل»' }
    }
    scope = { allGrades, gradeLevelIds: JSON.stringify(gradeIds) }
  }

  // We intentionally do NOT change the login email if the phone changes, to avoid locking the teacher out.
  // We only update the display name and phone number.
  await db.update(teachers).set({
    fullName,
    phone: input.phone,
    ...(scope ?? {}),
  }).where(eq(teachers.id, teacherId))

  await db.update(user).set({
    name: fullName,
    updatedAt: new Date(),
  }).where(eq(user.id, userId))

  // Which stages a teacher may open is a permission; changing it is logged
  // the same way a deputy's scope is.
  await logAudit(access, 'teacher.update', fullName, {
    from: teacher.fullName !== fullName ? teacher.fullName : undefined,
    allGrades: scope ? scope.allGrades : undefined,
    grades: scope && !scope.allGrades ? JSON.parse(scope.gradeLevelIds).length : undefined,
  })

  revalidatePath('/admin/teachers')
  return { ok: true as const }
}

// ── Reset a teacher's password (e.g. they forgot it) ──────────────────────────
// Generates a fresh temporary password, hashes it the same way better-auth does,
// and overwrites their credential account directly — no need to know the old password.
export async function resetTeacherPassword(teacherId: string, userId: string) {
  const access = await requireTeacherManager()
  if (!access) return { ok: false, error: 'غير مصرح بهذا الإجراء' }

  const [teacher] = await db.select().from(teachers).where(eq(teachers.id, teacherId)).limit(1)
  if (!teacher || teacher.schoolId !== access.school.id || teacher.userId !== userId) {
    return { ok: false, error: 'غير مصرح بالوصول لهذا المعلم' }
  }

  try {
    const tempPassword = generateTempPassword()
    const hashed = await hashPassword(tempPassword)

    await db.update(account).set({ password: hashed, updatedAt: new Date() })
      .where(and(eq(account.userId, userId), eq(account.providerId, 'credential')))

    // Issued by an administrator and written on a slip of paper: the teacher
    // must replace it before the portal opens.
    await db.update(user)
      .set({ mustChangePassword: true, updatedAt: new Date() })
      .where(eq(user.id, userId))

    await logAudit(access, 'teacher.passwordReset', teacher.fullName)

    // The login address is whatever the account was created with. Rebuilding it
    // from the current phone number was wrong for any teacher whose number had
    // been edited since — editTeacher deliberately leaves the email alone — and
    // handed the admin credentials that could not sign in.
    const [loginUser] = await db.select({ email: user.email }).from(user).where(eq(user.id, userId)).limit(1)

    revalidatePath('/admin/teachers')
    return { ok: true, tempPassword, email: loginUser?.email ?? '' }
  } catch (error) {
    console.error('Reset Teacher Password Error:', error)
    return { ok: false, error: 'حدث خطأ أثناء إعادة تعيين كلمة المرور' }
  }
}
