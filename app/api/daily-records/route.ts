import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { dailyRecords } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { getClassPointsTotals } from '@/lib/points'
import { getTeacherAccess } from '@/lib/teacher-access'
import { classes } from '@/lib/db/schema'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const classId = searchParams.get('classId')
  const date = searchParams.get('date')

  if (!classId || !date) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  // Behaviour notes and attendance are sensitive — this must never answer an
  // anonymous request just because the caller knows a class id.
  const access = await getTeacherAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [owned] = await db
    .select({ id: classes.id })
    .from(classes)
    .where(and(eq(classes.id, classId), eq(classes.schoolId, access.schoolId)))
    .limit(1)
  if (!owned) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const records = await db
    .select()
    .from(dailyRecords)
    .where(and(eq(dailyRecords.classId, classId), eq(dailyRecords.date, date)))

  const totalsByStudent = await getClassPointsTotals(classId)
  const pointsSummary = Object.entries(totalsByStudent).map(([studentId, total]) => ({ studentId, total }))

  return NextResponse.json({
    records: records.map(r => ({
      studentId: r.studentId,
      attendanceStatus: r.attendanceStatus,
      behavior: r.behavior,
      homeworkStatus: r.homeworkStatus,
      materialsStatus: r.materialsStatus,
      participationStatus: r.participationStatus,
      teacherNote: r.teacherNote,
      pointsEarned: r.pointsEarned,
    })),
    pointsSummary: pointsSummary.map(p => ({
      studentId: p.studentId,
      total: Number(p.total),
    })),
  })
}
