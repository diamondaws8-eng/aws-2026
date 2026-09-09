import { pgTable, text, timestamp, uuid, boolean, integer, index, uniqueIndex } from 'drizzle-orm/pg-core'

// ─── Better Auth tables (required, do not rename) ───────────────────────────
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('emailVerified').notNull().default(false),
  image: text('image'),
  role: text('role').notNull().default('admin'), // 'admin' | 'teacher' | 'parent'
  /** Blocks the portal until the user picks their own password (used for parents). */
  mustChangePassword: boolean('must_change_password').notNull().default(false),
  createdAt: timestamp('createdAt').notNull(),
  updatedAt: timestamp('updatedAt').notNull(),
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expiresAt').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('createdAt').notNull(),
  updatedAt: timestamp('updatedAt').notNull(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId').notNull(),
}, (t) => [
  index('session_user_idx').on(t.userId),
])

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId').notNull(),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: timestamp('accessTokenExpiresAt'),
  refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('createdAt').notNull(),
  updatedAt: timestamp('updatedAt').notNull(),
  issuer: text('issuer'),
}, (t) => [
  // Every login and every password change looks the account up this way.
  index('account_user_provider_idx').on(t.userId, t.providerId),
])

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expiresAt').notNull(),
  createdAt: timestamp('createdAt'),
  updatedAt: timestamp('updatedAt'),
})

// ─── School ──────────────────────────────────────────────────────────────────
export const schools = pgTable('schools', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  academicYear: text('academic_year').notNull(),
  adminId: text('admin_id').notNull(), // FK → user.id (owner)
  
  // JSONB for dynamic settings: { features: { attendance: boolean, behavior: boolean, homework: boolean }, points: { attendance: number, behavior: number, homework: number } }
  settings: text('settings').default('{"features":{"attendance":true,"behavior":true,"homework":true},"points":{"attendance":1,"behavior":2,"homework":1}}'),

  /**
   * The wording of the activation invitation sent to families, kept in its own
   * column rather than inside `settings`: that blob is rewritten wholesale by
   * the settings screen, and a message the school spent time phrasing must not
   * disappear because somebody saved an unrelated setting. Null = use the
   * built-in text in lib/parent-activation.ts.
   */
  parentActivationMessage: text('parent_activation_message'),

  /**
   * Which term the school is in right now.
   *
   * Every mark is stamped with it, and re-saving an exam replaces the rows
   * matching (subject, exam name, term, year). While this was the constant
   * 'first', an exam of the same name in the second term overwrote the first
   * term's marks instead of standing beside them.
   *
   * The number of terms is deliberately not fixed in code: the ministry has
   * changed it more than once, and a school should not need a deployment to
   * follow.
   */
  currentSemester: text('current_semester').notNull().default('first'),

  /**
   * First day of the current academic year (YYYY-MM-DD).
   *
   * Points and the leaderboard count from this date, so a pupil's score from
   * last year does not follow them into this one. Null means count everything,
   * which is exactly right until a school has more than one year of data — and
   * is what every existing school gets, so nothing changes until it is set.
   */
  yearStartDate: text('year_start_date'),

  /**
   * Whether Saturday is taught. Friday never is, so it stays fixed; Saturday
   * varies by school and by season, which is exactly why it is a setting the
   * school's own management flips rather than a constant in the code.
   */
  saturdayIsSchoolDay: boolean('saturday_is_school_day').notNull().default(false),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // Every admin-portal request resolves the school through this column.
  index('schools_admin_idx').on(t.adminId),
])

// ─── School Staff (فريق الإدارة) ─────────────────────────────────────────────
// Admin-portal users other than the owner: quality managers and deputies.
// The owner is NOT stored here — they are schools.adminId.
export const schoolStaff = pgTable('school_staff', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull(),
  userId: text('user_id').notNull().unique(), // FK → user.id
  fullName: text('full_name').notNull(),
  phone: text('phone'),
  role: text('role').notNull(),               // 'quality_manager' | 'principal' | 'deputy' | 'counselor'
  allGrades: boolean('all_grades').notNull().default(false),
  gradeLevelIds: text('grade_level_ids').default('[]'), // JSON array of gradeLevels.id
  canEdit: boolean('can_edit').notNull().default(true),
  /**
   * Saved ways of phrasing a message home — JSON array of {title, body}.
   * Written by the counsellor from their own settings and shown to nobody else:
   * how a person words bad news to a family is theirs, not the school's.
   */
  whatsappTemplates: text('whatsapp_templates').default('[]'),
  /** Per-person case-inbox thresholds — JSON {staleAfterDays, repeatThreshold}. */
  casePrefs: text('case_prefs').default('{}'),
  /** @deprecated never written to — passwords are shown once on creation/reset and only stored hashed. */
  tempPassword: text('temp_password'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('school_staff_school_idx').on(t.schoolId),
])

