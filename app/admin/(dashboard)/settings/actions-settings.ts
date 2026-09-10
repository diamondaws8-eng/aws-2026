'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  schools, gradeLevels, classes, teachers, students, subjects, attendance,
  gradeEntries, notifications, dailyRecords, lessonRecords, studentPoints, user, schoolStaff, account,
  behaviorCases, schoolHolidays, schoolYears, parentWhatsappMessages, parentActivationLog, auditLog,
} from '@/lib/db/schema'
import { eq, inArray, and, ne } from 'drizzle-orm'
import { getAdminAccess } from '@/lib/admin-access'
import { logAudit } from '@/lib/audit'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import type { SchoolSettings } from './settings-types'
import { DEFAULT_SETTINGS } from './settings-types'

// ── Get current school settings ───────────────────────────────────────────────
/**
 * Returns the school's own defaults when the caller has no session. This is a
 * public endpoint like every server action, and it used to hand the settings —
 * including the WhatsApp templates — to anyone who knew a school id.
 */
export async function getSchoolSettings(schoolId: string): Promise<SchoolSettings> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return DEFAULT_SETTINGS

  // Holding a session proves the caller is somebody; it does not prove they are
  // somebody at THIS school. The id arrives from the browser, so without this a
  // signed-in parent could read any school's message templates and point values
  // by naming its id. Every real caller passes the school it already resolved
  // from its own session, so nothing legitimate changes.
  const { isMemberOfSchool } = await import('@/lib/school-membership')
  if (!(await isMemberOfSchool(session.user.id, schoolId))) return DEFAULT_SETTINGS

  const [school] = await db
    .select({ settings: schools.settings })
    .from(schools)
    .where(eq(schools.id, schoolId))
    .limit(1)
  if (!school?.settings) return DEFAULT_SETTINGS
  try {
    const parsed = JSON.parse(school.settings) as Partial<SchoolSettings>
    // Deep merge with defaults to fill any missing keys from old DB format
    return {
      features: { ...DEFAULT_SETTINGS.features, ...(parsed.features ?? {}) },
      points:   { ...DEFAULT_SETTINGS.points,   ...(parsed.points   ?? {}) },
      whatsappTemplates: {
        positive: parsed.whatsappTemplates?.positive ?? DEFAULT_SETTINGS.whatsappTemplates.positive,
        negative: parsed.whatsappTemplates?.negative ?? DEFAULT_SETTINGS.whatsappTemplates.negative,
      },
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

// ── Save school settings ──────────────────────────────────────────────────────
export async function saveSchoolSettings(schoolId: string, settings: SchoolSettings) {
  const access = await getAdminAccess()
  if (!access || !access.canManageSchoolSettings || access.school.id !== schoolId) {
    return { ok: false, error: 'غير مصرح بتعديل إعدادات المدرسة' }
  }
  await db
    .update(schools)
    .set({ settings: JSON.stringify(settings) })
    .where(eq(schools.id, schoolId))

  // Point values may have changed — bring every stored daily total back in line
  // with the new rules so no parent sees a breakdown that doesn't add up.
  const { resyncSchoolPoints } = await import('@/lib/points')
  await resyncSchoolPoints(schoolId, settings)

  await logAudit(access, 'settings.update', access.school.name)
  revalidatePath('/admin')
  return { ok: true }
}

// ── Academic calendar ─────────────────────────────────────────────────────────
/**
 * The term marks are stamped with, and the day the year's points start from.
 *
 * These were a constant and a missing concept respectively: every mark was
 * filed under the year '1446' regardless of the school, and the leaderboard
 * summed a pupil's whole history, so last year's score would have followed them
 * into this year forever.
 */
export async function saveAcademicCalendar(input: {
  academicYear: string
  currentSemester: string
  yearStartDate: string | null
}) {
  const access = await getAdminAccess()
  if (!access) return { ok: false as const, error: 'غير مصرح بهذا الإجراء' }
  if (!access.canManageSchoolSettings) {
    return { ok: false as const, error: 'تعديل العام الدراسي متاح لمدير الجودة ومالك النظام' }
  }

  const { isSemester } = await import('@/lib/academic')
  const { isValidDateString } = await import('@/lib/utils')

  const academicYear = String(input.academicYear ?? '').trim().slice(0, 20)
  if (!academicYear) return { ok: false as const, error: 'العام الدراسي مطلوب' }

  const currentSemester = String(input.currentSemester ?? '')
  if (!isSemester(currentSemester)) return { ok: false as const, error: 'الفصل الدراسي غير صالح' }

  // Empty means "count everything", which is the right answer for a school in
  // its first year — so it is allowed, but anything else must be a real date.
  const raw = String(input.yearStartDate ?? '').trim()
  if (raw && !isValidDateString(raw)) {
    return { ok: false as const, error: 'تاريخ بداية العام يجب أن يكون بصيغة YYYY-MM-DD' }
  }
  const yearStartDate = raw || null

  try {
    await db.update(schools)
      .set({ academicYear, currentSemester, yearStartDate })
      .where(eq(schools.id, access.school.id))

    await logAudit(access, 'settings.update', 'العام الدراسي والفصل الحالي', {
      academicYear,
      currentSemester,
      yearStartDate,
    })

    // Points totals are read on every portal, so rebuild each of them.
    revalidatePath('/admin', 'layout')
    revalidatePath('/teacher', 'layout')
    revalidatePath('/parent', 'layout')
    return { ok: true as const }
  } catch (error) {
    console.error('Save Academic Calendar Error:', error)
    return { ok: false as const, error: 'تعذّر حفظ بيانات العام الدراسي' }
  }
}

// ── Update own profile (name + login email) ───────────────────────────────────
// Available to every admin-portal role for their OWN account only.
export async function updateAdminProfile(input: { name: string; email: string }) {
  const access = await getAdminAccess()
  if (!access) return { ok: false as const, error: 'غير مصرح بهذا الإجراء' }

  const name = input.name.trim()
  const email = input.email.trim().toLowerCase()
  if (!name) return { ok: false as const, error: 'الاسم مطلوب' }
  if (!email || !email.includes('@')) return { ok: false as const, error: 'البريد الإلكتروني غير صالح' }

  // Email is the login identifier — it must stay unique across all accounts.
  const [taken] = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.email, email), ne(user.id, access.userId)))
    .limit(1)
  if (taken) return { ok: false as const, error: 'هذا البريد الإلكتروني مستخدم بحساب آخر' }

  try {
    await db.update(user).set({ name, email, updatedAt: new Date() }).where(eq(user.id, access.userId))

    // Keep the staff record's display name in sync
    if (access.staffId) {
      await db.update(schoolStaff).set({ fullName: name }).where(eq(schoolStaff.id, access.staffId))
    }

    revalidatePath('/admin', 'layout')
    return { ok: true as const }
  } catch (error) {
    console.error('Update Profile Error:', error)
    return { ok: false as const, error: 'حدث خطأ أثناء حفظ البيانات' }
  }
}

