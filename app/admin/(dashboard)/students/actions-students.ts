'use server'

import { db } from '@/lib/db'
import {
  students, user, account, classes, session,
  dailyRecords, studentPoints, attendance, gradeEntries, parentWhatsappMessages, notifications,
  lessonRecords, behaviorCases, userNotifications, parentActivationLog,
} from '@/lib/db/schema'
import { eq, and, inArray, ne } from 'drizzle-orm'
import { parentEmail, parentEmailCandidates } from '@/lib/utils'
import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { hashPassword } from 'better-auth/crypto'
import { getAdminAccess, canEditGrade, type AdminAccess } from '@/lib/admin-access'
import { logAudit } from '@/lib/audit'

/**
 * Starter password handed to every new parent. It is deliberately the same for
 * everyone so the school can announce it once (and it survives bulk Excel
 * imports) — the account is only usable after the parent replaces it, which the
 * parent portal forces on first login via user.mustChangePassword.
 */
// NOTE: not exported — a 'use server' file may only export async functions.
const DEFAULT_PARENT_PASSWORD = '12345678'

/** Unambiguous character set — no 0/O/1/l/I, so passwords can be read out loud. */
function generateParentPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

/** Resolve the grade level a class belongs to (null when the student has no class). */
async function gradeOfClass(classId: string | null | undefined): Promise<string | null> {
  if (!classId) return null
  const [cls] = await db.select({ gradeLevelId: classes.gradeLevelId }).from(classes).where(eq(classes.id, classId)).limit(1)
  return cls?.gradeLevelId ?? null
}

/** The caller must be allowed to modify students in the given class's grade. */
async function requireStudentEditor(classId: string | null | undefined): Promise<AdminAccess | null> {
  const access = await getAdminAccess()
  if (!access || !access.canEdit) return null
  // A student without a class is school-wide data: only school-wide editors may touch it.
  if (!classId) return access.editAllGrades ? access : null
  const gradeLevelId = await gradeOfClass(classId)
  return canEditGrade(access, gradeLevelId) ? access : null
}



// ── Add single student ────────────────────────────────────────────────────────
export async function addStudent(input: any) {
  try {
    const access = await requireStudentEditor(input.classId)
    if (!access || access.school.id !== input.schoolId) {
      return { ok: false, error: 'غير مصرح لك بإضافة طالب في هذه المرحلة' }
    }

    let parentUserId = null

    if (input.parentPhone) {
      // Look under every spelling so a sibling entered as 0501234567 joins the
      // login already created for 501234567 instead of getting a second one.
      const parentEmailAddr = parentEmail(input.parentPhone)
      const [existingUser] = await db
        .select()
        .from(user)
        .where(inArray(user.email, parentEmailCandidates(input.parentPhone)))
        .limit(1)

      if (!existingUser) {
        try {
          await auth.api.signUpEmail({
            body: { email: parentEmailAddr, password: DEFAULT_PARENT_PASSWORD, name: `ولي أمر ${input.fullName}` }
          })
          await db.update(user)
            .set({ role: 'parent', mustChangePassword: true, updatedAt: new Date() })
            .where(eq(user.email, parentEmailAddr))
        } catch (e) {
          console.error("signUpEmail Error:", e)
        }
      }

      const [pUser] = await db
        .select()
        .from(user)
        .where(inArray(user.email, parentEmailCandidates(input.parentPhone)))
        .limit(1)
      parentUserId = pUser?.id ?? null
    }

    await db.insert(students).values({
      schoolId:    input.schoolId,
      fullName:    input.fullName,
      nationalId:  input.nationalId || null,
      parentPhone: input.parentPhone || null,
      gender:      input.gender,
      classId:     input.classId || null,
      parentUserId,
    })

    revalidatePath('/admin/students')
    return { ok: true }
  } catch (err: any) {
    console.error("Server Action Error in addStudent:", err)
    return { ok: false, error: err.message || String(err) }
  }
}

