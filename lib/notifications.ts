import { db } from '@/lib/db'
import { userNotifications, schoolStaff, students, classes, teachers, user, schools } from '@/lib/db/schema'
import { eq, and, desc, isNull, inArray, sql } from 'drizzle-orm'

/**
 * Every kind of thing that can land in somebody's bell.
 *
 * The kind is what the screen styles on; the title and body are written at the
 * moment the event happens, because a notification rendered from live data
 * would change meaning after the fact — "case decided" must keep saying what
 * was decided then, not what the row says now.
 */
export const NOTIFICATION_KINDS = {
  announcement: { label: 'تنبيه من الإدارة', icon: 'bell', tone: 'blue' },
  case_raised: { label: 'حالة سلوكية جديدة', icon: 'alert', tone: 'amber' },
  case_decided: { label: 'قرار في حالة رفعتَها', icon: 'check', tone: 'emerald' },
  case_escalated: { label: 'حالة محالة إليك', icon: 'up', tone: 'violet' },
  case_returned: { label: 'حالة أُعيدت إليك', icon: 'undo', tone: 'amber' },
  parent_informed: { label: 'ملاحظة بخصوص ابنك', icon: 'message', tone: 'rose' },
  absence: { label: 'غياب', icon: 'userx', tone: 'red' },
} as const

export type NotificationKind = keyof typeof NOTIFICATION_KINDS
export const isNotificationKind = (v: string): v is NotificationKind => v in NOTIFICATION_KINDS

export type NewNotification = {
  schoolId: string
  recipientUserId: string
  kind: NotificationKind
  title: string
  body?: string | null
  href?: string | null
  entityId?: string | null
  actorName?: string | null
}

/**
 * Writing a notification must never break what caused it. A case decision that
 * rolled back because a bell entry failed would be far worse than a missing
 * bell entry, so this swallows its own errors the way the audit log does.
 */
export async function notify(entries: NewNotification[]): Promise<number> {
  const rows = entries.filter((e) => e.recipientUserId && e.schoolId)
  if (rows.length === 0) return 0
  try {
    await db.insert(userNotifications).values(
      rows.map((e) => ({
        schoolId: e.schoolId,
        recipientUserId: e.recipientUserId,
        kind: e.kind,
        title: e.title.slice(0, 200),
        body: e.body ? e.body.slice(0, 1000) : null,
        href: e.href ?? null,
        entityId: e.entityId ?? null,
        actorName: e.actorName ?? null,
      })),
    )
    return rows.length
  } catch (error) {
    console.error('Notification write failed:', error)
    return 0
  }
}

// ─── Recipient lookups ────────────────────────────────────────────────────────

/**
 * The counsellors responsible for a pupil's stage. There may be several, or —
 * before the admin has appointed one — none at all, which is why every caller
 * treats an empty list as normal rather than an error.
 */
export async function counselorsForClass(schoolId: string, classId: string): Promise<string[]> {
  const [cls] = await db
    .select({ gradeLevelId: classes.gradeLevelId })
    .from(classes)
    .where(eq(classes.id, classId))
    .limit(1)

  const staff = await db
    .select({ userId: schoolStaff.userId, allGrades: schoolStaff.allGrades, gradeLevelIds: schoolStaff.gradeLevelIds })
    .from(schoolStaff)
    .where(and(eq(schoolStaff.schoolId, schoolId), eq(schoolStaff.role, 'counselor')))

  return staff
    .filter((s) => {
      if (s.allGrades) return true
      if (!cls?.gradeLevelId) return false
      try {
        const ids = JSON.parse(s.gradeLevelIds ?? '[]')
        return Array.isArray(ids) && ids.includes(cls.gradeLevelId)
      } catch {
        return false
      }
    })
    .map((s) => s.userId)
}

/**
 * The people who answer for the whole school: the owner and the quality
 * managers. The fallback audience when something has no narrower owner — a case
 * raised in a stage nobody has been assigned to yet.
 */
