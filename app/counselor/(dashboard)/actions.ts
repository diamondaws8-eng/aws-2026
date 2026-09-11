'use server'

import { db } from '@/lib/db'
import { behaviorCases, students, classes, parentWhatsappMessages } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import {
  requireCounselor,
  requireCounselorForStudent,
  getCounselorClassIds,
  staffCoveringGrade,
} from '@/lib/counselor-access'
import { logCounselorAudit } from '@/lib/audit'
import { today as schoolToday, schoolDate } from '@/lib/utils'

/** A rejected input comes back as a value: a production build strips thrown messages. */
export type CaseResult = { ok: true } | { ok: false; error: string }

/**
 * Informing a family returns the WhatsApp address to open. Building it on the
 * server means the screen never depends on having fetched the number earlier,
 * and the caller can open the tab inside the click that saved the decision —
 * opening it afterwards is what browsers block as a popup.
 */
export type InformResult = { ok: true; waUrl: string | null } | { ok: false; error: string }

/** Any spelling of a Saudi mobile reduced to the form wa.me expects. */
function toMsisdn(raw: string | null | undefined): string {
  const d = (raw ?? '').replace(/\D/g, '')
  if (!d) return ''
  if (d.startsWith('966')) return d
  if (d.startsWith('0')) return `966${d.slice(1)}`
  return `966${d}`
}

const MAX_NOTE = 2000

/**
 * The teacher who raised a case is told how it ended — the outcome only, never
 * the counselling note. A teacher who hears nothing assumes they were ignored
 * and goes back to messaging families from their own phone.
 */
async function tellTeacher(
  access: { schoolId: string; name: string; userId?: string },
  row: { raisedByUserId: string; studentId: string; classId: string; id: string },
  outcome: string,
) {
  // A note the counsellor wrote themselves has no teacher waiting to hear.
  if (access.userId && row.raisedByUserId === access.userId) return
  const { notify } = await import('@/lib/notifications')
  const [student] = await db
    .select({ fullName: students.fullName })
    .from(students)
    .where(eq(students.id, row.studentId))
    .limit(1)
  await notify([{
    schoolId: access.schoolId,
    recipientUserId: row.raisedByUserId,
    kind: 'case_decided',
    title: `${student?.fullName ?? 'طالب'}: ${outcome}`,
    body: 'الحالة التي رفعتَها تمت معالجتها من الموجه الطلابي.',
    href: `/teacher/classes/${row.classId}`,
    entityId: row.id,
    actorName: access.name,
  }])
}

/** Proves the case is inside this counsellor's stages before it can be read or decided. */
async function requireOwnCase(caseId: string) {
  const access = await requireCounselor()
  const [row] = await db
    .select()
    .from(behaviorCases)
    .where(and(eq(behaviorCases.id, caseId), eq(behaviorCases.schoolId, access.schoolId)))
    .limit(1)
  if (!row) throw new Error('الحالة غير موجودة')

  if (!access.allGrades) {
    const allowed = await getCounselorClassIds(access)
    if (!allowed.includes(row.classId)) throw new Error('هذه الحالة خارج المراحل المسندة إليك')
  }
  return { access, row }
}

/**
 * The deputies this counsellor may hand a case to. A stage can have more than
 * one, so the choice is always explicit — never "the deputy of the stage".
 */
export async function getEscalationTargets(caseId: string) {
  const { access, row } = await requireOwnCase(caseId)

  const [cls] = await db
    .select({ gradeLevelId: classes.gradeLevelId })
    .from(classes)
    .where(eq(classes.id, row.classId))
    .limit(1)

  // The rule itself lives in lib/counselor-access.ts, because the settings
  // screen shows this same list ahead of time — a stage with nobody to escalate
  // to must be visible before a case is stuck in it, not at the moment it is.
  return staffCoveringGrade(access.schoolId, cls?.gradeLevelId ?? null)
}

