import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { dailyRecords, studentPoints } from '@/lib/db/schema'
import { eq, and, sql } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const classId = searchParams.get('classId')
  const date = searchParams.get('date')

  if (!classId || !date) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const records = await db
    .select()
    .from(dailyRecords)
    .where(and(eq(dailyRecords.classId, classId), eq(dailyRecords.date, date)))

  const pointsSummary = await db
    .select({
      studentId: studentPoints.studentId,
      total: sql<number>`COALESCE(SUM(${studentPoints.points}), 0)`,
    })
    .from(studentPoints)
    .where(eq(studentPoints.classId, classId))
    .groupBy(studentPoints.studentId)

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
