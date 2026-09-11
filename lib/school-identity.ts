/**
 * What goes at the head and foot of every official sheet the school prints.
 *
 * The lines are the school's letterhead as printed: the ministry chain above,
 * the contact line below. The logos are files in /public — the school's own
 * mark rendered in its slate tone, and the Ministry of Education mark — so
 * replacing either file changes every sheet without touching code. The
 * school's name and the principal's name are not here — they live in the
 * database, because they are the two things that change.
 */
export const SCHOOL_IDENTITY = {
  country: 'المملكة العربية السعودية',
  ministry: 'وزارة التعليم',
  region: 'إدارة التعليم بمنطقة المدينة المنورة',
  company: 'شركة مدارس الأوس الأهلية',
  companyNote: '(ذات مسؤولية محدودة)',
  city: 'المدينة المنورة',
  website: 'www.Alaws.Edu.sa',
  email: 'Info@alaws.edu.sa',
  phone: '92 0022 999',
  social: 'AlawsEdu',
  /** The Ministry of Education mark. Drop a newer file at this path to replace it. */
  ministryLogo: '/moe-logo.png',
  /** The school's mark in its slate tone on a transparent ground. */
  schoolLogo: '/school-logo.png',
  /** The tone the school prints in — rules, bands and the mark itself. */
  ink: '#3f4a58',
} as const

/** The header chain as lines, right column of the letterhead. */
export const IDENTITY_HEADER_LINES = [
  SCHOOL_IDENTITY.country,
  SCHOOL_IDENTITY.ministry,
  SCHOOL_IDENTITY.region,
  `${SCHOOL_IDENTITY.company} ${SCHOOL_IDENTITY.companyNote}`,
]

/** The footer contacts, in the order the printed letterhead lists them. */
export const IDENTITY_FOOTER_ITEMS = [
  { kind: 'web', text: SCHOOL_IDENTITY.website },
  { kind: 'mail', text: SCHOOL_IDENTITY.email },
  { kind: 'phone', text: SCHOOL_IDENTITY.phone },
  { kind: 'social', text: SCHOOL_IDENTITY.social },
  { kind: 'city', text: SCHOOL_IDENTITY.city },
] as const

export const IDENTITY_FOOTER_LINE = IDENTITY_FOOTER_ITEMS.map((i) => i.text).join('  ·  ')