/** Settle it with the pupil. The family is deliberately not told. */
export async function resolveCasePrivately(caseId: string, counselorNote: string): Promise<CaseResult> {
  const { access, row } = await requireOwnCase(caseId)
  const note = String(counselorNote ?? '').trim().slice(0, MAX_NOTE)
  if (!note) return { ok: false, error: 'اكتب ما تم مع الطالب — السجل بلا ملاحظة لا يفيد أحداً' }

  await db.update(behaviorCases).set({
    status: 'resolved_privately',
    counselorNote: note,
    decidedByUserId: access.userId,
    decidedAt: new Date(),
    ownerUserId: null,
    updatedAt: new Date(),
  }).where(eq(behaviorCases.id, caseId))

  const [student] = await db.select({ fullName: students.fullName }).from(students).where(eq(students.id, row.studentId)).limit(1)

  // Deciding NOT to tell a family is a decision the school may one day have to
  // account for, so it is recorded — the note itself is not.
  await logCounselorAudit(access, 'case.resolvedPrivately', student?.fullName ?? '', {
    caseId,
    date: row.date,
  })

  // Only the teacher. Telling the family is precisely what this decision chose
  // not to do, so nothing goes to the parent's bell either.
  await tellTeacher(access, row, 'عولجت مع الطالب')

  revalidatePath('/counselor')
  return { ok: true }
}

/** Close it as nothing that needed acting on. */
export async function dismissCase(caseId: string, counselorNote: string): Promise<CaseResult> {
  const { access, row } = await requireOwnCase(caseId)
  const note = String(counselorNote ?? '').trim().slice(0, MAX_NOTE)
  if (!note) return { ok: false, error: 'اكتب سبب الإغلاق' }

  await db.update(behaviorCases).set({
    status: 'dismissed',
    counselorNote: note,
    decidedByUserId: access.userId,
    decidedAt: new Date(),
    ownerUserId: null,
    updatedAt: new Date(),
  }).where(eq(behaviorCases.id, caseId))

  const [student] = await db.select({ fullName: students.fullName }).from(students).where(eq(students.id, row.studentId)).limit(1)
  await logCounselorAudit(access, 'case.dismissed', student?.fullName ?? '', { caseId, date: row.date })
  await tellTeacher(access, row, 'أُغلقت — لا يوجد ما يستدعي')

  revalidatePath('/counselor')
  return { ok: true }
}

/**
 * Tell the family. The counsellor writes the message themselves — the point of
 * the whole flow is that what arrives at a home has been through someone
 * trained to phrase it.
 */
export async function informParent(caseId: string, message: string, counselorNote: string): Promise<InformResult> {
  const { access, row } = await requireOwnCase(caseId)
  const text = String(message ?? '').trim()
  if (text.length < 10) return { ok: false, error: 'نص الرسالة قصير جداً' }

  const [target] = await db
    .select({ parentPhone: students.parentPhone })
    .from(students)
    .where(eq(students.id, row.studentId))
    .limit(1)
  const msisdn = toMsisdn(target?.parentPhone)

  await db.update(behaviorCases).set({
    status: 'parent_informed',
    counselorNote: String(counselorNote ?? '').trim().slice(0, MAX_NOTE) || null,
    decidedByUserId: access.userId,
    decidedAt: new Date(),
    ownerUserId: null,
    parentMessageSent: true,
    updatedAt: new Date(),
  }).where(eq(behaviorCases.id, caseId))

  // Keeps the admin dashboard's message figures whole now that the negative
  // ones come from here instead of the teacher's screen.
  await db.insert(parentWhatsappMessages).values({
    schoolId: access.schoolId,
    classId: row.classId,
    studentId: row.studentId,
    teacherUserId: access.userId,
    type: 'negative',
    date: schoolToday(),
  })

  const [student] = await db.select({ fullName: students.fullName }).from(students).where(eq(students.id, row.studentId)).limit(1)
  await logCounselorAudit(access, 'case.parentInformed', student?.fullName ?? '', { caseId, date: row.date })

  // WhatsApp can be missed, blocked, or sent to an old number. The portal copy
  // is the one the family can always come back to.
  const { notify, parentOfStudent } = await import('@/lib/notifications')
  const parentUserId = await parentOfStudent(row.studentId)
  if (parentUserId) {
    await notify([{
      schoolId: access.schoolId,
      recipientUserId: parentUserId,
      kind: 'parent_informed',
      title: `ملاحظة بخصوص ${student?.fullName ?? 'ابنك'}`,
      body: text,
      href: '/parent/notifications',
      entityId: caseId,
      actorName: access.name,
    }])
  }
  await tellTeacher(access, row, 'أُبلغ ولي الأمر')

  revalidatePath('/counselor')
  return {
    ok: true,
    waUrl: msisdn ? `https://wa.me/${msisdn}?text=${encodeURIComponent(text)}` : null,
  }
}