// ── Change admin password ─────────────────────────────────────────────────────
export async function changeAdminPassword(currentPassword: string, newPassword: string) {
  try {
    await auth.api.changePassword({
      body: { currentPassword, newPassword, revokeOtherSessions: false },
      headers: await headers(),
    })
    return { ok: true }
  } catch {
    return { ok: false, error: 'حدث خطأ أثناء تغيير كلمة المرور' }
  }
}

// ── Export Backup ─────────────────────────────────────────────────────────────
// The owner and quality managers get the whole school; a principal scoped to
// certain grade levels gets a backup limited to those grades.
export async function exportFullBackup(schoolId: string) {
  const access = await getAdminAccess()
  if (!access || !access.canBackup || access.school.id !== schoolId) {
    return { ok: false, error: 'غير مصرح لك بأخذ نسخة احتياطية' }
  }

  try {
    const wholeSchool = access.backupAllGrades

    if (wholeSchool) {
      const [
        schoolRows, gradeLevelRows, classRows, teacherRows, studentRows,
        subjectRows, attendanceRows, gradeEntryRows, notificationRows,
        dailyRecordRows, lessonRecordRows, studentPointRows,
        // The file said "everything" while leaving these out. They are kept
        // here for the record; restore rebuilds the academic tables only and
        // the settings screen says so.
        behaviorCaseRows, staffRows, holidayRows, yearRows, parentMessageRows, activationLogRows, auditRows,
      ] = await Promise.all([
        db.select().from(schools).where(eq(schools.id, schoolId)),
        db.select().from(gradeLevels).where(eq(gradeLevels.schoolId, schoolId)),
        db.select().from(classes).where(eq(classes.schoolId, schoolId)),
        db.select().from(teachers).where(eq(teachers.schoolId, schoolId)),
        db.select().from(students).where(eq(students.schoolId, schoolId)),
        db.select().from(subjects).where(eq(subjects.schoolId, schoolId)),
        db.select().from(attendance).where(eq(attendance.schoolId, schoolId)),
        db.select().from(gradeEntries).where(eq(gradeEntries.schoolId, schoolId)),
        db.select().from(notifications).where(eq(notifications.schoolId, schoolId)),
        db.select().from(dailyRecords).where(eq(dailyRecords.schoolId, schoolId)),
        db.select().from(lessonRecords).where(eq(lessonRecords.schoolId, schoolId)),
        db.select().from(studentPoints).where(eq(studentPoints.schoolId, schoolId)),
        db.select().from(behaviorCases).where(eq(behaviorCases.schoolId, schoolId)),
        db.select().from(schoolStaff).where(eq(schoolStaff.schoolId, schoolId)),
        db.select().from(schoolHolidays).where(eq(schoolHolidays.schoolId, schoolId)),
        db.select().from(schoolYears).where(eq(schoolYears.schoolId, schoolId)),
        db.select().from(parentWhatsappMessages).where(eq(parentWhatsappMessages.schoolId, schoolId)),
        db.select().from(parentActivationLog).where(eq(parentActivationLog.schoolId, schoolId)),
        db.select().from(auditLog).where(eq(auditLog.schoolId, schoolId)),
      ])

      await logAudit(access, 'backup.export', access.school.name, { scope: 'full', students: studentRows.length })

      return {
        ok: true,
        data: {
          timestamp: new Date().toISOString(),
          schoolId,
          version: '1.2',
          scope: { type: 'full' as const, gradeIds: [] as string[], gradeNames: [] as string[] },
          data: {
            schools: schoolRows, gradeLevels: gradeLevelRows, classes: classRows,
            teachers: teacherRows, students: studentRows, subjects: subjectRows,
            attendance: attendanceRows, gradeEntries: gradeEntryRows,
            notifications: notificationRows, dailyRecords: dailyRecordRows,
            lessonRecords: lessonRecordRows,
            studentPoints: studentPointRows,
            behaviorCases: behaviorCaseRows, schoolStaff: staffRows,
            schoolHolidays: holidayRows, schoolYears: yearRows,
            parentWhatsappMessages: parentMessageRows, parentActivationLog: activationLogRows,
            auditLog: auditRows,
          },
        },
      }
    }

    // ── Scoped backup: only the grades this manager is responsible for ────────
    const scopedGradeIds = access.gradeIds
    if (scopedGradeIds.length === 0) {
      return { ok: false, error: 'لا توجد مراحل مسندة لحسابك لأخذ نسخة منها' }
    }

    const [schoolRows, gradeLevelRows, classRows, teacherRows] = await Promise.all([
      db.select().from(schools).where(eq(schools.id, schoolId)),
      db.select().from(gradeLevels).where(and(eq(gradeLevels.schoolId, schoolId), inArray(gradeLevels.id, scopedGradeIds))),
      db.select().from(classes).where(and(eq(classes.schoolId, schoolId), inArray(classes.gradeLevelId, scopedGradeIds))),
      db.select().from(teachers).where(eq(teachers.schoolId, schoolId)),
    ])

    const classIds = classRows.map((c) => c.id)
    if (classIds.length === 0) {
      return {
        ok: true,
        data: {
          timestamp: new Date().toISOString(),
          schoolId,
          version: '1.1',
          scope: {
            type: 'grades' as const,
            gradeIds: scopedGradeIds,
            gradeNames: gradeLevelRows.map((g) => g.name),
          },
          data: {
            schools: schoolRows, gradeLevels: gradeLevelRows, classes: [], teachers: teacherRows,
            students: [], subjects: [], attendance: [], gradeEntries: [],
            notifications: [], dailyRecords: [], lessonRecords: [], studentPoints: [],
          },
        },
      }
    }

    const [studentRows, subjectRows, dailyRecordRows, lessonRecordRows, studentPointRows, notificationRows] = await Promise.all([
      db.select().from(students).where(and(eq(students.schoolId, schoolId), inArray(students.classId, classIds))),
      db.select().from(subjects).where(and(eq(subjects.schoolId, schoolId), inArray(subjects.classId, classIds))),
      db.select().from(dailyRecords).where(and(eq(dailyRecords.schoolId, schoolId), inArray(dailyRecords.classId, classIds))),
      db.select().from(lessonRecords).where(and(eq(lessonRecords.schoolId, schoolId), inArray(lessonRecords.classId, classIds))),
      db.select().from(studentPoints).where(and(eq(studentPoints.schoolId, schoolId), inArray(studentPoints.classId, classIds))),
      db.select().from(notifications).where(and(eq(notifications.schoolId, schoolId), inArray(notifications.classId, classIds))),
    ])

    const studentIds = studentRows.map((s) => s.id)
    const [attendanceRows, gradeEntryRows] = await Promise.all([
      studentIds.length
        ? db.select().from(attendance).where(and(eq(attendance.schoolId, schoolId), inArray(attendance.studentId, studentIds)))
        : Promise.resolve([]),
      studentIds.length
        ? db.select().from(gradeEntries).where(and(eq(gradeEntries.schoolId, schoolId), inArray(gradeEntries.studentId, studentIds)))
        : Promise.resolve([]),
    ])

    await logAudit(access, 'backup.export', access.school.name, {
      scope: 'grades',
      gradeNames: gradeLevelRows.map((g) => g.name),
      students: studentRows.length,
    })

    return {
      ok: true,
      data: {
        timestamp: new Date().toISOString(),
        schoolId,
        version: '1.1',
        scope: {
          type: 'grades' as const,
          gradeIds: scopedGradeIds,
          gradeNames: gradeLevelRows.map((g) => g.name),
        },
        data: {
          schools: schoolRows, gradeLevels: gradeLevelRows, classes: classRows,
          teachers: teacherRows, students: studentRows, subjects: subjectRows,
          attendance: attendanceRows, gradeEntries: gradeEntryRows,
          notifications: notificationRows, dailyRecords: dailyRecordRows,
          lessonRecords: lessonRecordRows,
          studentPoints: studentPointRows,
        },
      },
    }
  } catch (error) {
    console.error("Backup Error:", error)
    return { ok: false, error: 'حدث خطأ أثناء أخذ النسخة الاحتياطية' }
  }
}