export async function wholeSchoolManagers(schoolId: string): Promise<string[]> {
  const [[school], managers] = await Promise.all([
    db.select({ adminId: schools.adminId }).from(schools).where(eq(schools.id, schoolId)).limit(1),
    db.select({ userId: schoolStaff.userId })
      .from(schoolStaff)
      .where(and(eq(schoolStaff.schoolId, schoolId), eq(schoolStaff.role, 'quality_manager'))),
  ])
  const ids = managers.map((m) => m.userId)
  if (school?.adminId) ids.push(school.adminId)
  return [...new Set(ids.filter(Boolean))]
}

/** The parent account linked to a pupil, when there is one. */
export async function parentOfStudent(studentId: string): Promise<string | null> {
  const [row] = await db
    .select({ parentUserId: students.parentUserId })
    .from(students)
    .where(eq(students.id, studentId))
    .limit(1)
  return row?.parentUserId ?? null
}

/**
 * Everyone an announcement is addressed to, resolved to parent accounts.
 * A pupil with no parent account simply drops out — there is nobody to tell.
 */
export async function parentsForAnnouncement(
  schoolId: string,
  opts: { studentId?: string | null; classId?: string | null },
): Promise<string[]> {
  // A graduate's family is no longer part of the school's announcements.
  const filters = [eq(students.schoolId, schoolId), eq(students.status, 'active')]
  if (opts.studentId) filters.push(eq(students.id, opts.studentId))
  else if (opts.classId) filters.push(eq(students.classId, opts.classId))

  const rows = await db
    .select({ parentUserId: students.parentUserId })
    .from(students)
    .where(and(...filters))

  // Siblings share one login, so the same parent must not be told twice.
  return [...new Set(rows.map((r) => r.parentUserId).filter((v): v is string => !!v))]
}

/**
 * Everyone who works at the school: every teacher, plus the admin team.
 * A notice for the staff room has no student and no class — it is addressed to
 * the people, so it is built from the staff tables rather than from pupils.
 */
export async function staffForAnnouncement(
  schoolId: string,
  exceptUserId?: string,
): Promise<{ userId: string; href: string }[]> {
  const [teacherRows, staffRows] = await Promise.all([
    db.select({ userId: teachers.userId }).from(teachers).where(eq(teachers.schoolId, schoolId)),
    db.select({ userId: schoolStaff.userId, role: schoolStaff.role }).from(schoolStaff).where(eq(schoolStaff.schoolId, schoolId)),
  ])

  // Each portal keeps its own inbox page, so the link has to be chosen per
  // person — one href for everyone would send a teacher to a screen they
  // cannot open. Somebody who is both a teacher and on the admin team is
  // listed once, under the desk they'd read it at.
  const byUser = new Map<string, string>()
  for (const r of teacherRows) {
    if (r.userId && r.userId !== exceptUserId) byUser.set(r.userId, '/teacher/notifications')
  }
  for (const r of staffRows) {
    if (!r.userId || r.userId === exceptUserId) continue
    byUser.set(r.userId, r.role === 'counselor' ? '/counselor/notifications' : '/admin/my-notifications')
  }
  return [...byUser].map(([userId, href]) => ({ userId, href }))
}

/**
 * How many families can actually be reached today.
 *
 * A parent still holding the starter password sees the "choose a password"
 * screen instead of the portal, so a notice addressed to them is written but
 * never seen. The sender is told the number rather than left to assume that
 * "sent to 281" means 281 people read it.
 */
export async function parentReach(schoolId: string, recipientIds: string[]): Promise<{ total: number; reachable: number }> {
  if (recipientIds.length === 0) return { total: 0, reachable: 0 }
  const rows = await db
    .select({ id: user.id, mustChange: user.mustChangePassword })
    .from(user)
    .where(inArray(user.id, recipientIds))
  return { total: recipientIds.length, reachable: rows.filter((r) => !r.mustChange).length }
}

