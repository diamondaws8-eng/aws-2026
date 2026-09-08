import { NextRequest, NextResponse } from 'next/server'
import { getClassPointsTotals } from '@/lib/points'
import { getTeacherClassAccess } from '@/lib/teacher-access'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const classId = searchParams.get('classId')
  const date = searchParams.get('date')

  if (!classId || !date) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  // Behaviour notes and attendance are sensitive — this must never answer an
  // anonymous request just because the caller knows a class id. Once the class
  // has an assigned subject this also refuses a teacher who isn't assigned to
  // it (see lib/teacher-access.ts for the rollout-safe fallback).
  const access = await getTeacherClassAccess(classId)
  if (access.status === 'no-session') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (access.status === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Shared attendance + this teacher's own assessment, never a colleague's.
  const { getAbsenceLocks } = await import('@/app/teacher/(dashboard)/actions')
  const { getRosterForDay } = await import('@/lib/daily-roster')
  const records = await getRosterForDay(classId, date, access.access.userId)
  const absenceLocks = await getAbsenceLocks(classId, date)

  const totalsByStudent = await getClassPointsTotals(classId)
  const pointsSummary = Object.entries(totalsByStudent).map(([studentId, total]) => ({ studentId, total }))

  return NextResponse.json({
    records,
    pointsSummary: pointsSummary.map(p => ({
      studentId: p.studentId,
      total: Number(p.total),
    })),
    absenceLocks,
  })
}