// ─── Behaviour cases (الحالات السلوكية) ──────────────────────────────────────
/**
 * A teacher no longer messages a parent about a problem directly. They raise a
 * case, and the student counsellor decides what happens to it: settle it with
 * the pupil, tell the family, pass it to a named deputy, or close it as no
 * issue. The point is that nothing reaches a home without a trained adult
 * having read it first.
 */
export const behaviorCases = pgTable('behavior_cases', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull(),
  studentId: uuid('student_id').notNull(),
  classId: uuid('class_id').notNull(),
  /** The lesson it arose in, when the teacher has an assigned subject. */
  subjectId: uuid('subject_id'),
  raisedByUserId: text('raised_by_user_id').notNull(),
  /** Required: a case with no account of what happened cannot be judged. */
  teacherNote: text('teacher_note').notNull(),
  date: text('date').notNull(),                 // YYYY-MM-DD, school timezone
  /** open | resolved_privately | parent_informed | escalated | dismissed */
  status: text('status').notNull().default('open'),
  /** Whoever must act next — the counsellor, then the named deputy. */
  ownerUserId: text('owner_user_id'),
  /** Counselling notes. Never shown to the teacher, the parent, or the deputy. */
  counselorNote: text('counselor_note'),
  /**
   * What the administration did once the case was handed to them. The
   * counsellor sees it — they handed the case over and need to know how it
   * ended — but the teacher and the family do not.
   */
  adminNote: text('admin_note'),
  decidedByUserId: text('decided_by_user_id'),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  /** A stage can have several deputies, so the counsellor names the one. */
  escalatedToUserId: text('escalated_to_user_id'),
  escalatedAt: timestamp('escalated_at', { withTimezone: true }),
  parentMessageSent: boolean('parent_message_sent').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('behavior_cases_school_status_idx').on(t.schoolId, t.status),
  index('behavior_cases_student_idx').on(t.studentId),
  index('behavior_cases_owner_idx').on(t.ownerUserId),
  index('behavior_cases_class_date_idx').on(t.classId, t.date),
])

// ─── User notifications (صندوق الإشعارات) ────────────────────────────────────
/**
 * One inbox for every portal, one row per person.
 *
 * The older `notifications` table is a broadcast: it stores what the
 * administration announced, targeted at a school, a class or a pupil, with no
 * notion of who has read it. That cannot carry an unread badge, and it cannot
 * carry the things that now need to reach one named person — the counsellor
 * when a case is raised, the teacher when their case is decided, the deputy a
 * case was handed to.
 *
 * So announcements are fanned out into this table when sent (281 parents is a
 * few kilobytes) and every portal reads exactly one place. `readAt` on the row
 * itself is what makes the badge honest without a second join table.
 */
export const userNotifications = pgTable('user_notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull(),
  /** FK → user.id. Always one person; broadcasts are fanned out on write. */
  recipientUserId: text('recipient_user_id').notNull(),
  /** What happened — drives the icon and colour, never shown raw. */
  kind: text('kind').notNull(),
  title: text('title').notNull(),
  body: text('body'),
  /** Where clicking it should take the reader. */
  href: text('href'),
  /** The case or student it concerns, for context. */
  entityId: uuid('entity_id'),
  /** Who caused it, so a notification is never anonymous. */
  actorName: text('actor_name'),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // The bell asks exactly this: my unread, newest first.
  index('user_notifications_recipient_idx').on(t.recipientUserId, t.createdAt),
  index('user_notifications_unread_idx').on(t.recipientUserId, t.readAt),
])

// ─── Audit Log (سجل التدقيق) ─────────────────────────────────────────────────
// Who did what, so sensitive actions are never anonymous.
export const auditLog = pgTable('audit_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull(),
  actorUserId: text('actor_user_id').notNull(),
  actorName: text('actor_name').notNull(),
  actorRole: text('actor_role').notNull(),   // owner | quality_manager | principal | deputy
  action: text('action').notNull(),          // e.g. 'student.delete'
  entityName: text('entity_name'),           // human-readable target
  details: text('details'),                  // optional JSON with extra context
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('audit_log_school_created_idx').on(t.schoolId, t.createdAt),
])

