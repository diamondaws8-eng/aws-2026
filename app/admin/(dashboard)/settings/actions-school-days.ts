'use server'

import { db } from '@/lib/db'
import {
  schools, schoolHolidays, gradeLevels, classes,
  dailyRecords, lessonRecords, studentPoints, userNotifications,
} from '@/lib/db/schema'
import { eq, and, ne, gte, lte, inArray, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getAdminAccess, canEditGrade, type AdminAccess } from '@/lib/admin-access'
import { logAudit } from '@/lib/audit'
import { isValidDateString, today as schoolToday, formatRangeAr, formatDayGregorianAr } from '@/lib/utils'
import { remoteSuspensionName, isRemoteSuspensionName, isSchoolDay, daysInRange, shiftDate } from '@/lib/school-days'
import { notify, closureAudience, parentReach, withdrawNotificationsForEntity } from '@/lib/notifications'

/**
 * Every export here is a public HTTP endpoint, so each one establishes who is
 * calling and works only on that caller's own school. The capability is
 * canManageSchoolDays, which the principal holds as well — see lib/admin-access.
 */

export type DaysResult = { ok: true } | { ok: false; error: string }

/** A calendar row as the settings screen lists it. */
export type HolidayRow = {
  id: string
  name: string
  startDate: string
  endDate: string
  gradeLevelId: string | null
  kind: string
}

const MAX_HOLIDAYS = 150
const MAX_NAME = 120
const MAX_BULK = 40
const MAX_REASON = 60
const MAX_SUSPENSION_DAYS = 60
const PURGE_LOOKBACK_DAYS = 7

const HOLIDAY_COLUMNS = {
  id: schoolHolidays.id,
  name: schoolHolidays.name,
  startDate: schoolHolidays.startDate,
  endDate: schoolHolidays.endDate,
  gradeLevelId: schoolHolidays.gradeLevelId,
  kind: schoolHolidays.kind,
}

async function requireDaysManager() {
  const access = await getAdminAccess()
  if (!access) return { error: 'غير مصرح بهذا الإجراء' as const, access: null }
  if (!access.canManageSchoolDays) {
    return { error: 'تعديل أيام الدراسة متاح لمدير المدرسة ومدير الجودة ومالك النظام' as const, access: null }
  }
  return { error: null, access }
}

/**
 * Whose calendar a caller may change.
 *
 * Closing the whole school is for whoever answers for all of it; closing one
 * stage is for whoever runs that stage. The principal of one building must not
 * be able to send the other building's pupils home — by a suspension typed at
 * seven in the morning, or by a holiday, which locks the same registers and is
 * announced on the same family page.
 */
function mayChangeCalendar(access: AdminAccess, gradeLevelId: string | null): boolean {
  if (!access.canManageSchoolDays) return false
  if (access.canManageSchoolSettings) return true
  return gradeLevelId ? canEditGrade(access, gradeLevelId) : access.editAllGrades
}

const NOT_YOUR_CALENDAR = 'تقويم كل المدرسة يعدّله من يدير كل المراحل — يمكنك تعديل تقويم مرحلتك فقط'
const NOT_YOUR_STAGE = 'لا تملك صلاحية تعديل تقويم هذه المرحلة'

/** A holiday may not borrow a suspension's name: the name is what every screen reads the day by. */
const RESERVED_NAME = 'هذا الاسم خاص بتعليق الدراسة — سجّل التعليق من بطاقة «تعليق الدراسة الحضورية»'

/**
 * The calendar is read by every portal: the teacher's register locks on a
 * closed day, the family's home page announces it. Each page here is rendered
 * per request anyway, so this only spares the caller a stale view of their own.
 */
function revalidateCalendar() {
  revalidatePath('/admin', 'layout')
  revalidatePath('/teacher', 'layout')
  revalidatePath('/parent', 'layout')
  revalidatePath('/counselor', 'layout')
}

/** A stage id from the browser, honoured only if it is really this school's. */
async function resolveStage(schoolId: string, gradeLevelId: string | null | undefined) {
  if (!gradeLevelId) return { ok: true as const, stage: null }
  const [stage] = await db
    .select({ id: gradeLevels.id, name: gradeLevels.name })
    .from(gradeLevels)
    .where(and(eq(gradeLevels.id, gradeLevelId), eq(gradeLevels.schoolId, schoolId)))
    .limit(1)
  return stage ? { ok: true as const, stage } : { ok: false as const, stage: null }
}

/**
 * The weekly rest. Friday is fixed; only Saturday is anybody's to decide.
 *
 * `gradeLevelId` null sets the school's answer. Naming a stage sets that
 * stage's own — and `on` null there means it has no answer of its own and goes
 * back to following the school, which is where every stage starts.
 */
