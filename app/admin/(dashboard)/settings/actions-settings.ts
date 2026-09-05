'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  schools, gradeLevels, classes, teachers, students, subjects, attendance,
  gradeEntries, notifications, dailyRecords, studentPoints
} from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import type { SchoolSettings } from './settings-types'
import { DEFAULT_SETTINGS } from './settings-types'

// ── Get current school settings ───────────────────────────────────────────────
export async function getSchoolSettings(schoolId: string): Promise<SchoolSettings> {
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
  await db
    .update(schools)
    .set({ settings: JSON.stringify(settings) })
    .where(eq(schools.id, schoolId))
  revalidatePath('/admin')
  return { ok: true }
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

// ── Export Full Backup ────────────────────────────────────────────────────────
export async function exportFullBackup(schoolId: string) {
  try {
    const backupData = {
      timestamp: new Date().toISOString(),
      schoolId,
      version: '1.0',
      data: {
        schools: await db.select().from(schools).where(eq(schools.id, schoolId)),
        gradeLevels: await db.select().from(gradeLevels).where(eq(gradeLevels.schoolId, schoolId)),
        classes: await db.select().from(classes).where(eq(classes.schoolId, schoolId)),
        teachers: await db.select().from(teachers).where(eq(teachers.schoolId, schoolId)),
        students: await db.select().from(students).where(eq(students.schoolId, schoolId)),
        subjects: await db.select().from(subjects).where(eq(subjects.schoolId, schoolId)),
        attendance: await db.select().from(attendance).where(eq(attendance.schoolId, schoolId)),
        gradeEntries: await db.select().from(gradeEntries).where(eq(gradeEntries.schoolId, schoolId)),
        notifications: await db.select().from(notifications).where(eq(notifications.schoolId, schoolId)),
        dailyRecords: await db.select().from(dailyRecords).where(eq(dailyRecords.schoolId, schoolId)),
        studentPoints: await db.select().from(studentPoints).where(eq(studentPoints.schoolId, schoolId)),
      }
    }
    return { ok: true, data: backupData }
  } catch (error) {
    console.error("Backup Error:", error)
    return { ok: false, error: 'حدث خطأ أثناء أخذ النسخة الاحتياطية' }
  }
}
