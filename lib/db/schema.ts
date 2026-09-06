import { pgTable, text, timestamp, uuid, boolean, integer } from 'drizzle-orm/pg-core'

// ─── Better Auth tables (required, do not rename) ───────────────────────────
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('emailVerified').notNull().default(false),
  image: text('image'),
  role: text('role').notNull().default('admin'), // 'admin' | 'teacher' | 'parent'
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
})

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
})

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

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// ─── Grade Levels (المراحل الدراسية) ─────────────────────────────────────────
// e.g. الأول الابتدائي، الثاني الابتدائي، الأول المتوسط…
export const gradeLevels = pgTable('grade_levels', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull(),
  name: text('name').notNull(),
  orderIndex: integer('order_index').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// ─── Classes (الفصول) ────────────────────────────────────────────────────────
// e.g. أ، ب، ج inside a grade level
export const classes = pgTable('classes', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull(),
  gradeLevelId: uuid('grade_level_id').notNull(), // FK → gradeLevels.id
  name: text('name').notNull(), // أ / ب / ج
  capacity: integer('capacity'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// ─── Teachers ─────────────────────────────────────────────────────────────────
// Created by admin; user account is auto-created alongside
export const teachers = pgTable('teachers', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull(),
  userId: text('user_id').notNull().unique(), // FK → user.id
  fullName: text('full_name').notNull(),
  phone: text('phone'),
  tempPassword: text('temp_password'), // shown once to admin, then cleared
  whatsappTemplates: text('whatsapp_templates').default('{"positive":[],"negative":[]}'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

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
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// ─── Subjects (المواد الدراسية per class) ─────────────────────────────────────
export const subjects = pgTable('subjects', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull(),
  classId: uuid('class_id').notNull(),
  name: text('name').notNull(),
  teacherUserId: text('teacher_user_id'),          // FK → user.id (assigned teacher)
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

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
})

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
})

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
})

// ─── Daily Records (السجل اليومي الشامل) ─────────────────────────────────────
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
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

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
})

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
})