export async function setSaturdayIsSchoolDay(
  on: boolean | null,
  gradeLevelId?: string | null,
): Promise<DaysResult> {
  const { error, access } = await requireDaysManager()
  if (!access) return { ok: false, error }

  try {
    if (gradeLevelId) {
      const [stage] = await db
        .select({ id: gradeLevels.id, name: gradeLevels.name })
        .from(gradeLevels)
        .where(and(eq(gradeLevels.id, gradeLevelId), eq(gradeLevels.schoolId, access.school.id)))
        .limit(1)
      if (!stage) return { ok: false, error: 'المرحلة غير موجودة' }
      if (!mayChangeCalendar(access, stage.id)) return { ok: false, error: NOT_YOUR_STAGE }

      await db.update(gradeLevels)
        .set({ saturdayIsSchoolDay: on })
        .where(eq(gradeLevels.id, gradeLevelId))

      await logAudit(access, 'settings.update',
        `يوم السبت — ${stage.name}: ${on === null ? 'يتبع المدرسة' : on ? 'يوم دراسة' : 'إجازة'}`)
    } else {
      if (!mayChangeCalendar(access, null)) return { ok: false, error: NOT_YOUR_CALENDAR }
      // The school's own answer is never absent: it is the value stages fall
      // back to, so it stays a plain true/false.
      await db.update(schools)
        .set({ saturdayIsSchoolDay: on === true })
        .where(eq(schools.id, access.school.id))

      await logAudit(access, 'settings.update', on ? 'تشغيل يوم السبت' : 'إيقاف يوم السبت')
    }

    revalidateCalendar()
    return { ok: true }
  } catch (e) {
    console.error('Set Saturday Error:', e)
    return { ok: false, error: 'تعذّر حفظ إعداد يوم السبت' }
  }
}