/** Hand it to a named deputy — never to "the stage". */
export async function escalateCase(caseId: string, toUserId: string, counselorNote: string): Promise<CaseResult> {
  const { access, row } = await requireOwnCase(caseId)

  const targets = await getEscalationTargets(caseId)
  const target = targets.find((t) => t.userId === toUserId)
  if (!target) return { ok: false, error: 'اختر مسؤولاً من قائمة المسؤولين عن مرحلة هذا الطالب' }

  await db.update(behaviorCases).set({
    status: 'escalated',
    counselorNote: String(counselorNote ?? '').trim().slice(0, MAX_NOTE) || null,
    decidedByUserId: access.userId,
    decidedAt: new Date(),
    escalatedToUserId: toUserId,
    escalatedAt: new Date(),
    // Ownership moves with the case: from here the named person must act.
    ownerUserId: toUserId,
    updatedAt: new Date(),
  }).where(eq(behaviorCases.id, caseId))

  const [student] = await db.select({ fullName: students.fullName }).from(students).where(eq(students.id, row.studentId)).limit(1)
  await logCounselorAudit(access, 'case.escalated', student?.fullName ?? '', {
    caseId,
    date: row.date,
    to: target.fullName,
  })

  const { notify } = await import('@/lib/notifications')
  await notify([{
    schoolId: access.schoolId,
    recipientUserId: toUserId,
    kind: 'case_escalated',
    title: `حالة محالة إليك: ${student?.fullName ?? 'طالب'}`,
    body: row.teacherNote.slice(0, 300),
    href: '/admin/cases',
    entityId: caseId,
    actorName: access.name,
  }])
  await tellTeacher(access, row, `أُحيلت إلى ${target.fullName}`)

  revalidatePath('/counselor')
  return { ok: true }
}

/** The full picture for one pupil, so a case is judged in context and not alone. */
export async function getStudentCaseHistory(studentId: string) {
  const access = await requireCounselor()
  await requireCounselorForStudent(access, studentId)

  return db
    .select({
      id: behaviorCases.id,
      date: behaviorCases.date,
      status: behaviorCases.status,
      teacherNote: behaviorCases.teacherNote,
      counselorNote: behaviorCases.counselorNote,
      createdAt: behaviorCases.createdAt,
    })
    .from(behaviorCases)
    .where(eq(behaviorCases.studentId, studentId))
    .orderBy(behaviorCases.createdAt)
}

/**
 * Everything needed to judge THIS case, and nothing more.
 *
 * What changes a decision is not the pupil's file in full — it is what has
 * already been tried. Three cases closed as "settled with the pupil" and a
 * fourth arriving says plainly that settling it privately is not working.
 * Attendance and points are here because behaviour usually tracks them; the
 * parent's number is not, because seeing it on every case makes ringing home
 * the reflex, which is the very thing this flow exists to slow down.
 */
export async function getCaseContext(caseId: string) {
  const { access, row } = await requireOwnCase(caseId)

  const { dailyRecords, lessonRecords, gradeEntries, subjects: subj, teachers: tch, schoolStaff: stf } = await import('@/lib/db/schema')
  const { sql, desc, gte } = await import('drizzle-orm')
  const { getStudentPointsTotal } = await import('@/lib/points')

  const since = new Date()
  since.setDate(since.getDate() - 30)
  const sinceStr = schoolDate(since)

  const [student] = await db
    .select({ id: students.id, fullName: students.fullName, classId: students.classId })
    .from(students)
    .where(eq(students.id, row.studentId))
    .limit(1)

  const [history, attendance, points, marks] = await Promise.all([
    // Earlier cases and how each one ended — the heart of the decision.
    db.select({
        id: behaviorCases.id,
        date: behaviorCases.date,
        status: behaviorCases.status,
        teacherNote: behaviorCases.teacherNote,
        counselorNote: behaviorCases.counselorNote,
        adminNote: behaviorCases.adminNote,
        teacherName: tch.fullName,
        raiserStaffName: stf.fullName,
        parentMessageSent: behaviorCases.parentMessageSent,
      })
      .from(behaviorCases)
      .leftJoin(tch, eq(tch.userId, behaviorCases.raisedByUserId))
      .leftJoin(stf, eq(stf.userId, behaviorCases.raisedByUserId))
      .where(and(
        eq(behaviorCases.studentId, row.studentId),
        sql`${behaviorCases.id} <> ${caseId}`,
      ))
      .orderBy(desc(behaviorCases.createdAt))
      .limit(20),

    db.select({
        present: sql<number>`COUNT(*) FILTER (WHERE ${dailyRecords.attendanceStatus} = 'present')`.mapWith(Number),
        late: sql<number>`COUNT(*) FILTER (WHERE ${dailyRecords.attendanceStatus} = 'late')`.mapWith(Number),
        absent: sql<number>`COUNT(*) FILTER (WHERE ${dailyRecords.attendanceStatus} = 'absent')`.mapWith(Number),
        excused: sql<number>`COUNT(*) FILTER (WHERE ${dailyRecords.attendanceStatus} = 'excused')`.mapWith(Number),
      })
      .from(dailyRecords)
      .where(and(eq(dailyRecords.studentId, row.studentId), gte(dailyRecords.date, sinceStr))),

    getStudentPointsTotal(row.studentId),

    // Behaviour often tracks falling behind, so the last few marks are useful.
    db.select({
        examName: gradeEntries.examName,
        score: gradeEntries.score,
        maxScore: gradeEntries.maxScore,
        subjectName: subj.name,
      })
      .from(gradeEntries)
      .leftJoin(subj, eq(subj.id, gradeEntries.subjectId))
      .where(eq(gradeEntries.studentId, row.studentId))
      .orderBy(desc(gradeEntries.createdAt))
      .limit(5),
  ])

  const att = attendance[0] ?? { present: 0, late: 0, absent: 0, excused: 0 }
  const timesParentTold = history.filter((h) => h.parentMessageSent).length

  return {
    studentName: student?.fullName ?? '',
    history: history.map(({ raiserStaffName, ...h }) => ({
      ...h,
      teacherName: h.teacherName ?? (raiserStaffName ? `${raiserStaffName} (الموجه)` : 'معلم محذوف'),
    })),
    attendance: att,
    attendanceDays: att.present + att.late + att.absent + att.excused,
    points,
    marks,
    timesParentTold,
  }
}

