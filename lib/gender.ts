/**
 * Reading a pupil's gender from whatever a spreadsheet happened to contain —
 * no database import, so both the server and the import preview use one rule.
 *
 * The import used to say `gender === 'أنثى' || gender === 'female' ? 'female'
 * : 'male'`. Every other spelling, and every blank cell, quietly became a boy.
 * In a school whose first three primary years are mixed and whose girls' side
 * is about to be loaded, that turns a missing column into hundreds of pupils
 * recorded as the wrong sex — and nothing on screen would have said so.
 *
 * So an unrecognised value is now *unknown*, not male. Unknown is visible, and
 * visible can be corrected; a wrong answer that looks confident cannot.
 */

export type Gender = 'male' | 'female'

const MALE = new Set([
  'male', 'm', 'boy', 'ذكر', 'ذكور', 'ولد', 'بنين', 'بنون', 'طالب',
])
const FEMALE = new Set([
  'female', 'f', 'girl', 'أنثى', 'انثى', 'اناث', 'إناث', 'بنت', 'بنات', 'طالبة',
])

/** Arabic letters that a hurried typist leaves off, normalised away before matching. */
function fold(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
}

/** Null when the value says nothing recognisable — never a guess. */
export function normalizeGender(raw: unknown): Gender | null {
  if (raw === null || raw === undefined) return null
  const v = fold(String(raw))
  if (!v) return null
  if (MALE.has(v)) return 'male'
  if (FEMALE.has(v)) return 'female'
  // Fold the sets the same way, so 'أنثى' still matches once folded to 'انثي'.
  for (const m of MALE) if (fold(m) === v) return 'male'
  for (const f of FEMALE) if (fold(f) === v) return 'female'
  return null
}

export function genderLabel(g: string | null | undefined): string {
  if (g === 'male') return 'ذكر'
  if (g === 'female') return 'أنثى'
  return 'غير محدد'
}

/** Short form for a roster badge, where the row has little room. */
export function genderShort(g: string | null | undefined): string {
  if (g === 'male') return 'بنين'
  if (g === 'female') return 'بنات'
  return '؟'
}

export const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'male', label: 'ذكر' },
  { value: 'female', label: 'أنثى' },
]