// ─── Grade Levels (المراحل الدراسية) ─────────────────────────────────────────
// e.g. الأول الابتدائي، الثاني الابتدائي، الأول المتوسط…
export const gradeLevels = pgTable('grade_levels', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull(),
  name: text('name').notNull(),
  orderIndex: integer('order_index').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('grade_levels_school_idx').on(t.schoolId),
])

// ─── Classes (الفصول) ────────────────────────────────────────────────────────
// e.g. أ، ب، ج inside a grade level
export const classes = pgTable('classes', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull(),
  gradeLevelId: uuid('grade_level_id').notNull(), // FK → gradeLevels.id
  name: text('name').notNull(), // أ / ب / ج
  capacity: integer('capacity'),

  /**
   * Where this class's pupils go at the end of the year.
   *
   * The system has no concept of a "year" — a class is named "3\1" and the
   * grade is a prefix inside that string, so nothing can work out that third
   * intermediate is followed by first secondary, still less that the two sit in
   * different buildings. Stating the destination per class says it exactly,
   * including the jumps between stages and between buildings, and it survives a
   * school whose boys' and girls' sides progress into different places.
   */
  promotesToClassId: uuid('promotes_to_class_id'),

  /**
   * The last class of a path: third secondary. Its pupils graduate rather than
   * move, so promotion must not silently leave them where they are for a year
   * they are no longer in.
   */
  isTerminal: boolean('is_terminal').notNull().default(false),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('classes_school_idx').on(t.schoolId),
  index('classes_grade_idx').on(t.gradeLevelId),
])

// ─── Teachers ─────────────────────────────────────────────────────────────────
// Created by admin; user account is auto-created alongside
export const teachers = pgTable('teachers', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull(),
  userId: text('user_id').notNull().unique(), // FK → user.id
  fullName: text('full_name').notNull(),
  phone: text('phone'),
  /** @deprecated never written to — passwords are shown once on creation/reset and only stored hashed. */
  tempPassword: text('temp_password'),
  whatsappTemplates: text('whatsapp_templates').default('{"positive":[],"negative":[]}'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('teachers_school_idx').on(t.schoolId),
])

// ─── Students ─────────────────────────────────────────────────────────────────
export const students = pgTable('students', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull(),
  classId: uuid('class_id'),              // FK → classes.id (nullable = unassigned)
  fullName: text('full_name').notNull(),
  nationalId: text('national_id'),
  parentPhone: text('parent_phone'),
  gender: text('gender'),                 // 'male' | 'female'
  dateOfBirth: text('date_of_birth'),     // YYYY-MM-DD
  parentUserId: text('parent_user_id'),   // FK → user.id (auto-created)

  /**
   * 'active' | 'graduated'.
   *
   * A pupil who finishes the last year has to leave the rolls without leaving
   * the record: deleting them erases every mark, every absence and every
   * behaviour case the school may later be asked about, and leaving them in a
   * class puts a graduate on next year's register. So they keep their row and
   * their history, lose their class, and stop appearing anywhere that lists
   * pupils who are still here.
   */
  status: text('status').notNull().default('active'),
  graduatedAt: timestamp('graduated_at', { withTimezone: true }),
  /** The class they left from — classId is cleared, so this is the only record of it. */
  graduatedFromClassId: uuid('graduated_from_class_id'),
  /** The academic year label as it stood on the day they graduated. */
  graduationYear: text('graduation_year'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('students_school_idx').on(t.schoolId),
  index('students_class_idx').on(t.classId),
  index('students_parent_idx').on(t.parentUserId),
])

// ─── Subjects (المواد الدراسية per class) ─────────────────────────────────────
export const subjects = pgTable('subjects', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull(),
  classId: uuid('class_id').notNull(),
  name: text('name').notNull(),
  teacherUserId: text('teacher_user_id'),          // FK → user.id (assigned teacher)
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('subjects_school_idx').on(t.schoolId),
  index('subjects_class_idx').on(t.classId),
  index('subjects_teacher_idx').on(t.teacherUserId),
])

// ─── Attendance ───────────────────────────────────────────────────────────────
export const attendance = pgTable('attendance', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull(),
  studentId: uuid('student_id').notNull(),  // FK → students.id
  classId: uuid('class_id').notNull(),      // FK → classes.id
  teacherUserId: text('teacher_user_id').notNull(), // FK → user.id
  date: text('date').notNull(),             // YYYY-MM-DD
  status: text('status').notNull(),         // 'present' | 'absent' | 'late' | 'excused'
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('attendance_school_date_idx').on(t.schoolId, t.date),
  index('attendance_student_idx').on(t.studentId),
  index('attendance_class_date_idx').on(t.classId, t.date),
])

