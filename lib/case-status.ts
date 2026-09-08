/**
 * Status labels only — no database imports.
 *
 * These are needed in the counsellor's browser screen as well as on the server.
 * Keeping them in lib/behavior-cases.ts pulled the Postgres driver into the
 * client bundle, which fails the build outright.
 */
export const CASE_STATUS = {
  open: 'قيد المراجعة',
  resolved_privately: 'عولجت مع الطالب',
  parent_informed: 'أُبلغ ولي الأمر',
  escalated: 'مصعّدة للوكيل',
  admin_handled: 'عالجتها الإدارة',
  dismissed: 'أُغلقت — لا يوجد ما يستدعي',
} as const

export type CaseStatus = keyof typeof CASE_STATUS
export const isCaseStatus = (v: string): v is CaseStatus => v in CASE_STATUS

/** A case nobody has opened after this long is surfaced to the administration. */
export const STALE_AFTER_DAYS = 2