// ── Delete student ────────────────────────────────────────────────────────────
// Removes everything that belongs to the student, plus their parent's login if
// no other student is linked to it — otherwise those rows linger forever.
export async function deleteStudent(id: string) {
  const [student] = await db.select().from(students).where(eq(students.id, id)).limit(1)
  if (!student) return { ok: false as const, error: 'الطالب غير موجود' }

  const access = await requireStudentEditor(student.classId)
  if (!access || access.school.id !== student.schoolId) {
    return { ok: false as const, error: 'غير مصرح لك بحذف هذا الطالب' }
  }

  try {
    // Is the parent account shared with a sibling?
    let parentToRemove: string | null = null
    if (student.parentUserId) {
      const siblings = await db
        .select({ id: students.id })
        .from(students)
        .where(and(eq(students.parentUserId, student.parentUserId), ne(students.id, id)))
      if (siblings.length === 0) parentToRemove = student.parentUserId
    }

    await db.transaction(async (tx) => {
      await tx.delete(dailyRecords).where(eq(dailyRecords.studentId, id))
      // Added after this list was first written, and missing from it since:
      // a deleted pupil left their per-teacher assessments behind for good.
      await tx.delete(lessonRecords).where(eq(lessonRecords.studentId, id))
      await tx.delete(studentPoints).where(eq(studentPoints.studentId, id))
      await tx.delete(attendance).where(eq(attendance.studentId, id))
      await tx.delete(gradeEntries).where(eq(gradeEntries.studentId, id))
      await tx.delete(parentWhatsappMessages).where(eq(parentWhatsappMessages.studentId, id))
      await tx.delete(notifications).where(eq(notifications.studentId, id))

      // Behaviour cases, and the bell entries that point at them — a teacher or
      // counsellor left holding a notification for a case about a pupil who no
      // longer exists opens it onto nothing.
      const removedCases = await tx
        .delete(behaviorCases)
        .where(eq(behaviorCases.studentId, id))
        .returning({ id: behaviorCases.id })
      if (removedCases.length > 0) {
        await tx.delete(userNotifications).where(
          inArray(userNotifications.entityId, removedCases.map((c) => c.id)),
        )
      }

      await tx.delete(students).where(eq(students.id, id))

      if (parentToRemove) {
        // The parent's own inbox and their place in the activation campaign go
        // with the account: both are addressed by a user id that is about to
        // stop existing.
        await tx.delete(userNotifications).where(eq(userNotifications.recipientUserId, parentToRemove))
        await tx.delete(parentActivationLog).where(eq(parentActivationLog.parentUserId, parentToRemove))
        await tx.delete(account).where(eq(account.userId, parentToRemove))
        await tx.delete(session).where(eq(session.userId, parentToRemove))
        await tx.delete(user).where(eq(user.id, parentToRemove))
      }
    })

    await logAudit(access, 'student.delete', student.fullName, {
      removedParentAccount: !!parentToRemove,
      parentPhone: student.parentPhone,
    })

    revalidatePath('/admin/students')
    return { ok: true as const, removedParentAccount: !!parentToRemove }
  } catch (error) {
    console.error('Delete Student Error:', error)
    return { ok: false as const, error: 'حدث خطأ أثناء حذف الطالب' }
  }
}

