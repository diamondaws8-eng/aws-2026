'use server'

import { db } from '@/lib/db'
import { schoolStaff } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { requireCounselor } from '@/lib/counselor-access'
import {
  cleanTemplates,
  cleanCasePrefs,
  type CounselorTemplate,
  type CounselorCasePrefs,
} from '@/lib/counselor-settings'

/**
 * Every export here is a public HTTP endpoint, reachable by POST without ever
 * loading the settings page. So each one begins by asking who is calling, and
 * each one writes to the caller's own staff row and no other — the row id comes
 * from the session, never from the browser.
 */

export type SaveResult = { ok: true } | { ok: false; error: string }

/** A rejected input comes back as a value: a production build strips thrown messages. */
function failed(error: string): SaveResult {
  return { ok: false, error }
}

export async function saveCounselorPhone(phone: string): Promise<SaveResult> {
  try {
    const access = await requireCounselor()
    const clean = String(phone ?? '').replace(/[^\d+\s-]/g, '').trim().slice(0, 20)

    await db.update(schoolStaff)
      .set({ phone: clean || null })
      .where(eq(schoolStaff.id, access.staffId))

    revalidatePath('/counselor/settings')
    return { ok: true }
  } catch (error) {
    console.error('Save Counselor Phone Error:', error)
    return failed('تعذّر حفظ رقم الجوال')
  }
}

export async function saveCounselorTemplates(templates: CounselorTemplate[]): Promise<SaveResult> {
  try {
    const access = await requireCounselor()
    const clean = cleanTemplates(templates)

    await db.update(schoolStaff)
      .set({ whatsappTemplates: JSON.stringify(clean) })
      .where(eq(schoolStaff.id, access.staffId))

    // The decision dialog reads these, so its page has to be rebuilt too —
    // otherwise a template saved here does not appear where it is used.
    revalidatePath('/counselor/settings')
    revalidatePath('/counselor')
    return { ok: true }
  } catch (error) {
    console.error('Save Counselor Templates Error:', error)
    return failed('تعذّر حفظ القوالب')
  }
}

export async function saveCounselorCasePrefs(prefs: CounselorCasePrefs): Promise<SaveResult> {
  try {
    const access = await requireCounselor()
    const clean = cleanCasePrefs(prefs)

    await db.update(schoolStaff)
      .set({ casePrefs: JSON.stringify(clean) })
      .where(eq(schoolStaff.id, access.staffId))

    revalidatePath('/counselor/settings')
    revalidatePath('/counselor')
    return { ok: true }
  } catch (error) {
    console.error('Save Counselor Case Prefs Error:', error)
    return failed('تعذّر حفظ التفضيلات')
  }
}
