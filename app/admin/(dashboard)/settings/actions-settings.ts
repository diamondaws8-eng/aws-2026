'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { schools } from '@/lib/db/schema'
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