/**
 * The parent's number, handed over only at the moment the counsellor chooses to
 * write to them. Kept out of the case view on purpose — see getCaseContext.
 */
export async function getParentContact(caseId: string) {
  const { row } = await requireOwnCase(caseId)
  const [s] = await db
    .select({ fullName: students.fullName, parentPhone: students.parentPhone })
    .from(students)
    .where(eq(students.id, row.studentId))
    .limit(1)
  return s ?? null
}

// ── The counsellor's own observations ────────────────────────────────────────
/**
 * Pupils this counsellor may write about, for the picker: name and class,
 * nothing else, cut to their stages. Matched on the server so a counsellor
 * covering a whole building does not download every pupil to type a name.
 */
export async function searchMyPupils(q: string): Promise<{ id: string; fullName: string; className: string | null }[]> {
  const access = await requireCounselor()
  const needle = String(q ?? '').trim().slice(0, 60)
  if (needle.length < 2) return []
  const classIds = access.allGrades ? null : await getCounselorClassIds(access)
  if (classIds && classIds.length === 0) return []
  const { ilike, inArray } = await import('drizzle-orm')
  return db
    .select({ id: students.id, fullName: students.fullName, className: classes.name })
    .from(students)
    .leftJoin(classes, eq(classes.id, students.classId))
    .where(and(
      eq(students.schoolId, access.schoolId),
      eq(students.status, 'active'),
      ilike(students.fullName, `%${needle}%`),
      classIds ? inArray(students.classId, classIds) : undefined,
    ))
    .limit(12)
}

/**
 * A case the counsellor opens themselves — something seen in the corridor,
 * or brought by a parent — so it lives in the same record as everything the
 * teachers raise, and is decided the same way. It lands in this counsellor's
 * own inbox: nobody else is told, because there is nobody else to tell.
 */
export async function raiseCaseByCounselor(input: { studentId: string; note: string }): Promise<CaseResult> {
  const access = await requireCounselor()
  const note = String(input.note ?? '').trim().slice(0, MAX_NOTE)
  if (note.length < 5) return { ok: false, error: 'اكتب ما لاحظته — بلا وصف لا تُقرَّر حالة' }
  const student = await requireCounselorForStudent(access, input.studentId)
  if (!student.classId) return { ok: false, error: 'الطالب بلا فصل — أسنده لفصل أولاً من الإدارة' }
  const [created] = await db.insert(behaviorCases).values({
    schoolId: access.schoolId,
    studentId: student.id,
    classId: student.classId,
    subjectId: null,
    raisedByUserId: access.userId,
    teacherNote: note,
    date: schoolToday(),
    status: 'open',
    ownerUserId: access.userId,
  }).returning({ id: behaviorCases.id })
  await logCounselorAudit(access, 'case.raised', undefined, { byCounselor: true, caseId: created?.id ?? null })
  revalidatePath('/counselor')
  return { ok: true }
}