// ─── Grade Entries (الدرجات) ──────────────────────────────────────────────────
export const gradeEntries = pgTable('grade_entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull(),
  studentId: uuid('student_id').notNull(),  // FK → students.id
  subjectId: uuid('subject_id').notNull(),  // FK → subjects.id
  teacherUserId: text('teacher_user_id').notNull(), // FK → user.id
  examName: text('exam_name').notNull(),    // e.g. اختبار نصف الفصل
  examType: text('exam_type').notNull(),    // 'quiz'|'midterm'|'final'|'assignment'|'oral'
  score: integer('score').notNull(),
  maxScore: integer('max_score').notNull().default(100),
  semester: text('semester').notNull(),     // 'first' | 'second'
  academicYear: text('academic_year').notNull(),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('grade_entries_school_idx').on(t.schoolId),
  index('grade_entries_student_idx').on(t.studentId),
  index('grade_entries_subject_idx').on(t.subjectId),
])

// ─── Notifications ────────────────────────────────────────────────────────────
export const notifications = pgTable('notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull(),
  fromUserId: text('from_user_id').notNull(), // FK → user.id
  studentId: uuid('student_id'),              // null = class-wide or school-wide
  classId: uuid('class_id'),                  // null = school-wide
  title: text('title').notNull(),
  body: text('body').notNull(),
  type: text('type').notNull().default('info'), // 'info'|'warning'|'absence'|'grade'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }), // null = never expires
}, (t) => [
  index('notifications_school_created_idx').on(t.schoolId, t.createdAt),
  index('notifications_class_idx').on(t.classId),
  index('notifications_student_idx').on(t.studentId),
])

// ─── Daily Records (السجل اليومي الشامل) ─────────────────────────────────────
/**
 * The attendance register: one row per student per day, shared by every teacher
 * who visits the class. Whether a pupil was in school is a single fact, so the
 * first teacher to save it fixes it for the whole day.
 *
 * @deprecated on this table: `behavior`, `homeworkStatus`, `materialsStatus`,
 * `participationStatus` and `teacherNote`. Those are per-lesson judgements and
 * now live on `lesson_records`; the columns are kept only so records written
 * before that split remain readable.
 */
export const dailyRecords = pgTable('daily_records', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull(),
  classId: uuid('class_id').notNull(),
  studentId: uuid('student_id').notNull(),
  teacherUserId: text('teacher_user_id').notNull(),
  date: text('date').notNull(),
  attendanceStatus: text('attendance_status').notNull().default('present'),
  behavior: text('behavior').default('good'),
  homeworkStatus: text('homework_status').default('done'),
  materialsStatus: text('materials_status').default('brought'),
  participationStatus: text('participation_status').default('active'),
  teacherNote: text('teacher_note'),
  pointsEarned: integer('points_earned').notNull().default(0),
  /**
   * Who recorded the absence (FK → user.id), and when.
   * A student who left the school is absent from every later period too, so the
   * first teacher to mark them absent owns that decision for the rest of the
   * day: nobody else may mark them present. Only the teacher named here can
   * undo it — that is what makes a misclick fixable without opening the lock to
   * everyone. Null whenever the student is not absent.
   */
  absenceMarkedBy: text('absence_marked_by'),
  absenceMarkedAt: timestamp('absence_marked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // This table grows fastest (every student × every school day).
  index('daily_records_school_date_idx').on(t.schoolId, t.date),
  index('daily_records_class_date_idx').on(t.classId, t.date),
  index('daily_records_student_idx').on(t.studentId),
  // One row per student per class per day — totals are a SUM over this table,
  // so a duplicate would silently double a student's points. The database
  // refuses it outright instead of relying on the app checking first.
  uniqueIndex('daily_records_student_class_date_uq').on(t.studentId, t.classId, t.date),
])

// ─── Lesson Records (تقييم كل معلم على حدة) ──────────────────────────────────
/**
 * One row per student per teacher per day.
 *
 * Attendance is a single fact about the student's day and lives on
 * `daily_records`; everything a teacher *judges* — behaviour, homework,
 * materials, participation — is an opinion about one lesson and belongs to
 * that teacher alone. A pupil can bring their tools to maths and forget them
 * in science, and both statements are true at once, which a single shared row
 * could never express (it is why one teacher's save used to erase another's).
 *
 * Points from these rows are summed across teachers: doing the homework for
 * six subjects is worth more than doing it for one.
 */