// ── Edit student ──────────────────────────────────────────────────────────────
export async function editStudent(id: string, input: any) {
  try {
    const [existing] = await db.select().from(students).where(eq(students.id, id)).limit(1)
    if (!existing) return { ok: false, error: 'الطالب غير موجود' }

    // Must be allowed to edit both where the student is now and where they're moving to.
    const fromAccess = await requireStudentEditor(existing.classId)
    const toAccess = await requireStudentEditor(input.classId)
    if (!fromAccess || !toAccess || fromAccess.school.id !== existing.schoolId) {
      return { ok: false, error: 'غير مصرح لك بتعديل هذا الطالب' }
    }

    let parentUserId = null

    if (input.parentPhone) {
      // Look under every spelling so a sibling entered as 0501234567 joins the
      // login already created for 501234567 instead of getting a second one.
      const parentEmailAddr = parentEmail(input.parentPhone)
      const [existingUser] = await db
        .select()
        .from(user)
        .where(inArray(user.email, parentEmailCandidates(input.parentPhone)))
        .limit(1)

      if (!existingUser) {
        try {
          await auth.api.signUpEmail({
            body: { email: parentEmailAddr, password: DEFAULT_PARENT_PASSWORD, name: `ولي أمر ${input.fullName}` }
          })
          await db.update(user)
            .set({ role: 'parent', mustChangePassword: true, updatedAt: new Date() })
            .where(eq(user.email, parentEmailAddr))
        } catch (e) {
          console.error("signUpEmail Error:", e)
        }
      }

      const [pUser] = await db
        .select()
        .from(user)
        .where(inArray(user.email, parentEmailCandidates(input.parentPhone)))
        .limit(1)
      parentUserId = pUser?.id ?? null
    }

    await db.update(students).set({
      fullName:    input.fullName,
      nationalId:  input.nationalId || null,
      parentPhone: input.parentPhone || null,
      gender:      input.gender,
      classId:     input.classId || null,
      parentUserId,
    }).where(eq(students.id, id))

    revalidatePath('/admin/students')
    return { ok: true }
  } catch (err: any) {
    console.error("Server Action Error in editStudent:", err)
    return { ok: false, error: err.message || String(err) }
  }
}


// ── Bulk import from Excel ────────────────────────────────────────────────────
export async function importStudents(
  rows: {
    fullName: string
    nationalId?: string
    parentPhone?: string
    gender: string
    classId?: string
  }[],
  schoolId: string
) {
  let created = 0
  let failed  = 0
  const errors: string[] = []

  const access = await getAdminAccess()
  if (!access || !access.canEdit || access.school.id !== schoolId) {
    return { created: 0, failed: rows.length, errors: ['غير مصرح لك باستيراد الطلاب'] }
  }
  // Checking only the first row's class let a crafted file slip students into
  // grades this user does not control, so every distinct class is checked.
  const importClassIds = [...new Set(rows.map(r => r.classId).filter(Boolean))] as string[]
  for (const classId of importClassIds.length ? importClassIds : [null]) {
    const importer = await requireStudentEditor(classId)
    if (!importer) {
      return { created: 0, failed: rows.length, errors: ['غير مصرح لك بالإضافة في هذه المرحلة'] }
    }
  }

  // Cache headers to avoid calling await headers() in every loop iteration
  const reqHeaders = await headers()

  for (const row of rows) {
    try {
      if (!row.fullName?.trim()) {
        failed++
        errors.push('صف بدون اسم')
        continue
      }

      let parentUserId: string | null = null

      if (row.parentPhone) {
        // Excel sometimes exports numbers as floats e.g. 5012345678.0
        const rawPhone        = String(row.parentPhone).replace(/\.0+$/, '')
        const parentEmailAddr = parentEmail(rawPhone)

        // Siblings across two import files, spelled differently, must land on
        // the one login — see parentEmailCandidates.
        const [existingUser] = await db
          .select()
          .from(user)
          .where(inArray(user.email, parentEmailCandidates(rawPhone)))
          .limit(1)

        if (!existingUser) {
          try {
            await auth.api.signUpEmail({
              body: { email: parentEmailAddr, password: DEFAULT_PARENT_PASSWORD, name: `ولي أمر ${row.fullName.trim()}` }
            })
            await db
              .update(user)
              .set({ role: 'parent', mustChangePassword: true, updatedAt: new Date() })
              .where(eq(user.email, parentEmailAddr))
          } catch (e) {
            console.error("Excel import signUpEmail Error:", e)
          }
        }
        
        const [pUser] = await db
          .select()
          .from(user)
          .where(inArray(user.email, parentEmailCandidates(rawPhone)))
          .limit(1)
        parentUserId = pUser?.id ?? null
      }

      await db.insert(students).values({
        schoolId,
        fullName:    row.fullName.trim(),
        nationalId:  row.nationalId  ? String(row.nationalId).replace(/\.0+$/, '').trim()  : null,
        parentPhone: row.parentPhone ? String(row.parentPhone).replace(/\.0+$/, '').trim() : null,
        gender:      row.gender === 'أنثى' || row.gender === 'female' ? 'female' : 'male',
        classId:     row.classId || null,
        parentUserId,
      })
      created++
    } catch (e) {
      failed++
      errors.push(row.fullName || 'صف غير معروف')
    }
  }

  revalidatePath('/admin/students')
  return { created, failed, errors }
}