// ── Restore Full Backup ───────────────────────────────────────────────────────
// Replaces ALL of the school's data with the contents of a previously
// exported backup file, inside a single transaction (all-or-nothing).
// Note: login accounts (email/password) for teachers and parents are NOT
// part of the backup — if an account was deleted after the backup was taken,
// the restored row comes back but that person will not be able to log in
// until the admin re-creates their account.
export async function restoreFullBackup(schoolId: string, backup: any) {
  try {
    const access = await getAdminAccess()
    if (!access || !access.canRestore || access.school.id !== schoolId) {
      return { ok: false, error: 'الاستعادة متاحة للمالك فقط' }
    }
    const school = access.school

    if (!backup || typeof backup !== 'object' || !backup.data || typeof backup.data !== 'object') {
      return { ok: false, error: 'ملف النسخة الاحتياطية غير صالح أو تالف' }
    }
    if (backup.schoolId && backup.schoolId !== schoolId) {
      return { ok: false, error: 'هذه النسخة الاحتياطية تعود لمدرسة أخرى ولا يمكن استعادتها هنا' }
    }
    // A partial (per-grade) backup must never be restored: the restore wipes the
    // whole school first, so it would delete every grade missing from the file.
    if (backup.scope?.type === 'grades') {
      const names = Array.isArray(backup.scope.gradeNames) ? backup.scope.gradeNames.join('، ') : ''
      return {
        ok: false,
        error: `هذه نسخة جزئية${names ? ` (${names})` : ''} وليست نسخة كاملة للمدرسة. استعادتها ستحذف بقية المراحل، لذلك لا يمكن استخدامها هنا — استخدم نسخة كاملة.`,
      }
    }

    const d = backup.data
    const toDate = (v: any) => (v ? new Date(v) : v)
    const counts = {
      gradeLevels: 0, classes: 0, subjects: 0, teachers: 0, students: 0,
      attendance: 0, gradeEntries: 0, notifications: 0, dailyRecords: 0, lessonRecords: 0, studentPoints: 0,
      /** Non-manual point rows in an old file, dropped because they are derived now. */
      studentPointsSkipped: 0,
      /** Rows whose totals had to be rebuilt from the statuses after the restore. */
      pointsRecomputed: 0,
    }

    await db.transaction(async (tx) => {
      // Restore the school's own editable fields — never trust id/adminId from the file
      const backupSchool = Array.isArray(d.schools) ? d.schools[0] : null
      if (backupSchool) {
        await tx.update(schools).set({
          name: backupSchool.name ?? school.name,
          academicYear: backupSchool.academicYear ?? school.academicYear,
          settings: backupSchool.settings ?? school.settings,
        }).where(eq(schools.id, schoolId))
      }

      // Wipe current school-scoped data
      await tx.delete(studentPoints).where(eq(studentPoints.schoolId, schoolId))
      await tx.delete(lessonRecords).where(eq(lessonRecords.schoolId, schoolId))
      await tx.delete(dailyRecords).where(eq(dailyRecords.schoolId, schoolId))
      await tx.delete(notifications).where(eq(notifications.schoolId, schoolId))
      await tx.delete(gradeEntries).where(eq(gradeEntries.schoolId, schoolId))
      await tx.delete(attendance).where(eq(attendance.schoolId, schoolId))
      await tx.delete(subjects).where(eq(subjects.schoolId, schoolId))
      await tx.delete(students).where(eq(students.schoolId, schoolId))
      await tx.delete(teachers).where(eq(teachers.schoolId, schoolId))
      await tx.delete(classes).where(eq(classes.schoolId, schoolId))
      await tx.delete(gradeLevels).where(eq(gradeLevels.schoolId, schoolId))

      // Re-insert everything from the backup, preserving original ids so
      // cross-table references (class -> grade level, subject -> class, ...) stay intact
      if (Array.isArray(d.gradeLevels) && d.gradeLevels.length) {
        await tx.insert(gradeLevels).values(d.gradeLevels.map((r: any) => ({ ...r, schoolId, createdAt: toDate(r.createdAt) })))
        counts.gradeLevels = d.gradeLevels.length
      }
      if (Array.isArray(d.classes) && d.classes.length) {
        await tx.insert(classes).values(d.classes.map((r: any) => ({ ...r, schoolId, createdAt: toDate(r.createdAt) })))
        counts.classes = d.classes.length
      }
      if (Array.isArray(d.teachers) && d.teachers.length) {
        await tx.insert(teachers).values(d.teachers.map((r: any) => ({ ...r, schoolId, createdAt: toDate(r.createdAt) })))
        counts.teachers = d.teachers.length
      }
      if (Array.isArray(d.students) && d.students.length) {
        await tx.insert(students).values(d.students.map((r: any) => ({ ...r, schoolId, createdAt: toDate(r.createdAt) })))
        counts.students = d.students.length
      }
      if (Array.isArray(d.subjects) && d.subjects.length) {
        await tx.insert(subjects).values(d.subjects.map((r: any) => ({ ...r, schoolId, createdAt: toDate(r.createdAt) })))
        counts.subjects = d.subjects.length
      }
      if (Array.isArray(d.attendance) && d.attendance.length) {
        await tx.insert(attendance).values(d.attendance.map((r: any) => ({ ...r, schoolId, createdAt: toDate(r.createdAt) })))
        counts.attendance = d.attendance.length
      }
      if (Array.isArray(d.gradeEntries) && d.gradeEntries.length) {
        await tx.insert(gradeEntries).values(d.gradeEntries.map((r: any) => ({ ...r, schoolId, createdAt: toDate(r.createdAt) })))
        counts.gradeEntries = d.gradeEntries.length
      }
      if (Array.isArray(d.notifications) && d.notifications.length) {
        await tx.insert(notifications).values(d.notifications.map((r: any) => ({ ...r, schoolId, createdAt: toDate(r.createdAt), expiresAt: toDate(r.expiresAt) })))
        counts.notifications = d.notifications.length
      }
      if (Array.isArray(d.dailyRecords) && d.dailyRecords.length) {
        await tx.insert(dailyRecords).values(d.dailyRecords.map((r: any) => ({ ...r, schoolId, createdAt: toDate(r.createdAt), updatedAt: toDate(r.updatedAt) })))
        counts.dailyRecords = d.dailyRecords.length
      }
      if (Array.isArray(d.lessonRecords) && d.lessonRecords.length) {
        await tx.insert(lessonRecords).values(d.lessonRecords.map((r: any) => ({ ...r, schoolId, createdAt: toDate(r.createdAt), updatedAt: toDate(r.updatedAt) })))
        counts.lessonRecords = d.lessonRecords.length
      }
      // A file taken before assessments moved out of the register carries them
      // on daily_records instead; rebuild the per-teacher rows from it so a
      // restore never silently loses a term of marks.
      else if (Array.isArray(d.dailyRecords) && d.dailyRecords.length) {
        const rebuilt = d.dailyRecords
          .filter((r: any) => r.behavior || r.homeworkStatus || r.materialsStatus || r.participationStatus || r.teacherNote)
          .map((r: any) => ({
            schoolId,
            classId: r.classId,
            studentId: r.studentId,
            teacherUserId: r.teacherUserId,
            subjectId: null,
            date: r.date,
            behavior: r.behavior ?? null,
            homeworkStatus: r.homeworkStatus ?? null,
            materialsStatus: r.materialsStatus ?? null,
            participationStatus: r.participationStatus ?? null,
            teacherNote: r.teacherNote ?? null,
            pointsEarned: 0,
            createdAt: toDate(r.createdAt),
            updatedAt: toDate(r.updatedAt),
          }))
        if (rebuilt.length) {
          await tx.insert(lessonRecords).values(rebuilt)
          counts.lessonRecords = rebuilt.length
        }
      }

      // Only hand-given awards live here now. A file taken before points became
      // derived also carries attendance/behavior/homework rows; restoring those
      // would add them a second time on top of the totals rebuilt below, which
      // silently doubles every student's score.
      if (Array.isArray(d.studentPoints) && d.studentPoints.length) {
        const manualOnly = d.studentPoints.filter((r: any) => r.type === 'manual')
        if (manualOnly.length) {
          await tx.insert(studentPoints).values(manualOnly.map((r: any) => ({ ...r, schoolId, createdAt: toDate(r.createdAt) })))
        }
        counts.studentPoints = manualOnly.length
        counts.studentPointsSkipped = d.studentPoints.length - manualOnly.length
      }
    })

    // The restored rows carry whatever totals the file was written with — an
    // old file even keeps the attendance and the assessment in one number.
    // Recomputing from the statuses is the only way the two tables agree.
    const { resyncSchoolPoints } = await import('@/lib/points')
    const settingsNow = await getSchoolSettings(schoolId)
    counts.pointsRecomputed = await resyncSchoolPoints(schoolId, settingsNow)

    // A restore brings back the teacher and student rows but not the login
    // accounts, so anyone deleted since the file was written comes back listed
    // yet unable to sign in. Counting them is the only way the owner finds out.
    const countMissing = async (ids: string[]) => {
      const wanted = [...new Set(ids.filter(Boolean))]
      if (!wanted.length) return 0
      const existing = await db.select({ id: user.id }).from(user).where(inArray(user.id, wanted))
      return wanted.length - existing.length
    }

    const missingLogins = await countMissing((d.teachers || []).map((t: any) => t.userId))
    const missingParentLogins = await countMissing((d.students || []).map((st: any) => st.parentUserId))

    await logAudit(access, 'backup.restore', access.school.name, { counts, missingLogins, missingParentLogins })

    revalidatePath('/admin', 'layout')

    return { ok: true, counts, missingLogins, missingParentLogins }
  } catch (error) {
    console.error('Restore Error:', error)
    return { ok: false, error: 'حدث خطأ أثناء الاستعادة. لم يتم تعديل أي بيانات (تم التراجع تلقائياً).' }
  }
}

