/**
 * The activation invitation — text and substitution only, no database import.
 *
 * Written on the server, edited and filled in the browser, so this file stays
 * pure data like lib/case-status.ts.
 */

/**
 * The password every parent account was issued with.
 *
 * It is not a secret and never was: /parent/login prints it on the page for
 * anyone to read. That is precisely why this campaign exists — the account is
 * open to whoever knows a family's phone number until the family replaces it.
 * Repeating it in the invitation therefore gives nothing away; withholding it
 * would only stop the parent from getting in.
 */
export const INITIAL_PARENT_PASSWORD = '12345678'

export const ACTIVATION_VARS = [
  { token: '{student}', label: 'اسم الطالب (أو أسماء الأبناء)' },
  { token: '{phone}', label: 'رقم جوال ولي الأمر' },
  { token: '{password}', label: 'كلمة المرور المبدئية' },
  { token: '{link}', label: 'رابط بوابة ولي الأمر' },
  { token: '{school}', label: 'اسم المدرسة' },
] as const

export const MAX_ACTIVATION_MESSAGE = 1500

/**
 * Says what to do, in what order, and why it matters — a message that only says
 * "فعّل حسابك" gets ignored, and one that hides the password gets a phone call
 * back to the school instead of an activation.
 */
export const DEFAULT_ACTIVATION_MESSAGE = `السلام عليكم ورحمة الله وبركاته
حيّاكم الله، ولي أمر الطالب: {student}

{school} تتيح لكم متابعة ابنكم أولاً بأول من بوابة ولي الأمر: الحضور والغياب، والدرجات، وملاحظات المعلمين، وأي رسالة من المدرسة.

خطوات الدخول:
١) افتحوا الرابط: {link}
٢) رقم الجوال: {phone}
٣) كلمة المرور المبدئية: {password}
٤) سيطلب منكم النظام اختيار كلمة مرور خاصة بكم — اختاروها واحفظوها.

الخطوة الرابعة مهمة: كلمة المرور المبدئية واحدة لدى الجميع، وحساب ابنكم يبقى مفتوحاً لغيركم حتى تغيّروها. كما أن إشعارات المدرسة لن تصلكم قبل إتمامها.

وفقكم الله ووفق أبناءكم.`

/** An unknown token is left as written so a typo shows itself instead of vanishing. */
export function applyActivationMessage(
  template: string,
  vars: { student: string; phone: string; password: string; link: string; school: string },
): string {
  return template.replace(
    /\{(student|phone|password|link|school)\}/g,
    (token, key: string) => (vars as Record<string, string>)[key] || token,
  )
}

/** Any spelling of a Saudi mobile reduced to the form wa.me expects. */
export function toMsisdn(raw: string | null | undefined): string {
  const d = (raw ?? '').replace(/\D/g, '')
  if (!d) return ''
  if (d.startsWith('966')) return d
  if (d.startsWith('0')) return `966${d.slice(1)}`
  return `966${d}`
}

export function waLink(phone: string | null | undefined, text: string): string | null {
  const msisdn = toMsisdn(phone)
  return msisdn ? `https://wa.me/${msisdn}?text=${encodeURIComponent(text)}` : null
}