export const lessonRecords = pgTable('lesson_records', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull(),
  classId: uuid('class_id').notNull(),
  studentId: uuid('student_id').notNull(),
  teacherUserId: text('teacher_user_id').notNull(), // FK → user.id
  /** Which subject this assessment belongs to, when the class has one assigned. */
  subjectId: uuid('subject_id'),
  date: text('date').notNull(),                     // YYYY-MM-DD
  behavior: text('behavior'),
  homeworkStatus: text('homework_status'),
  materialsStatus: text('materials_status'),
  participationStatus: text('participation_status'),
  teacherNote: text('teacher_note'),
  /** Behaviour + homework + materials + participation. Attendance is NOT here. */
  pointsEarned: integer('points_earned').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('lesson_records_school_date_idx').on(t.schoolId, t.date),
  index('lesson_records_class_date_idx').on(t.classId, t.date),
  index('lesson_records_student_idx').on(t.studentId),
  index('lesson_records_teacher_date_idx').on(t.teacherUserId, t.date),
  // A teacher assesses a student once a day. Two subjects taught by the same
  // teacher to the same class therefore share one row — deliberate, since the
  // teacher fills one roster per visit.
  uniqueIndex('lesson_records_student_teacher_date_uq').on(t.studentId, t.teacherUserId, t.date),
])

// ─── Student Points Ledger (سجل نقاط الطلاب) ─────────────────────────────────
export const studentPoints = pgTable('student_points', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull(),
  studentId: uuid('student_id').notNull(),
  classId: uuid('class_id').notNull(),
  teacherUserId: text('teacher_user_id').notNull(),
  points: integer('points').notNull(),
  reason: text('reason').notNull(),
  type: text('type').notNull(),
  date: text('date').notNull(),
  dailyRecordId: uuid('daily_record_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('student_points_school_idx').on(t.schoolId),
  index('student_points_student_idx').on(t.studentId),
  index('student_points_class_idx').on(t.classId),
])

// ─── Parent WhatsApp messages (رسائل أولياء الأمور) ──────────────────────────
export const parentWhatsappMessages = pgTable('parent_whatsapp_messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull(),
  classId: uuid('class_id').notNull(),
  studentId: uuid('student_id').notNull(),
  teacherUserId: text('teacher_user_id').notNull(),
  type: text('type').notNull(), // 'positive' | 'negative'
  date: text('date').notNull(), // YYYY-MM-DD
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('parent_msgs_school_date_idx').on(t.schoolId, t.date),
  index('parent_msgs_class_date_idx').on(t.classId, t.date),
])


// ─── Parent activation outreach (حملة تفعيل حسابات أولياء الأمور) ────────────
/**
 * One row per time a family was invited to activate their portal account.
 *
 * A campaign across 281 families is not one afternoon's work but several, split
 * between people, and the only question that matters when you come back to it
 * is "who have we already asked". Without a record that question is answered by
 * memory, and a parent gets messaged four times while another gets none.
 *
 * It deliberately keeps a row per attempt rather than a flag per parent: how
 * many times a family was asked before they responded is the thing that tells
 * the school whether the message itself is working.
 */
export const parentActivationLog = pgTable('parent_activation_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull(),
  parentUserId: text('parent_user_id').notNull(), // FK → user.id
  sentByUserId: text('sent_by_user_id').notNull(), // FK → user.id (who did the asking)
  sentAt: timestamp('sent_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('parent_activation_school_idx').on(t.schoolId),
  index('parent_activation_parent_idx').on(t.parentUserId),
])

// ─── School holidays (إجازات المدرسة) ────────────────────────────────────────
/**
 * Days the school is closed, beyond the weekly rest.
 *
 * Stored as inclusive ranges because that is how a school thinks about them —
 * "إجازة عيد الفطر من كذا إلى كذا" — not as a row per day. A range costs one
 * row whether it covers a day or a month.
 *
 * These days are removed from the dashboard's window, so "days with no
 * recording" means neglect and nothing else.
 */
export const schoolHolidays = pgTable('school_holidays', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull(),
  name: text('name').notNull(),
  startDate: text('start_date').notNull(), // YYYY-MM-DD, inclusive
  endDate: text('end_date').notNull(),     // YYYY-MM-DD, inclusive
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('school_holidays_school_idx').on(t.schoolId, t.startDate),
])