export async function addSchoolHoliday(input: {
  name: string
  startDate: string
  endDate: string
  /** Null closes the whole school; a stage id closes only that stage. */
  gradeLevelId?: string | null
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { error, access } = await requireDaysManager()
  if (!access) return { ok: false, error }

  const name = String(input?.name ?? '').trim().slice(0, MAX_NAME)
  if (!name) return { ok: false, error: 'اسم الإجازة مطلوب' }
  if (isRemoteSuspensionName(name)) return { ok: false, error: RESERVED_NAME }

  const startDate = String(input?.startDate ?? '').trim()
  const endDate = String(input?.endDate ?? '').trim() || startDate
  if (!isValidDateString(startDate) || !isValidDateString(endDate)) {
    return { ok: false, error: 'التاريخ يجب أن يكون بصيغة YYYY-MM-DD' }
  }
  // A range that ends before it starts silently covers nothing, which looks
  // like the holiday was saved and then ignored.
  if (endDate < startDate) return { ok: false, error: 'تاريخ النهاية قبل تاريخ البداية' }

  try {
    const existing = await db
      .select({ id: schoolHolidays.id })
      .from(schoolHolidays)
      .where(eq(schoolHolidays.schoolId, access.school.id))
    if (existing.length >= MAX_HOLIDAYS) {
      return { ok: false, error: `الحد الأقصى ${MAX_HOLIDAYS} إجازة` }
    }

    const resolved = await resolveStage(access.school.id, input.gradeLevelId)
    if (!resolved.ok) return { ok: false, error: 'المرحلة غير موجودة' }
    const gradeLevelId = resolved.stage?.id ?? null
    if (!mayChangeCalendar(access, gradeLevelId)) {
      return { ok: false, error: gradeLevelId ? NOT_YOUR_STAGE : NOT_YOUR_CALENDAR }
    }

    // The real id goes back to the browser. The list used to show the new row
    // under a made-up id until the next full load, so "delete" on a holiday
    // added a moment ago sent that made-up id here and was refused.
    const [inserted] = await db.insert(schoolHolidays).values({
      schoolId: access.school.id,
      gradeLevelId,
      kind: 'holiday',
      name,
      startDate,
      endDate,
    }).returning({ id: schoolHolidays.id })

    await logAudit(access, 'settings.update', `إضافة إجازة: ${name}`, {
      startDate, endDate, stage: resolved.stage?.name ?? 'كل المدرسة',
    })
    revalidateCalendar()
    return { ok: true, id: inserted.id }
  } catch (e) {
    console.error('Add Holiday Error:', e)
    return { ok: false, error: 'تعذّر إضافة الإجازة' }
  }
}

// ── The whole year in one sitting ────────────────────────────────────────────

export type BulkHolidayInput = { name: string; startDate: string; endDate: string }

export type BulkHolidaysResult =
  | { ok: true; added: HolidayRow[]; skipped: number }
  | { ok: false; error: string }

/**
 * Every holiday of the year, entered together.
 *
 * Adding them one at a time meant somebody had to remember each holiday the
 * week it arrived — and the one nobody remembered became a day the dashboard
 * called neglected. The ministry announces the year in advance, so it can be
 * typed once, in August, and left alone.
 *
 * One call rather than a loop of single adds: the rows are checked together
 * and written together, so a mistake on the ninth line saves nothing instead
 * of saving eight, and the log gets one line, not ten.
 */
export async function addSchoolHolidaysBulk(input: {
  items: BulkHolidayInput[]
  gradeLevelId?: string | null
}): Promise<BulkHolidaysResult> {
  const { error, access } = await requireDaysManager()
  if (!access) return { ok: false, error }

  const raw = Array.isArray(input?.items) ? input.items : []
  if (raw.length === 0) return { ok: false, error: 'لم تُحدَّد أي إجازة' }
  if (raw.length > MAX_BULK) return { ok: false, error: `الحد الأقصى ${MAX_BULK} إجازة في المرة الواحدة` }

  const cleaned: BulkHolidayInput[] = []
  for (let i = 0; i < raw.length; i++) {
    const name = String(raw[i]?.name ?? '').trim().slice(0, MAX_NAME)
    const startDate = String(raw[i]?.startDate ?? '').trim()
    const endDate = String(raw[i]?.endDate ?? '').trim() || startDate
    const line = `السطر ${i + 1}${name ? ` (${name})` : ''}`
    if (!name) return { ok: false, error: `${line}: اسم الإجازة مطلوب` }
    if (isRemoteSuspensionName(name)) return { ok: false, error: `${line}: ${RESERVED_NAME}` }
    if (!isValidDateString(startDate) || !isValidDateString(endDate)) {
      return { ok: false, error: `${line}: التاريخ غير صالح` }
    }
    if (endDate < startDate) return { ok: false, error: `${line}: تاريخ النهاية قبل تاريخ البداية` }
    cleaned.push({ name, startDate, endDate })
  }

  try {
    const schoolId = access.school.id
    const resolved = await resolveStage(schoolId, input.gradeLevelId)
    if (!resolved.ok) return { ok: false, error: 'المرحلة غير موجودة' }
    const gradeLevelId = resolved.stage?.id ?? null
    if (!mayChangeCalendar(access, gradeLevelId)) {
      return { ok: false, error: gradeLevelId ? NOT_YOUR_STAGE : NOT_YOUR_CALENDAR }
    }

    const existing = await db
      .select({
        startDate: schoolHolidays.startDate,
        endDate: schoolHolidays.endDate,
        gradeLevelId: schoolHolidays.gradeLevelId,
        kind: schoolHolidays.kind,
      })
      .from(schoolHolidays)
      .where(eq(schoolHolidays.schoolId, schoolId))

    // A range already on file for the same calendar is left alone whatever it
    // was called there, so pressing the button twice does not double the year.
    const onFile = new Set(
      existing
        .filter((e) => (e.gradeLevelId ?? null) === gradeLevelId && e.kind !== 'remote')
        .map((e) => `${e.startDate}|${e.endDate}`),
    )
    const fresh = cleaned.filter((c) => {
      const key = `${c.startDate}|${c.endDate}`
      if (onFile.has(key)) return false
      onFile.add(key)
      return true
    })
    const skipped = cleaned.length - fresh.length
    if (fresh.length === 0) return { ok: true, added: [], skipped }

    if (existing.length + fresh.length > MAX_HOLIDAYS) {
      return { ok: false, error: `الحد الأقصى ${MAX_HOLIDAYS} إجازة — احذف إجازات الأعوام السابقة أولاً` }
    }

    const added = await db
      .insert(schoolHolidays)
      .values(fresh.map((f) => ({ schoolId, gradeLevelId, kind: 'holiday', ...f })))
      .returning(HOLIDAY_COLUMNS)

    await logAudit(access, 'settings.update', 'إضافة إجازات دفعة واحدة', {
      count: added.length,
      skipped,
      stage: resolved.stage?.name ?? 'كل المدرسة',
    })
    revalidateCalendar()
    return { ok: true, added: added.sort((a, b) => a.startDate.localeCompare(b.startDate)), skipped }
  } catch (e) {
    console.error('Bulk Holidays Error:', e)
    return { ok: false, error: 'تعذّر حفظ الإجازات — لم يُحفظ منها شيء' }
  }
}

export async function deleteSchoolHoliday(id: string): Promise<DaysResult> {
  const { error, access } = await requireDaysManager()
  if (!access) return { ok: false, error }

  try {
    // Scoped to this school: an id from the browser proves nothing on its own.
    // A suspension is not removed from here — the people who were told about
    // it are owed a correction, which endStudySuspension sends.
    const [row] = await db
      .select({ id: schoolHolidays.id, name: schoolHolidays.name, gradeLevelId: schoolHolidays.gradeLevelId })
      .from(schoolHolidays)
      .where(and(
        eq(schoolHolidays.id, String(id ?? '')),
        eq(schoolHolidays.schoolId, access.school.id),
        ne(schoolHolidays.kind, 'remote'),
      ))
      .limit(1)
    if (!row) return { ok: false, error: 'الإجازة غير موجودة' }
    if (!mayChangeCalendar(access, row.gradeLevelId)) {
      return { ok: false, error: row.gradeLevelId ? NOT_YOUR_STAGE : NOT_YOUR_CALENDAR }
    }

    await db.delete(schoolHolidays).where(eq(schoolHolidays.id, row.id))

    await logAudit(access, 'settings.update', `حذف إجازة: ${row.name}`)
    revalidateCalendar()
    return { ok: true }
  } catch (e) {
    console.error('Delete Holiday Error:', e)
    return { ok: false, error: 'تعذّر حذف الإجازة' }
  }
}

// ── Suspending in-person study (lessons from home) ───────────────────────────

export type ExistingRecords = { attendance: number; lessons: number; points: number; days: number }

export type SuspensionInput = {
  startDate: string
  endDate: string
  /** Null suspends the whole school; a stage id suspends that stage only. */
  gradeLevelId: string | null
  reason?: string
  /** Tell the families and the staff concerned through the bell. */
  notifyPeople: boolean
  /**
   * What becomes of attendance already saved inside the range. 'ask' writes
   * nothing when there is any and reports it, so the choice is made knowingly.
   */
  existing: 'ask' | 'keep' | 'purge'
  /** The caller has confirmed that a range starting before today is meant. */
  allowPast?: boolean
}

export type SuspensionResult =
  | {
      ok: true
      holiday: HolidayRow
      /** Whether a notice was attempted at all — a period already over is filed without one. */
      announced: boolean
      notified: number
      unreachable: number
      purged: ExistingRecords | null
    }
  | { ok: false; error: string; existing?: ExistingRecords; canPurge?: boolean; past?: boolean }

export type EndSuspensionResult =
  | { ok: true; removed: boolean; endDate: string | null; resumeDate: string | null; notified: number; unreachable: number }
  | { ok: false; error: string }

/** What the register already holds inside a range, for the school or one stage's classes. */
async function recordsInRange(
  schoolId: string,
  classIds: string[] | null,
  from: string,
  to: string,
): Promise<ExistingRecords> {
  if (classIds && classIds.length === 0) return { attendance: 0, lessons: 0, points: 0, days: 0 }
  const n = sql<number>`count(*)`.mapWith(Number)
  const [[a], [l], [p]] = await Promise.all([
    db.select({ n, days: sql<number>`count(distinct ${dailyRecords.date})`.mapWith(Number) })
      .from(dailyRecords)
      .where(and(
        eq(dailyRecords.schoolId, schoolId), gte(dailyRecords.date, from), lte(dailyRecords.date, to),
        classIds ? inArray(dailyRecords.classId, classIds) : undefined,
      )),
    db.select({ n })
      .from(lessonRecords)
      .where(and(
        eq(lessonRecords.schoolId, schoolId), gte(lessonRecords.date, from), lte(lessonRecords.date, to),
        classIds ? inArray(lessonRecords.classId, classIds) : undefined,
      )),
    db.select({ n })
      .from(studentPoints)
      .where(and(
        eq(studentPoints.schoolId, schoolId), gte(studentPoints.date, from), lte(studentPoints.date, to),
        classIds ? inArray(studentPoints.classId, classIds) : undefined,
      )),
  ])
  return { attendance: a?.n ?? 0, lessons: l?.n ?? 0, points: p?.n ?? 0, days: a?.days ?? 0 }
}

type Told = { sent: number; unreachable: number }
const NOBODY: Told = { sent: 0, unreachable: 0 }

/**
 * Put a closure notice in the bell of everyone it concerns, and say how many
 * it was written for — and how many of those cannot see it. A parent still on
 * the starter password gets the "choose a password" screen in place of the
 * portal, bell included; a principal told that 305 people were notified does
 * not then send the WhatsApp message that would actually have reached them.
 *
 * Never throws: by the time anybody is told, the calendar has already changed,
 * and the caller must still report that it did.
 */
async function tellAudience(
  access: AdminAccess,
  gradeLevelId: string | null,
  notice: { title: string; body: string; entityId: string | null },
): Promise<Told> {
  try {
    const audience = await closureAudience(access.school.id, gradeLevelId, access.userId)
    const sent = await notify(audience.map((a) => ({
      schoolId: access.school.id,
      recipientUserId: a.userId,
      kind: 'study_suspended' as const,
      title: notice.title,
      body: notice.body,
      href: a.href,
      entityId: notice.entityId,
      actorName: access.name,
    })))
    if (sent === 0) return NOBODY
    const parents = audience.filter((a) => a.href === '/parent/notifications').map((a) => a.userId)
    const reach = await parentReach(access.school.id, parents)
    return { sent, unreachable: reach.total - reach.reachable }
  } catch (e) {
    console.error('Closure notice failed:', e)
    return NOBODY
  }
}

/**
 * Suspend in-person study for a range of days.
 *
 * The range is filed in the same table as the holidays, which is what makes it
 * behave like one everywhere without a second rule to keep in step: the
 * register refuses to be saved on it, it is never counted as an unrecorded
 * day, and no pupil is present or absent on it.
 *
 * The one thing a holiday entered in advance never meets is a register that
 * was already taken. A suspension can be declared at ten in the morning, after
 * the first lesson was marked — and those rows would go on counting for the
 * classes that were quick and not for the ones that were slow. So when there
 * are any, nothing is written until the caller has seen the numbers and said
 * whether they stay or go.
 */
export async function declareStudySuspension(input: SuspensionInput): Promise<SuspensionResult> {
  const { error, access } = await requireDaysManager()
  if (!access) return { ok: false, error }

  const startDate = String(input?.startDate ?? '').trim()
  const endDate = String(input?.endDate ?? '').trim() || startDate
  if (!isValidDateString(startDate) || !isValidDateString(endDate)) {
    return { ok: false, error: 'التاريخ يجب أن يكون بصيغة YYYY-MM-DD' }
  }
  if (endDate < startDate) return { ok: false, error: 'تاريخ النهاية قبل تاريخ البداية' }
  if (daysInRange(startDate, endDate) > MAX_SUSPENSION_DAYS) {
    return { ok: false, error: `أقصى مدة للتعليق الواحد ${MAX_SUSPENSION_DAYS} يوماً — لمدة أطول أضِف فترة ثانية` }
  }
  const reason = String(input?.reason ?? '').trim().slice(0, MAX_REASON)
  const mode = input?.existing === 'keep' || input?.existing === 'purge' ? input.existing : 'ask'

  try {
    const schoolId = access.school.id
    const resolved = await resolveStage(schoolId, input?.gradeLevelId)
    if (!resolved.ok) return { ok: false, error: 'المرحلة غير موجودة' }
    const gradeLevelId = resolved.stage?.id ?? null
    const stageName = resolved.stage?.name ?? null

    if (!mayChangeCalendar(access, gradeLevelId)) {
      return {
        ok: false,
        error: gradeLevelId
          ? 'لا تملك صلاحية تعليق الدراسة في هذه المرحلة'
          : 'تعليق الدراسة لكل المدرسة متاح لمن يدير كل المراحل — اختر مرحلتك',
      }
    }

    // The form opens on "today" as the page knew it. A settings tab left open
    // overnight still says yesterday, and one press would file — and announce,
    // and perhaps empty — the wrong day. The school's own date is the judge: a
    // range that starts before it has to be confirmed as meant.
    const today = schoolToday()
    if (startDate < today && !input?.allowPast) {
      return {
        ok: false,
        error: `تاريخ البداية ${formatDayGregorianAr(startDate, true)} يوم مضى — أكِّد أنه المقصود`,
        past: true,
      }
    }

    const onFile = await db
      .select({
        startDate: schoolHolidays.startDate,
        endDate: schoolHolidays.endDate,
        gradeLevelId: schoolHolidays.gradeLevelId,
        kind: schoolHolidays.kind,
      })
      .from(schoolHolidays)
      .where(eq(schoolHolidays.schoolId, schoolId))
    if (onFile.length >= MAX_HOLIDAYS) {
      return { ok: false, error: `الحد الأقصى ${MAX_HOLIDAYS} فترة في التقويم — احذف فترات الأعوام السابقة أولاً` }
    }
    // No two suspensions may cover the same day for the same pupils. Pressing
    // the button twice would file the day twice and tell every family twice —
    // and, worse, lifting one of two overlapping rows would announce that
    // study is back in the building while the other still keeps it closed.
    // A suspension is extended by adding the new days as a period of their own.
    const clash = onFile.find((h) =>
      h.kind === 'remote'
      && (h.gradeLevelId === null || gradeLevelId === null || h.gradeLevelId === gradeLevelId)
      && h.startDate <= endDate && h.endDate >= startDate)
    if (clash) {
      const whose = clash.gradeLevelId === null ? 'لكل المدرسة' : gradeLevelId === null ? 'لإحدى المراحل' : 'لهذه المرحلة'
      return {
        ok: false,
        error: `الدراسة معلَّقة بالفعل ${whose} ${formatRangeAr(clash.startDate, clash.endDate, true)} — لتمديد التعليق أضِف الأيام الجديدة وحدها`
          + (gradeLevelId === null && clash.gradeLevelId !== null ? '، ولتعليق بقية المراحل في الأيام نفسها علِّق كل مرحلة على حدة' : '')
          + '، ولتغييره احذفه من «فترات التعليق» أولاً',
      }
    }

    const classIds = gradeLevelId
      ? (await db
          .select({ id: classes.id })
          .from(classes)
          .where(and(eq(classes.schoolId, schoolId), eq(classes.gradeLevelId, gradeLevelId)))
        ).map((c) => c.id)
      : null

    const found = await recordsInRange(schoolId, classIds, startDate, endDate)
    const hasRecords = found.attendance + found.lessons + found.points > 0
    // Deleting is offered only for a suspension that starts now or lately. A
    // start date mistyped a month back must not be able to take a month of
    // the register with it.
    const canPurge = startDate >= shiftDate(today, -PURGE_LOOKBACK_DAYS)

    if (hasRecords && mode === 'ask') {
      return {
        ok: false,
        error: 'يوجد حضور مسجَّل داخل هذه الفترة — اختر ما يُفعل به',
        existing: found,
        canPurge,
      }
    }
    if (hasRecords && mode === 'purge' && !canPurge) {
      return {
        ok: false,
        error: `حذف السجلات متاح لتعليق يبدأ خلال آخر ${PURGE_LOOKBACK_DAYS} أيام فقط — اختر الإبقاء على ما سُجِّل`,
        existing: found,
        canPurge,
      }
    }

    const name = remoteSuspensionName(reason)
    const purge = hasRecords && mode === 'purge'

    // The rows go and the suspension arrives together or not at all: a range
    // emptied of its register but still open for recording would be the
    // worst of both.
    let clearedToday: string[] = []
    const holiday = await db.transaction(async (tx) => {
      if (purge) {
        const gone = await tx.delete(dailyRecords).where(and(
          eq(dailyRecords.schoolId, schoolId), gte(dailyRecords.date, startDate), lte(dailyRecords.date, endDate),
          classIds ? inArray(dailyRecords.classId, classIds) : undefined,
        )).returning({ studentId: dailyRecords.studentId, date: dailyRecords.date })
        clearedToday = [...new Set(gone.filter((g) => g.date === today).map((g) => g.studentId))]
        await tx.delete(lessonRecords).where(and(
          eq(lessonRecords.schoolId, schoolId), gte(lessonRecords.date, startDate), lte(lessonRecords.date, endDate),
          classIds ? inArray(lessonRecords.classId, classIds) : undefined,
        ))
        await tx.delete(studentPoints).where(and(
          eq(studentPoints.schoolId, schoolId), gte(studentPoints.date, startDate), lte(studentPoints.date, endDate),
          classIds ? inArray(studentPoints.classId, classIds) : undefined,
        ))
      }
      const [row] = await tx
        .insert(schoolHolidays)
        .values({ schoolId, gradeLevelId, kind: 'remote', name, startDate, endDate })
        .returning(HOLIDAY_COLUMNS)
      return row
    })

    // The suspension is on file from here on. Everything below is best-effort:
    // a failure to reach people must not come back as "nothing changed" when
    // the register has already been closed — and possibly emptied.

    // A family told at half past seven that their child was absent keeps that
    // notice after the register it came from is gone. It is taken back: the
    // day now has no absences, and the notice asks them to send an excuse.
    if (clearedToday.length) {
      try {
        await db.delete(userNotifications).where(and(
          eq(userNotifications.schoolId, schoolId),
          inArray(userNotifications.kind, ['absence', 'attendance_corrected']),
          inArray(userNotifications.entityId, clearedToday),
          sql`${userNotifications.createdAt} AT TIME ZONE 'Asia/Riyadh' >= date_trunc('day', now() AT TIME ZONE 'Asia/Riyadh')`,
        ))
      } catch (e) {
        console.error('Absence notice withdrawal failed:', e)
      }
    }

    // A period that is already over is filed for the record and announced to
    // nobody: a notice in the present tense about last week's rain is noise,
    // and it could not be withdrawn afterwards.
    let told = NOBODY
    const announced = !!input?.notifyPeople && endDate >= today
    if (announced) {
      const body =
        `تُعلَّق الدراسة الحضورية ${formatRangeAr(startDate, endDate)}${stageName ? ` لطلاب ${stageName}` : ''}، وتكون الدراسة عن بُعد.`
        + `${reason ? ` السبب: ${reason}.` : ''}`
        // What was recorded before the suspension may have been kept, and a
        // family that sees this morning's absence still listed must not have
        // been told there are none.
        + (hasRecords && !purge
          ? ' ما سُجِّل من حضور وغياب قبل إعلان التعليق يبقى كما هو، ولا يُسجَّل جديد في هذه الفترة.'
          : ' لا يُسجَّل حضور ولا غياب في هذه الفترة.')
      // The suspension's own id: lifting it takes the notice back out of every
      // bell it went into.
      told = await tellAudience(access, gradeLevelId, {
        title: 'تعليق الدراسة الحضورية — الدراسة عن بُعد',
        body,
        entityId: holiday.id,
      })
    }

    await logAudit(access, 'calendar.suspend', name, {
      startDate,
      endDate,
      stage: stageName ?? 'كل المدرسة',
      notified: told.sent,
      ...(told.unreachable ? { unreachable: told.unreachable } : {}),
      ...(purge ? { purgedAttendance: found.attendance, purgedLessons: found.lessons, purgedPoints: found.points } : {}),
    })
    revalidateCalendar()
    return { ok: true, holiday, announced, notified: told.sent, unreachable: told.unreachable, purged: purge ? found : null }
  } catch (e) {
    console.error('Declare Suspension Error:', e)
    return { ok: false, error: 'تعذّر تعليق الدراسة — لم يتغير شيء' }
  }
}

/**
 * The first teaching day after `after` on the calendar a suspension belongs
 * to, read as though that suspension were not there.
 */
async function nextSchoolDayWithout(schoolId: string, row: HolidayRow, after: string): Promise<string | null> {
  const [[school], stageRows, rows] = await Promise.all([
    db.select({ sat: schools.saturdayIsSchoolDay }).from(schools).where(eq(schools.id, schoolId)).limit(1),
    row.gradeLevelId
      ? db.select({ sat: gradeLevels.saturdayIsSchoolDay }).from(gradeLevels)
          .where(eq(gradeLevels.id, row.gradeLevelId)).limit(1)
      : Promise.resolve([] as { sat: boolean | null }[]),
    db.select(HOLIDAY_COLUMNS).from(schoolHolidays).where(eq(schoolHolidays.schoolId, schoolId)),
  ])
  const cfg = {
    saturdayIsSchoolDay: stageRows[0]?.sat ?? school?.sat ?? false,
    holidays: rows.filter((h) =>
      h.id !== row.id && (h.gradeLevelId === null || h.gradeLevelId === row.gradeLevelId)),
  }
  // Bounded: a calendar closed for months on end has no "next" worth waiting for.
  for (let i = 1; i <= 90; i++) {
    const day = shiftDate(after, i)
    if (isSchoolDay(day, cfg)) return day
  }
  return null
}

/**
 * Lift a suspension, or cut it short.
 *
 * 'today' — lessons are back in the building from today: the days already
 * spent at home stay suspended, and today's register opens. 'next-school-day'
 * — today stays at home and lessons return on the next teaching day. Either
 * day is worked out here, from the school's own date and calendar: the
 * browser's idea of "tomorrow" is a Friday every Thursday, and yesterday's
 * tomorrow in a tab left open overnight — and whatever day is named goes out
 * to every family. Without a mode the suspension is removed whole.
 *
 * Whoever was told the school was closed is told it is open again. A notice
 * quietly withdrawn leaves a family keeping a child at home on a school day.
 */
export async function endStudySuspension(
  id: string,
  mode?: 'today' | 'next-school-day' | null,
): Promise<EndSuspensionResult> {
  const { error, access } = await requireDaysManager()
  if (!access) return { ok: false, error }
  // Anything unrecognised must not fall through to "remove it whole": that
  // path reopens every day of the suspension and tells every family so.
  if (mode != null && mode !== 'today' && mode !== 'next-school-day') return { ok: false, error: 'طلب غير صالح' }

  try {
    const schoolId = access.school.id
    const [row] = await db
      .select(HOLIDAY_COLUMNS)
      .from(schoolHolidays)
      .where(and(
        eq(schoolHolidays.id, String(id ?? '')),
        eq(schoolHolidays.schoolId, schoolId),
        eq(schoolHolidays.kind, 'remote'),
      ))
      .limit(1)
    if (!row) return { ok: false, error: 'فترة التعليق غير موجودة' }
    if (!mayChangeCalendar(access, row.gradeLevelId)) {
      return { ok: false, error: 'لا تملك صلاحية تعديل هذا التعليق' }
    }

    let stageName: string | null = null
    if (row.gradeLevelId) {
      const [stage] = await db
        .select({ name: gradeLevels.name })
        .from(gradeLevels)
        .where(eq(gradeLevels.id, row.gradeLevelId))
        .limit(1)
      stageName = stage?.name ?? null
    }
    const forWhom = stageName ? ` لطلاب ${stageName}` : ''
    const today = schoolToday()

    // A suspension that began today has no earlier days to keep: returning
    // today is simply removing it.
    const cut = mode === 'today' && today === row.startDate ? null : mode === 'today' || mode === 'next-school-day' ? mode : null

    // ── Cut short: the days already spent at home stay suspended ──
    if (cut) {
      if (today < row.startDate) return { ok: false, error: 'هذا التعليق لم يبدأ بعد — احذفه إن أردت إلغاءه' }
      if (today > row.endDate) return { ok: false, error: 'هذا التعليق انتهى بالفعل' }
      // 'today' means the first teaching day from today on: pressed on a
      // Friday it is Sunday, and the notice must not announce a day in the
      // building when nobody is going to one.
      const resume = await nextSchoolDayWithout(schoolId, row, cut === 'today' ? shiftDate(today, -1) : today)
      if (!resume || resume > row.endDate) {
        return { ok: false, error: 'التعليق ينتهي أصلاً قبل أول يوم دراسي قادم — لا حاجة لإنهائه' }
      }
      const newEnd = shiftDate(resume, -1)
      await db.update(schoolHolidays).set({ endDate: newEnd }).where(eq(schoolHolidays.id, row.id))

      // Only those who were told it was closed are told it reopens early. If
      // that cannot be established, they are told anyway: an unneeded notice
      // costs a glance, a missing one keeps a child at home.
      let wasAnnounced = true
      try {
        const [told] = await db
          .select({ n: sql<number>`count(*)`.mapWith(Number) })
          .from(userNotifications)
          .where(and(eq(userNotifications.schoolId, schoolId), eq(userNotifications.entityId, row.id)))
        wasAnnounced = (told?.n ?? 0) > 0
      } catch (e) {
        console.error('Suspension notice lookup failed:', e)
      }
      const told = wasAnnounced
        ? await tellAudience(access, row.gradeLevelId, {
            title: 'عودة الدراسة الحضورية',
            body: resume === today
              ? `انتهى تعليق الدراسة الحضورية${forWhom}، والدراسة حضورية من اليوم ${formatDayGregorianAr(resume)}.`
              : `ينتهي تعليق الدراسة الحضورية${forWhom} مبكراً، وتعود الدراسة حضورياً ${formatDayGregorianAr(resume)}.`,
            entityId: row.id,
          })
        : NOBODY

      await logAudit(access, 'calendar.suspendCancel', `إنهاء مبكر: ${row.name}`, {
        startDate: row.startDate, endDate: newEnd, stage: stageName ?? 'كل المدرسة', notified: told.sent,
      })
      revalidateCalendar()
      return { ok: true, removed: false, endDate: newEnd, resumeDate: resume, notified: told.sent, unreachable: told.unreachable }
    }

    // ── Remove whole ──
    await db.delete(schoolHolidays).where(eq(schoolHolidays.id, row.id))

    // A suspension that is over is history, and its notice stays where it was
    // read. One still running or still ahead is taken back — and corrected.
    let told = NOBODY
    if (row.endDate >= today) {
      // Null means the withdrawal itself failed, so the old notices may still
      // be sitting in every bell — all the more reason to send the correction.
      const withdrawn = await withdrawNotificationsForEntity(schoolId, row.id)
      if (withdrawn === null || withdrawn > 0) {
        told = await tellAudience(access, row.gradeLevelId, {
          title: 'إلغاء تعليق الدراسة الحضورية',
          body: `أُلغي تعليق الدراسة الحضورية ${formatRangeAr(row.startDate, row.endDate)}${forWhom}. الدراسة حضورية كالمعتاد.`,
          entityId: null,
        })
      }
    }

    await logAudit(access, 'calendar.suspendCancel', row.name, {
      startDate: row.startDate, endDate: row.endDate, stage: stageName ?? 'كل المدرسة', notified: told.sent,
    })
    revalidateCalendar()
    return { ok: true, removed: true, endDate: null, resumeDate: null, notified: told.sent, unreachable: told.unreachable }
  } catch (e) {
    console.error('End Suspension Error:', e)
    return { ok: false, error: 'تعذّر إلغاء التعليق' }
  }
}

// The reader lives in lib/school-holidays.ts, not here. An export from a
// 'use server' file is a public HTTP endpoint, and one taking a schoolId would
// hand any caller who knows an id that school's calendar.