// ── Require every parent to pick a new password ───────────────────────────────
// Owner-only. This does NOT change anyone's password, so nobody is locked out:
// parents still sign in exactly as before, and are then asked to choose their
// own password before they can see anything.
export async function requireAllParentsToChangePassword(schoolId: string) {
  const access = await getAdminAccess()
  if (!access || access.role !== 'owner' || access.school.id !== schoolId) {
    return { ok: false as const, error: 'هذا الإجراء متاح للمالك فقط' }
  }

  try {
    const rows = await db
      .select({ parentUserId: students.parentUserId })
      .from(students)
      .where(eq(students.schoolId, schoolId))

    const parentIds = Array.from(new Set(rows.map((r) => r.parentUserId).filter((id): id is string => !!id)))
    if (parentIds.length === 0) {
      return { ok: false as const, error: 'لا توجد حسابات أولياء أمور' }
    }

    await db.update(user)
      .set({ mustChangePassword: true, updatedAt: new Date() })
      .where(inArray(user.id, parentIds))

    await logAudit(access, 'parents.requirePasswordChange', null, { count: parentIds.length })

    return { ok: true as const, count: parentIds.length }
  } catch (error) {
    console.error('Require Parent Password Change Error:', error)
    return { ok: false as const, error: 'حدث خطأ أثناء تنفيذ الإجراء' }
  }
}

// ── Reset a parent's password (e.g. they forgot it) ───────────────────────────
// Generates a fresh temporary password, hashes it the same way better-auth does,
// and overwrites their credential account directly — no need to know the old password.
export async function resetParentPassword(studentId: string, schoolId: string) {
  try {
    const [student] = await db.select().from(students).where(eq(students.id, studentId)).limit(1)
    if (!student || student.schoolId !== schoolId) {
      return { ok: false, error: 'غير مصرح بالوصول لهذا الطالب' }
    }
    const access = await requireStudentEditor(student.classId)
    if (!access || access.school.id !== schoolId) {
      return { ok: false, error: 'غير مصرح لك بهذا الإجراء' }
    }
    if (!student.parentUserId) {
      return { ok: false, error: 'لا يوجد حساب ولي أمر مرتبط بهذا الطالب' }
    }

    const tempPassword = generateParentPassword()
    const hashed = await hashPassword(tempPassword)

    await db.update(account).set({ password: hashed, updatedAt: new Date() })
      .where(and(eq(account.userId, student.parentUserId), eq(account.providerId, 'credential')))

    // The temporary password is only a way back in — the parent must replace it.
    await db.update(user)
      .set({ mustChangePassword: true, updatedAt: new Date() })
      .where(eq(user.id, student.parentUserId))

    await logAudit(access, 'student.parentPasswordReset', student.fullName, { parentPhone: student.parentPhone })

    return { ok: true, tempPassword, parentPhone: student.parentPhone }
  } catch (err: any) {
    console.error('Reset Parent Password Error:', err)
    return { ok: false, error: err.message || 'حدث خطأ أثناء إعادة تعيين كلمة المرور' }
  }
}
