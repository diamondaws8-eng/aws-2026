/**
 * Does this account belong to this school at all?
 *
 * Not in a 'use server' file on purpose: every export from one of those is a
 * public HTTP endpoint, and a membership oracle is not something to publish.
 *
 * It exists because a server action that takes a schoolId is trusting a value
 * the browser chose. Checking that a session exists proves the caller is
 * somebody; it does not prove they are somebody at THIS school.
 */

import { cache } from 'react'
import { db } from '@/lib/db'
import { schools, schoolStaff, teachers, students } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

export const isMemberOfSchool = cache(async (userId: string, schoolId: string): Promise<boolean> => {
  if (!userId || !schoolId) return false

  const [owner] = await db
    .select({ id: schools.id })
    .from(schools)
    .where(and(eq(schools.id, schoolId), eq(schools.adminId, userId)))
    .limit(1)
  if (owner) return true

  const [staff] = await db
    .select({ id: schoolStaff.id })
    .from(schoolStaff)
    .where(and(eq(schoolStaff.userId, userId), eq(schoolStaff.schoolId, schoolId)))
    .limit(1)
  if (staff) return true

  const [teacher] = await db
    .select({ id: teachers.id })
    .from(teachers)
    .where(and(eq(teachers.userId, userId), eq(teachers.schoolId, schoolId)))
    .limit(1)
  if (teacher) return true

  const [parent] = await db
    .select({ id: students.id })
    .from(students)
    .where(and(eq(students.parentUserId, userId), eq(students.schoolId, schoolId)))
    .limit(1)
  return !!parent
})
