'use server'

import { db } from '@/lib/db'
import { gradeLevels, classes, subjects, students } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

export async function addGradeLevel(formData: FormData) {
  const name = formData.get('name') as string
  const schoolId = formData.get('schoolId') as string
  if (!name || !schoolId) return
  const existingCount = await db.select().from(gradeLevels).where(eq(gradeLevels.schoolId, schoolId))
  await db.insert(gradeLevels).values({ name, schoolId, orderIndex: existingCount.length })
  revalidatePath('/admin/grade-levels')
}

export async function deleteGradeLevel(id: string) {
  await db.delete(gradeLevels).where(eq(gradeLevels.id, id))
  revalidatePath('/admin/grade-levels')
}

export async function addClass(formData: FormData) {
  const name = formData.get('name') as string
  const gradeLevelId = formData.get('gradeLevelId') as string
  const schoolId = formData.get('schoolId') as string
  if (!name || !gradeLevelId || !schoolId) return
  await db.insert(classes).values({ name, gradeLevelId, schoolId, capacity: 30 })
  revalidatePath('/admin/grade-levels')
}

export async function deleteClass(id: string) {
  await db.delete(classes).where(eq(classes.id, id))
  revalidatePath('/admin/grade-levels')
}

export async function editClass(id: string, name: string) {
  await db.update(classes).set({ name }).where(eq(classes.id, id))
  revalidatePath('/admin/grade-levels')
}

// ─── Subject actions ──────────────────────────────────────────────────────────
export async function addSubject(formData: FormData) {
  const name = formData.get('name') as string
  const classId = formData.get('classId') as string
  const schoolId = formData.get('schoolId') as string
  if (!name || !classId || !schoolId) return
  await db.insert(subjects).values({ name, classId, schoolId })
  revalidatePath('/admin/grade-levels')
}

export async function deleteSubject(id: string) {
  await db.delete(subjects).where(eq(subjects.id, id))
  revalidatePath('/admin/grade-levels')
}

export async function assignTeacherToSubject(subjectId: string, teacherUserId: string | null) {
  await db.update(subjects).set({ teacherUserId }).where(eq(subjects.id, subjectId))
  revalidatePath('/admin/grade-levels')
}

export async function getStudentsForClass(classId: string, schoolId: string) {
  return await db.select().from(students).where(and(eq(students.classId, classId), eq(students.schoolId, schoolId)))
}