/**
 * First-login password change for an administrator whose account was created by
 * someone else. Usable only while the flag stands, so it can never replace the
 * normal "enter your current password" flow. The owner is never flagged.
 */
export async function setOwnAdminPassword(newPassword: string, confirmPassword: string) {
  const access = await getAdminAccess()
  if (!access) return { ok: false as const, error: 'غير مصرح بهذا الإجراء' }

  const [me] = await db
    .select({ mustChange: user.mustChangePassword })
    .from(user)
    .where(eq(user.id, access.userId))
    .limit(1)
  if (!me?.mustChange) return { ok: false as const, error: 'لا حاجة لتغيير كلمة المرور' }

  if (newPassword !== confirmPassword) {
    return { ok: false as const, error: 'كلمتا المرور غير متطابقتين' }
  }
  if (newPassword.length < 8) {
    return { ok: false as const, error: 'كلمة المرور يجب أن تكون 8 أحرف أو أرقام على الأقل' }
  }

  try {
    const { hashPassword } = await import('better-auth/crypto')
    const hashed = await hashPassword(newPassword)
    await db.update(account).set({ password: hashed, updatedAt: new Date() })
      .where(and(eq(account.userId, access.userId), eq(account.providerId, 'credential')))
    await db.update(user)
      .set({ mustChangePassword: false, updatedAt: new Date() })
      .where(eq(user.id, access.userId))
    return { ok: true as const }
  } catch (error) {
    console.error('Set Admin Password Error:', error)
    return { ok: false as const, error: 'حدث خطأ أثناء حفظ كلمة المرور' }
  }
}