/**
 * How many parent accounts have been activated at all.
 *
 * Shown on the sending screen rather than only after a send: "nobody got my
 * notice" almost always means the accounts were never opened — a parent still
 * holding the starter password sees the "choose a password" screen instead of
 * the portal, so a notice addressed to them is written and never seen.
 *
 * Siblings share one login, so this counts accounts, not children.
 */
export async function parentActivation(schoolId: string): Promise<{ total: number; activated: number }> {
  const rows = await db
    .selectDistinct({ id: user.id, mustChange: user.mustChangePassword })
    .from(students)
    .innerJoin(user, eq(user.id, students.parentUserId))
    .where(and(eq(students.schoolId, schoolId), eq(students.status, 'active')))
  return { total: rows.length, activated: rows.filter((r) => !r.mustChange).length }
}

/**
 * Which of these students already had a notification of this kind today.
 *
 * The register is the first guard against telling a family twice — a pupil the
 * roll already shows as out is not announced again — but it is not the last:
 * the teacher who owns an absence may undo it, and a later period could then
 * write a fresh one. "Today" is the school's day, not the server's, so the
 * comparison is made in the school's timezone.
 */
export async function notifiedTodayFor(
  schoolId: string,
  kind: NotificationKind,
  entityIds: string[],
): Promise<Set<string>> {
  if (entityIds.length === 0) return new Set()
  const rows = await db
    .select({ entityId: userNotifications.entityId })
    .from(userNotifications)
    .where(and(
      eq(userNotifications.schoolId, schoolId),
      eq(userNotifications.kind, kind),
      inArray(userNotifications.entityId, entityIds),
      sql`${userNotifications.createdAt} AT TIME ZONE 'Asia/Riyadh' >= date_trunc('day', now() AT TIME ZONE 'Asia/Riyadh')`,
    ))
  return new Set(rows.map((r) => r.entityId).filter((v): v is string => !!v))
}

/**
 * Removing the announcement must remove it from the bells it was copied into,
 * or a notice the school retracted keeps sitting in three hundred pockets.
 */
export async function deleteNotificationsForEntity(schoolId: string, entityId: string): Promise<void> {
  await db
    .delete(userNotifications)
    .where(and(eq(userNotifications.schoolId, schoolId), eq(userNotifications.entityId, entityId)))
}

// ─── Reading ──────────────────────────────────────────────────────────────────

export type InboxItem = {
  id: string
  kind: NotificationKind
  title: string
  body: string | null
  href: string | null
  actorName: string | null
  readAt: Date | null
  createdAt: Date
}

export async function listInbox(userId: string, limit = 30): Promise<InboxItem[]> {
  const rows = await db
    .select({
      id: userNotifications.id,
      kind: userNotifications.kind,
      title: userNotifications.title,
      body: userNotifications.body,
      href: userNotifications.href,
      actorName: userNotifications.actorName,
      readAt: userNotifications.readAt,
      createdAt: userNotifications.createdAt,
    })
    .from(userNotifications)
    .where(eq(userNotifications.recipientUserId, userId))
    .orderBy(desc(userNotifications.createdAt))
    .limit(limit)

  return rows.map((r) => ({
    ...r,
    kind: (isNotificationKind(r.kind) ? r.kind : 'announcement') as NotificationKind,
  }))
}

export async function countUnread(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`COUNT(*)`.mapWith(Number) })
    .from(userNotifications)
    .where(and(eq(userNotifications.recipientUserId, userId), isNull(userNotifications.readAt)))
  return row?.n ?? 0
}

/** Marking read is always scoped to the reader, so one person cannot clear another's bell. */
export async function markRead(userId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await db
    .update(userNotifications)
    .set({ readAt: new Date() })
    .where(and(
      eq(userNotifications.recipientUserId, userId),
      inArray(userNotifications.id, ids),
      isNull(userNotifications.readAt),
    ))
}

export async function markAllRead(userId: string): Promise<void> {
  await db
    .update(userNotifications)
    .set({ readAt: new Date() })
    .where(and(eq(userNotifications.recipientUserId, userId), isNull(userNotifications.readAt)))
}
