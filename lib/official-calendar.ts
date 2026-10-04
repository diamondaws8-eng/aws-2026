/**
 * The ministry's published school calendar, as suggestions — no database import.
 *
 * A principal should not have to remember to type in each holiday the week it
 * arrives. The ministry announces the whole year in advance, so the year can be
 * entered in one sitting.
 *
 * These are suggestions and nothing more. They pre-fill a form the school
 * reviews before saving, every date stays editable there, and nothing here is
 * ever written to the database on its own: education departments move single
 * days, and the Hajj cities keep a calendar of their own. An entry the sources
 * did not agree on is marked `review` so the form asks for it to be checked
 * against the department's circular rather than trusted.
 *
 * Ranges are inclusive and written as announced, weekend included — the return
 * day is the day after `endDate`.
 */

export type CalendarRegion = 'general' | 'hajj'

export const CALENDAR_REGION_LABELS: Record<CalendarRegion, string> = {
  general: 'التقويم العام',
  hajj: 'مكة المكرمة والمدينة المنورة وجدة والطائف',
}

export type OfficialHoliday = {
  name: string
  startDate: string
  endDate: string
  /** Announced by the education department rather than the ministry, or unconfirmed. */
  review?: boolean
}

export type OfficialCalendar = {
  /** First day of study for pupils. */
  studyStart: string
  holidays: OfficialHoliday[]
}

const SHARED_1448: OfficialHoliday[] = [
  { name: 'إجازة اليوم الوطني', startDate: '2026-09-23', endDate: '2026-09-26' },
  { name: 'إجازة إضافية (نهاية أسبوع مطوّلة)', startDate: '2026-10-25', endDate: '2026-10-25', review: true },
  { name: 'إجازة الخريف', startDate: '2026-11-20', endDate: '2026-11-28' },
  { name: 'إجازة منتصف العام الدراسي', startDate: '2027-01-08', endDate: '2027-01-16' },
  { name: 'إجازة يوم التأسيس', startDate: '2027-02-19', endDate: '2027-02-22' },
  { name: 'إجازة عيد الفطر', startDate: '2027-02-26', endDate: '2027-03-13' },
]

const byStart = (a: OfficialHoliday, b: OfficialHoliday) => a.startDate.localeCompare(b.startDate)

const CALENDARS: Record<string, Record<CalendarRegion, OfficialCalendar>> = {
  '1448': {
    general: {
      studyStart: '2026-08-23',
      holidays: [
        ...SHARED_1448,
        { name: 'إجازة إضافية', startDate: '2026-11-29', endDate: '2026-11-29', review: true },
        { name: 'إجازة إضافية', startDate: '2027-01-07', endDate: '2027-01-07', review: true },
        { name: 'إجازة إضافية (نهاية أسبوع مطوّلة)', startDate: '2027-04-11', endDate: '2027-04-11', review: true },
        { name: 'إجازة عيد الأضحى', startDate: '2027-05-07', endDate: '2027-05-22' },
      ].sort(byStart),
    },
    hajj: {
      studyStart: '2026-08-30',
      holidays: [
        ...SHARED_1448,
        { name: 'إجازة عيد الأضحى', startDate: '2027-04-30', endDate: '2027-05-22' },
      ].sort(byStart),
    },
  },
}

/** Western and Arabic-Indic digits alike, so «١٤٤٨هـ» finds the same year as «1448». */
function yearKey(academicYear: string | null | undefined): string {
  return String(academicYear ?? '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/\D/g, '')
    .slice(0, 4)
}

/** The published calendar for a year, or null when none has been entered here. */
export function officialCalendarFor(
  academicYear: string | null | undefined,
  region: CalendarRegion,
): OfficialCalendar | null {
  return CALENDARS[yearKey(academicYear)]?.[region] ?? null
}

/** Which calendar a school in this city follows. */
export function calendarRegionForCity(city: string | null | undefined): CalendarRegion {
  const c = String(city ?? '')
  return /مكة|المدينة|جدة|جدّة|الطائف/.test(c) ? 'hajj' : 'general'
}
