'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { NotificationBell } from '@/components/notification-bell'
import { saveDailyRecords, addManualPoints, saveGrades, logParentWhatsappMessage, raiseBehaviorCase } from '../../actions'
import type { DailyStudentRecord, AbsenceLock, BlockedAbsence } from '../../actions'
import { termLabel as termLabelOf } from '@/lib/academic'
import { genderShort } from '@/lib/gender'

type Student = { id: string; fullName: string; parentPhone?: string | null; gender?: string | null }
type DailyRecord = {
  studentId: string
  attendanceStatus: string
  behavior: string | null
  homeworkStatus: string | null
  materialsStatus: string | null
  participationStatus: string | null
  teacherNote: string | null
  pointsEarned: number
}
type PointSummary = { studentId: string; total: number }
type Subject = { id: string; name: string }

type Props = {
  classInfo: { id: string; name: string; gradeName: string; schoolId: string }
  students: Student[]
  teacherName: string
  schoolName: string
  subjects: Subject[]
  initialDate: string
  initialRecords: DailyRecord[]
  pointsSummary: PointSummary[]
  savedGrades?: any[]
  absenceLocks?: AbsenceLock[]
  schoolSettings?: any
  teacherTemplates?: { positive: string[], negative: string[] }
  /** Which term marks are filed under, shown so it is never a silent guess. */
  termLabel?: string
}

type AttStatus = 'present' | 'absent' | 'late' | 'excused'
type Behavior = 'excellent' | 'good' | 'normal' | 'issue'
type Homework = 'done' | 'missing' | 'na'
type Materials = 'brought' | 'missing' | 'na'
type Participation = 'active' | 'inactive' | 'na'

/**
 * Attendance is one binary question — in school or not — with an optional
 * detail. Offering four equal buttons was what let متأخر and إذن slip out of
 * every total: they read as separate outcomes instead of shades of the two
 * that matter. The stored value is still one of the same four strings, so
 * nothing downstream changes.
 */
const IN_SCHOOL: AttStatus[] = ['present', 'late']
const isInSchool = (s: AttStatus) => IN_SCHOOL.includes(s)

const ATT_LABELS: Record<AttStatus, string> = {
  present: 'حاضر',
  late: 'حاضر (متأخر)',
  absent: 'غائب',
  excused: 'غائب (بعذر)',
}

const BEH_BTNS: { key: Behavior; emoji: string; label: string }[] = [
  { key: 'excellent', emoji: '😊', label: 'ممتاز' },
  { key: 'good',      emoji: '🙂', label: 'جيد' },
  { key: 'normal',    emoji: '😐', label: 'عادي' },
  { key: 'issue',     emoji: '😠', label: 'مشكلة' },
]

const HW_BTNS: { key: Homework; label: string; cls: string }[] = [
  { key: 'done',    label: '✅ أنجز',  cls: 'bg-emerald-50 text-emerald-700 border-emerald-300' },
  { key: 'missing', label: '❌ لم ينجز', cls: 'bg-red-50 text-red-700 border-red-300' },
  { key: 'na',      label: '—',        cls: 'bg-muted text-muted-foreground border-border' },
]

const MAT_BTNS: { key: Materials; label: string; cls: string }[] = [
  { key: 'brought', label: '✅ أحضر',  cls: 'bg-orange-50 text-orange-700 border-orange-300' },
  { key: 'missing', label: '❌ لم يحضر', cls: 'bg-red-50 text-red-700 border-red-300' },
  { key: 'na',      label: '—',        cls: 'bg-muted text-muted-foreground border-border' },
]

const PART_BTNS: { key: Participation; label: string; cls: string }[] = [
  { key: 'active',   label: '🌟 مشارك',  cls: 'bg-sky-50 text-sky-700 border-sky-300' },
  { key: 'inactive', label: '😴 غير مشارك', cls: 'bg-slate-50 text-slate-700 border-slate-300' },
  { key: 'na',       label: '—',        cls: 'bg-muted text-muted-foreground border-border' },
]

// ── Points calculation ─────────────────────────────────────────────────────────
function calcPoints(att: AttStatus, beh: Behavior, hw: Homework, mat: Materials, part: Participation, settings: any): number {
  let total = 0
  const f = settings?.features || {}
  const p = settings?.points || {}

  if (f.attendance !== false) {
    if (att === 'present') total += (p.attendance_present ?? 1)
    else if (att === 'late') total += (p.attendance_late ?? 0)
    else if (att === 'absent') total += (p.attendance_absent ?? -1)
  }

  if (f.behavior !== false) {
    if (beh === 'excellent') total += (p.behavior_excellent ?? 2)
    else if (beh === 'issue') total += (p.behavior_bad ?? -2)
    else if (beh === 'good') total += (p.behavior_good ?? 1)
  }

  if (f.homework !== false) {
    if (hw === 'done') total += (p.homework_done ?? 1)
    else if (hw === 'missing') total += (p.homework_notdone ?? -1)
  }

  if (f.materials !== false) {
    if (mat === 'brought') total += (p.materials_brought ?? 1)
    else if (mat === 'missing') total += (p.materials_missing ?? -1)
  }

  if (f.participation !== false) {
    if (part === 'active') total += (p.participation_active ?? 2)
    else if (part === 'inactive') total += (p.participation_inactive ?? 0)
  }

  return total
}

// ── Date helpers ──────────────────────────────────────────────────────────────
function addDays(dateStr: string, days: number): string {
  // Whole thing in UTC: the string parses as UTC midnight, so stepping the
  // local date and reading back UTC could straddle a day on some machines.
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

/**
 * Numbers stored as 0501234567, 501234567, 966501234567 or +966 50 123 4567
 * all mean the same line. Prefixing 966 blindly turned the last two into
 * 966966… and the message went nowhere.
 */
function toSaudiMsisdn(raw: string | null | undefined): string {
  const digits = (raw ?? '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('966')) return digits
  if (digits.startsWith('0')) return `966${digits.slice(1)}`
  return `966${digits}`
}

function formatDateArabic(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  // 'ar-SA' alone renders the Hijri calendar, which never matches the stored
  // Gregorian date the teacher is editing.
  return d.toLocaleDateString('ar-SA-u-ca-gregory', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
}

// ── MAIN COMPONENT ─────────────────────────────────────────────────────────────
export default function ClassRoster({
  classInfo, students, teacherName, schoolName, subjects, initialDate, initialRecords, pointsSummary, savedGrades, absenceLocks, schoolSettings, teacherTemplates, termLabel
}: Props) {
  const router = useRouter()
  // A roster only needs to distinguish boys from girls where it actually
  // holds both — the mixed first three primary years. Everywhere else the
  // badge would be noise on every single row.
  const isMixedClass =
    students.some(s => s.gender === 'male') && students.some(s => s.gender === 'female')
  const [activeTab, setActiveTab] = useState<'daily' | 'grades' | 'points'>('daily')
  const [selectedDate, setSelectedDate] = useState(initialDate)

  // Per-student daily state
  const [attendance, setAttendance] = useState<Record<string, AttStatus>>({})
  const [behavior, setBehavior] = useState<Record<string, Behavior>>({})
  const [homework, setHomework] = useState<Record<string, Homework>>({})
  const [materials, setMaterials] = useState<Record<string, Materials>>({})
  const [participation, setParticipation] = useState<Record<string, Participation>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [points, setPoints] = useState<Record<string, number>>({})

  // UI state
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')
  const [loadingDate, setLoadingDate] = useState(false)

  // Manual point modal
  const [manualStudent, setManualStudent] = useState<string | null>(null)
  const [manualPoints, setManualPoints] = useState<number>(0)
  const [manualReason, setManualReason] = useState('')
  const [addingPoints, setAddingPoints] = useState(false)
  const [manualError, setManualError] = useState('')

  // WhatsApp modal
  const [whatsappModal, setWhatsappModal] = useState<{ student: Student; type: 'positive' | 'negative' } | null>(null)

  // An absence recorded by another teacher holds for the whole day, so those
  // students are locked here and the reason is shown instead of being silent.
  const [locks, setLocks] = useState<Record<string, AbsenceLock>>(() =>
    Object.fromEntries((absenceLocks ?? []).map(l => [l.studentId, l]))
  )
  // Raising a case replaces messaging a family directly: a note written in a
  // bad moment cannot be taken back once it reaches a home.
  const [caseModal, setCaseModal] = useState<Student | null>(null)
  const [caseNote, setCaseNote] = useState('')
  const [caseBusy, setCaseBusy] = useState(false)
  const [caseError, setCaseError] = useState('')
  const [caseSent, setCaseSent] = useState<Set<string>>(new Set())

  const submitCase = async () => {
    if (!caseModal) return
    setCaseBusy(true)
    setCaseError('')
    try {
      const res = await raiseBehaviorCase({ studentId: caseModal.id, classId: classInfo.id, note: caseNote })
      if (!res.ok) { setCaseError(res.error); return }
      setCaseSent(prev => new Set(prev).add(caseModal.id))
      setCaseModal(null)
      setCaseNote('')
    } catch {
      setCaseError('تعذّر رفع الحالة')
    } finally {
      setCaseBusy(false)
    }
  }

  const [lockCard, setLockCard] = useState<{ student: Student; lock: AbsenceLock } | null>(null)
  const [blockedNotice, setBlockedNotice] = useState<BlockedAbsence[]>([])

  /**
   * Every row opens on حاضر/جيد/أنجز, so one press of حفظ can award a full day
   * to thirty students the teacher never looked at. The defaults stay — they
   * are what makes the screen fast — but a row nobody touched and that has no
   * record yet is marked, and the count sits next to the save button.
   */
  const [reviewed, setReviewed] = useState<Set<string>>(new Set())
  const touch = (id: string) => setReviewed(r => (r.has(id) ? r : new Set(r).add(id)))

  // Grades Tab State
  const [selectedSubject, setSelectedSubject] = useState<string>(subjects[0]?.id || '')
  const [examName, setExamName] = useState<string>('')
  const [examType, setExamType] = useState<string>('quiz')
  const [maxScore, setMaxScore] = useState<number>(10)
  const [scores, setScores] = useState<Record<string, string>>({})
  const [savingGrades, setSavingGrades] = useState(false)
  const [gradesSaved, setGradesSaved] = useState(false)

  // Initialize from loaded records
  const initFromRecords = useCallback((recs: DailyRecord[]) => {
    const att: Record<string, AttStatus> = {}
    const beh: Record<string, Behavior> = {}
    const hw: Record<string, Homework> = {}
    const mat: Record<string, Materials> = {}
    const part: Record<string, Participation> = {}
    const nt: Record<string, string> = {}
    students.forEach(s => {
      att[s.id] = 'present'; beh[s.id] = 'good'; hw[s.id] = 'done'; mat[s.id] = 'brought'; part[s.id] = 'active'
    })
    recs.forEach(r => {
      att[r.studentId] = r.attendanceStatus as AttStatus
      beh[r.studentId] = (r.behavior || 'good') as Behavior
      hw[r.studentId] = (r.homeworkStatus || 'done') as Homework
      mat[r.studentId] = (r.materialsStatus || 'brought') as Materials
      part[r.studentId] = (r.participationStatus || 'active') as Participation
      nt[r.studentId] = r.teacherNote || ''
    })
    setAttendance(att); setBehavior(beh); setHomework(hw); setMaterials(mat); setParticipation(part); setNotes(nt)
    // A student the register already holds has been seen before.
    setReviewed(new Set(recs.map(r => r.studentId)))
  }, [students])

  useEffect(() => {
    initFromRecords(initialRecords)
    const pts: Record<string, number> = {}
    students.forEach(s => { pts[s.id] = 0 })
    pointsSummary.forEach(p => { pts[p.studentId] = p.total })
    setPoints(pts)
  }, [])

  // Navigate dates
  const navigateDate = async (newDate: string) => {
    if (newDate > initialDate) return // can't go to future
    setLoadingDate(true)
    try {
      const res = await fetch(`/api/daily-records?classId=${classInfo.id}&date=${newDate}`)
      const data = await res.json()
      initFromRecords(data.records || [])
      setLocks(Object.fromEntries(((data.absenceLocks ?? []) as AbsenceLock[]).map(l => [l.studentId, l])))
      setSelectedDate(newDate)
    } catch {
      // fallback: reset to defaults
      const att: Record<string, AttStatus> = {}
      const beh: Record<string, Behavior> = {}
      const hw: Record<string, Homework> = {}
      const mat: Record<string, Materials> = {}
      const part: Record<string, Participation> = {}
      students.forEach(s => { att[s.id] = 'present'; beh[s.id] = 'good'; hw[s.id] = 'done'; mat[s.id] = 'brought'; part[s.id] = 'active' })
      setAttendance(att); setBehavior(beh); setHomework(hw); setMaterials(mat); setParticipation(part); setNotes({})
      setLocks({})
      setSelectedDate(newDate)
    } finally {
      setLoadingDate(false)
    }
  }

  const handleSaveDay = async () => {
    setSaving(true)
    try {
      const records: DailyStudentRecord[] = students.map(s => ({
        studentId: s.id,
        attendanceStatus: attendance[s.id] || 'present',
        behavior: behavior[s.id] || 'good',
        homeworkStatus: homework[s.id] || 'done',
        materialsStatus: materials[s.id] || 'brought',
        participationStatus: participation[s.id] || 'active',
        teacherNote: notes[s.id] || undefined,
      }))
      const saved = await saveDailyRecords(classInfo.id, classInfo.schoolId, selectedDate, records)
      if (!saved.ok) {
        setSavedMsg(`❌ ${saved.error}`)
        setTimeout(() => setSavedMsg(''), 4000)
        return
      }
      setSavedMsg('✓ تم حفظ اليوم بنجاح')
      // An absence another teacher recorded stands: show exactly whose it was.
      setBlockedNotice(saved.blocked)
      if (saved.blocked.length) {
        setAttendance(a => {
          const next = { ...a }
          for (const b of saved.blocked) next[b.studentId] = b.status as AttStatus
          return next
        })
      }
      // Refresh points
      const res = await fetch(`/api/daily-records?classId=${classInfo.id}&date=${selectedDate}`)
      const data = await res.json()
      setLocks(Object.fromEntries(((data.absenceLocks ?? []) as AbsenceLock[]).map(l => [l.studentId, l])))
      if (data.pointsSummary) {
        const pts: Record<string, number> = {}
        students.forEach(s => { pts[s.id] = 0 })
        data.pointsSummary.forEach((p: any) => { pts[p.studentId] = p.total })
        setPoints(pts)
      }
      setTimeout(() => setSavedMsg(''), 3000)
    } catch {
      setSavedMsg('❌ فشل الحفظ')
    } finally {
      setSaving(false)
    }
  }

  const handleAddManualPoints = async (studentId: string) => {
    if (!manualReason || manualPoints === 0) return
    setAddingPoints(true)
    try {
      await addManualPoints(studentId, classInfo.id, classInfo.schoolId, manualPoints, manualReason)
      setPoints(p => ({ ...p, [studentId]: (p[studentId] || 0) + manualPoints }))
      setManualStudent(null); setManualPoints(0); setManualReason('')
      setManualError('')
    } catch {
      // The server refuses an award over ±100 or a student outside the class.
      // Without this the modal just sat there as if nothing had happened.
      setManualError('تعذّر حفظ النقاط — تأكد أن العدد بين -100 و +100 وأن الطالب في هذا الفصل')
    } finally {
      setAddingPoints(false)
    }
  }

  // Same keys lib/points.ts scores with, so the table can never drift from
  // what the teacher's clicks are actually worth.
  const f = schoolSettings?.features || {}
  const pv = schoolSettings?.points || {}
  const pointsLegend: { label: string; pts: number }[] = [
    ...(f.attendance !== false ? [
      { label: 'حضور', pts: pv.attendance_present ?? 1 },
      { label: 'تأخر', pts: pv.attendance_late ?? 0 },
      { label: 'غياب', pts: pv.attendance_absent ?? -1 },
      { label: 'غياب بعذر', pts: 0 },
    ] : []),
    ...(f.behavior !== false ? [
      { label: 'سلوك ممتاز', pts: pv.behavior_excellent ?? 2 },
      { label: 'سلوك جيد', pts: pv.behavior_good ?? 1 },
      { label: 'ملاحظة سلوكية', pts: pv.behavior_bad ?? -2 },
    ] : []),
    ...(f.homework !== false ? [
      { label: 'إنجاز الواجب', pts: pv.homework_done ?? 1 },
      { label: 'لم ينجز الواجب', pts: pv.homework_notdone ?? -1 },
    ] : []),
    ...(f.materials !== false ? [
      { label: 'إحضار الأدوات', pts: pv.materials_brought ?? 1 },
      { label: 'لم يحضر الأدوات', pts: pv.materials_missing ?? -1 },
    ] : []),
    ...(f.participation !== false ? [
      { label: 'مشاركة متفاعلة', pts: pv.participation_active ?? 2 },
      { label: 'غير مشارك', pts: pv.participation_inactive ?? 0 },
    ] : []),
  ]

  const isToday = selectedDate === initialDate
  const isFuture = selectedDate > initialDate

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ── */}
      <div className="p-4 sm:p-6 border-b border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <NotificationBell />
            <div>
              <h1 className="text-xl font-bold">فصل {classInfo.name} — {classInfo.gradeName}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">{students.length} طالباً</p>
            </div>
          </div>

          {/* Date Navigator */}
          <div className="flex items-center gap-2 bg-muted/50 border border-border rounded-2xl px-3 py-2">
            <button
              onClick={() => navigateDate(addDays(selectedDate, +1))}
              disabled={isToday || loadingDate}
              className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-muted disabled:opacity-30 font-bold text-lg transition-colors"
              title="اليوم التالي"
            >›</button>

            <div className="text-center px-2 min-w-[160px]">
              {loadingDate ? (
                <div className="text-sm text-muted-foreground animate-pulse">جاري التحميل...</div>
              ) : (
                <>
                  <p className="text-sm font-bold">{formatDateArabic(selectedDate)}</p>
                  {!isToday && (
                    <span className="text-xs text-amber-600 font-semibold">تعديل يوم سابق</span>
                  )}
                  {isToday && (
                    <span className="text-xs text-emerald-600 font-semibold">اليوم</span>
                  )}
                </>
              )}
            </div>

            <button
              onClick={() => navigateDate(addDays(selectedDate, -1))}
              disabled={loadingDate}
              className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-muted font-bold text-lg transition-colors"
              title="اليوم السابق"
            >‹</button>

            <input
              type="date"
              value={selectedDate}
              max={initialDate}
              onChange={e => navigateDate(e.target.value)}
              className="text-xs bg-transparent border-none outline-none cursor-pointer w-5 opacity-50 hover:opacity-100"
              title="اختر تاريخاً"
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4 bg-muted/40 rounded-xl p-1">
          {[
            { id: 'daily', label: '📋 السجل اليومي' },
            { id: 'grades', label: '📊 الدرجات' },
            { id: 'points', label: '🏆 النقاط' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                activeTab === t.id
                  ? 'bg-card shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >{t.label}</button>
          ))}
        </div>
      </div>

      {/* ── Daily Tab ── */}
      {activeTab === 'daily' && (
        <div className="flex-1 overflow-auto">
          <div className="mx-4 mt-4 rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-xs leading-6 text-muted-foreground">
            <span className="font-semibold text-foreground">الحضور والغياب مشترك</span> بين كل معلمي الفصل — أول من يسجّله يثبّته لليوم،
            وأي معلم يستطيع منح الطالب إذناً بالخروج في حصته.
            {' '}أما <span className="font-semibold text-foreground">السلوك والواجب والأدوات والمشاركة</span> فهي تقييمك أنت وحدك في حصتك،
            لا يراها زميلك ولا تُفرض عليه.
          </div>
          {blockedNotice.length > 0 && (
            <div className="m-4 rounded-2xl border border-red-200 bg-red-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-red-700 text-sm">
                    🔒 {blockedNotice.length} من الطلاب سُجِّل غيابهم مسبقاً ولم يتغيّروا
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-red-700/90">
                    {blockedNotice.map(b => (
                      <li key={b.studentId}>
                        <span className="font-semibold">{b.studentName}</span>
                        {' — '}{ATT_LABELS[(b.status as AttStatus)] ?? 'غائب'}، سجّله {b.teacherName}
                        {b.at ? ` الساعة ${new Date(b.at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Riyadh' })}` : ''}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-red-700/80">
                    الطالب الغائب يُحتسب غائباً في بقية الحصص، ولا يستطيع تعديل الحالة إلا المعلم الذي سجّلها.
                  </p>
                </div>
                <button
                  onClick={() => setBlockedNotice([])}
                  className="shrink-0 rounded-full px-2 text-lg leading-none text-red-700 hover:bg-red-100"
                  aria-label="إغلاق"
                >×</button>
              </div>
            </div>
          )}
          {students.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">لا يوجد طلاب في هذا الفصل</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60 text-muted-foreground font-semibold text-xs sticky top-0 z-10">
                    <tr>
                      {/* The ordinal is the first thing worth losing on a phone. */}
                      <th className="hidden sm:table-cell px-3 py-3 text-center w-10">#</th>
                      {/* Pinned. The row is about 1240px wide, so on a phone the
                          teacher scrolls sideways through six columns — and without
                          this they end up marking a pupil whose name has scrolled
                          out of sight. */}
                      <th className="sticky right-0 z-20 bg-muted px-3 py-3 text-right min-w-[150px]">الطالب</th>
                      {schoolSettings?.features?.attendance !== false && <th className="px-3 py-3 text-center min-w-[220px]">الحضور</th>}
                      {schoolSettings?.features?.behavior !== false && <th className="px-3 py-3 text-center min-w-[160px]">السلوك</th>}
                      {schoolSettings?.features?.homework !== false && <th className="px-3 py-3 text-center min-w-[180px]">الواجب</th>}
                      {schoolSettings?.features?.materials !== false && <th className="px-3 py-3 text-center min-w-[180px]">الأدوات</th>}
                      {schoolSettings?.features?.participation !== false && <th className="px-3 py-3 text-center min-w-[180px]">المشاركة</th>}
                      <th className="px-3 py-3 text-center w-20">النقاط</th>
                      <th className="px-3 py-3 text-center min-w-[100px]">واتساب</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {students.map((student, idx) => {
                      const att = attendance[student.id] || 'present'
                      const beh = behavior[student.id] || 'good'
                      const hw = homework[student.id] || 'done'
                      const mat = materials[student.id] || 'brought'
                      const part = participation[student.id] || 'active'
                      const lock = locks[student.id]
                      const previewPts = calcPoints(lock ? (lock.status as AttStatus) : att, beh, hw, mat, part, schoolSettings)
                      const totalPts = points[student.id] ?? 0
                      const phone = student.parentPhone?.replace(/\D/g, '') || ''

                      return (
                        <tr key={student.id} className={`hover:bg-muted/20 transition-colors ${
                          lock || att === 'absent' ? 'bg-red-50/30'
                          : att === 'late' ? 'bg-amber-50/30'
                          : !reviewed.has(student.id) ? 'bg-amber-50/20' : ''
                        }`}>
                          <td className="hidden sm:table-cell px-3 py-3 text-center text-xs text-muted-foreground">{idx + 1}</td>
                          <td className="sticky right-0 z-10 bg-card px-3 py-3 font-semibold">
                            <span className="flex items-center gap-1.5">
                              {!reviewed.has(student.id) && (
                                <span className="size-1.5 shrink-0 rounded-full bg-amber-400" title="لم تُراجع بعد" />
                              )}
                              <Link href={`/teacher/classes/${classInfo.id}/students/${student.id}`} className="hover:text-primary hover:underline">
                                {student.fullName}
                              </Link>
                              {/* Shown only where it tells the teacher something:
                                  in a class that really holds both. */}
                              {isMixedClass && (
                                <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                                  student.gender === 'female' ? 'bg-pink-100 text-pink-700'
                                  : student.gender === 'male' ? 'bg-blue-100 text-blue-700'
                                  : 'bg-amber-100 text-amber-700'}`}>
                                  {genderShort(student.gender)}
                                </span>
                              )}
                            </span>
                          </td>

                          {/* Attendance */}
                          {schoolSettings?.features?.attendance !== false && (
                            <td className="px-2 py-2">
                              {lock ? (
                                // Locked: the student is out of school for the whole
                                // day, so the buttons explain instead of pretending.
                                <button
                                  onClick={() => setLockCard({ student, lock })}
                                  className="mx-auto flex items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-3 py-2.5 sm:py-1.5 min-h-11 sm:min-h-0 text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors"
                                  title="اضغط لمعرفة من سجّل الغياب"
                                >
                                  <span>🔒</span>
                                  <span>{ATT_LABELS[(lock.status as AttStatus)] ?? 'غائب'} — مسجَّل مسبقاً</span>
                                </button>
                              ) : (
                                <div className="flex flex-col items-center gap-1.5">
                                  <div className="flex gap-1 justify-center">
                                    {/* Pressing the group the student is already in keeps the detail. */}
                                    <button
                                      onClick={() => { touch(student.id); setAttendance(a => ({ ...a, [student.id]: isInSchool(att) ? att : 'present' })) }}
                                      className={`px-4 py-3 sm:py-1 min-h-11 sm:min-h-0 rounded-lg text-xs font-semibold border transition-all ${
                                        isInSchool(att)
                                          ? 'bg-emerald-100 text-emerald-700 border-emerald-400'
                                          : 'bg-card text-muted-foreground border-border hover:bg-muted'
                                      }`}
                                    >حاضر</button>
                                    <button
                                      onClick={() => { touch(student.id); setAttendance(a => ({ ...a, [student.id]: isInSchool(att) ? 'absent' : att })) }}
                                      className={`px-4 py-3 sm:py-1 min-h-11 sm:min-h-0 rounded-lg text-xs font-semibold border transition-all ${
                                        !isInSchool(att)
                                          ? 'bg-red-100 text-red-700 border-red-400'
                                          : 'bg-card text-muted-foreground border-border hover:bg-muted'
                                      }`}
                                    >غائب</button>
                                  </div>
                                  <button
                                    onClick={() => { touch(student.id); setAttendance(a => ({
                                      ...a,
                                      [student.id]: isInSchool(att)
                                        ? (att === 'late' ? 'present' : 'late')
                                        : (att === 'excused' ? 'absent' : 'excused'),
                                    })) }}
                                    // 22px tall on a phone was the smallest thing a teacher
                                    // had to hit 28 times a morning. Measured, not guessed.
                                    className={`px-3 py-2 sm:py-0.5 min-h-10 sm:min-h-0 rounded-full text-[11px] font-semibold border transition-all ${
                                      att === 'late'
                                        ? 'bg-amber-100 text-amber-700 border-amber-400'
                                        : att === 'excused'
                                          ? 'bg-blue-100 text-blue-700 border-blue-400'
                                          : 'bg-card text-muted-foreground border-dashed border-border hover:bg-muted'
                                    }`}
                                  >
                                    {isInSchool(att)
                                      ? (att === 'late' ? '✓ متأخر' : '+ متأخر')
                                      : (att === 'excused' ? '✓ بعذر' : '+ بعذر')}
                                  </button>
                                </div>
                              )}
                            </td>
                          )}

                          {/* Behavior */}
                          {schoolSettings?.features?.behavior !== false && (
                            <td className="px-2 py-2 align-top">
                              <div className="flex flex-col gap-1.5 items-center">
                                <div className="flex gap-1 justify-center">
                                  {BEH_BTNS.map(btn => (
                                    <button
                                      key={btn.key}
                                      onClick={() => { touch(student.id); setBehavior(b => ({ ...b, [student.id]: btn.key })) }}
                                      title={btn.label}
                                      className={`w-11 h-11 sm:w-9 sm:h-9 rounded-xl text-lg transition-all border flex-shrink-0 ${
                                        beh === btn.key ? 'bg-primary/10 border-primary scale-110' : 'bg-card border-border hover:scale-105'
                                      }`}
                                    >{btn.emoji}</button>
                                  ))}
                                </div>
                                {(beh === 'issue' || beh === 'normal') && (
                                  <input
                                    type="text"
                                    placeholder="ملاحظة لولي الأمر..."
                                    value={notes[student.id] || ''}
                                    onChange={e => { touch(student.id); setNotes(n => ({ ...n, [student.id]: e.target.value })) }}
                                    className="w-full min-w-[120px] text-xs p-1.5 rounded-md border border-amber-300 bg-amber-50/50 focus:outline-none focus:ring-1 focus:ring-amber-500 placeholder:text-muted-foreground"
                                  />
                                )}
                              </div>
                            </td>
                          )}

                          {/* Homework */}
                          {schoolSettings?.features?.homework !== false && (
                            <td className="px-2 py-2">
                              <div className="flex gap-1 justify-center">
                                {HW_BTNS.map(btn => (
                                  <button
                                    key={btn.key}
                                    onClick={() => { touch(student.id); setHomework(h => ({ ...h, [student.id]: btn.key })) }}
                                    className={`px-2 py-3 sm:py-1 min-h-11 sm:min-h-0 rounded-lg text-xs font-semibold border transition-all ${
                                      hw === btn.key ? btn.cls : 'bg-card text-muted-foreground border-border hover:bg-muted'
                                    }`}
                                  >{btn.label}</button>
                                ))}
                              </div>
                            </td>
                          )}

                          {/* Materials */}
                          {schoolSettings?.features?.materials !== false && (
                            <td className="px-2 py-2">
                              <div className="flex gap-1 justify-center">
                                {MAT_BTNS.map(btn => (
                                  <button
                                    key={btn.key}
                                    onClick={() => { touch(student.id); setMaterials(m => ({ ...m, [student.id]: btn.key })) }}
                                    className={`px-2 py-3 sm:py-1 min-h-11 sm:min-h-0 rounded-lg text-xs font-semibold border transition-all ${
                                      mat === btn.key ? btn.cls : 'bg-card text-muted-foreground border-border hover:bg-muted'
                                    }`}
                                  >{btn.label}</button>
                                ))}
                              </div>
                            </td>
                          )}

                          {/* Participation */}
                          {schoolSettings?.features?.participation !== false && (
                            <td className="px-2 py-2">
                              <div className="flex gap-1 justify-center">
                                {PART_BTNS.map(btn => (
                                  <button
                                    key={btn.key}
                                    onClick={() => { touch(student.id); setParticipation(p => ({ ...p, [student.id]: btn.key })) }}
                                    className={`px-2 py-3 sm:py-1 min-h-11 sm:min-h-0 rounded-lg text-xs font-semibold border transition-all ${
                                      part === btn.key ? btn.cls : 'bg-card text-muted-foreground border-border hover:bg-muted'
                                    }`}
                                  >{btn.label}</button>
                                ))}
                              </div>
                            </td>
                          )}

                          {/* Points preview */}
                          <td className="px-2 py-2 text-center">
                            <div className="space-y-0.5">
                              <div className={`text-sm font-bold ${totalPts >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                {totalPts > 0 ? '+' : ''}{totalPts}
                              </div>
                              <div className={`text-xs ${previewPts > 0 ? 'text-emerald-500' : previewPts < 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                                {previewPts > 0 ? '+' : ''}{previewPts} اليوم
                              </div>
                            </div>
                          </td>

                          {/* WhatsApp */}
                          <td className="px-2 py-2">
                            {phone ? (
                              <div className="flex gap-1 justify-center">
                                <button
                                  onClick={() => setCaseModal(student)}
                                  title="رفع حالة للموجه الطلابي"
                                  className="w-11 h-11 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 transition-colors text-base"
                                >⚠</button>
                                <button
                                  onClick={() => setWhatsappModal({ student, type: 'positive' })}
                                  title="رسالة شكر / إيجابية"
                                  className="w-11 h-11 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 transition-colors text-base"
                                >🏅</button>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground text-center block">—</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Save button */}
              <div className="p-4 border-t border-border bg-card/80 backdrop-blur-sm sticky bottom-0 flex items-center justify-between">
                <div className="text-sm text-muted-foreground flex flex-wrap items-center gap-3">
                  {selectedDate !== initialDate && (
                    <span className="text-amber-600 font-semibold">⚠ تعديل يوم سابق: {selectedDate}</span>
                  )}
                  {students.length > reviewed.size && (
                    <span className="text-amber-600 font-semibold">
                      لم تُراجَع {students.length - reviewed.size} من {students.length} — ستُحفظ بالقيم الافتراضية
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {savedMsg && <span className={`text-sm font-semibold ${savedMsg.startsWith('❌') ? 'text-red-600' : 'text-emerald-600'}`}>{savedMsg}</span>}
                  <button
                    onClick={handleSaveDay}
                    disabled={saving}
                    className="px-8 py-2.5 bg-primary text-primary-foreground font-bold rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity"
                  >{saving ? 'جاري الحفظ...' : '💾 حفظ اليوم'}</button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Grades Tab ── */}
      {activeTab === 'grades' && (
        <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-5">
          {subjects.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">لا توجد مواد — يرجى إضافتها من بوابة الإدارة</div>
          ) : (
            <>
              {termLabel && (
                <p className="text-xs text-muted-foreground bg-muted/50 rounded-xl px-3 py-2">
                  ستُحفظ هذه الدرجات في: <span className="font-bold text-foreground">{termLabel}</span>
                  {' — '}إن لم يكن هذا هو الفصل الحالي فأبلغ الإدارة قبل الحفظ.
                </p>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">المادة</label>
                  <select value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)} className="w-full p-2.5 rounded-xl border border-border bg-background text-sm">
                    {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">اسم الاختبار</label>
                  <input type="text" value={examName} onChange={e => setExamName(e.target.value)} placeholder="اختبار قصير ١" className="w-full p-2.5 rounded-xl border border-border bg-background text-sm" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">نوع الاختبار</label>
                  <select value={examType} onChange={e => setExamType(e.target.value)} className="w-full p-2.5 rounded-xl border border-border bg-background text-sm">
                    <option value="quiz">اختبار قصير</option>
                    <option value="midterm">اختبار منتصف الفصل</option>
                    <option value="final">اختبار نهائي</option>
                    <option value="assignment">واجب / مشروع</option>
                    <option value="oral">شفهي</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">الدرجة القصوى</label>
                  <input type="number" value={maxScore} onChange={e => setMaxScore(+e.target.value)} min={1} className="w-full p-2.5 rounded-xl border border-border bg-background text-sm" />
                </div>
              </div>

              <table className="w-full text-sm border border-border rounded-xl overflow-hidden">
                <thead className="bg-muted text-muted-foreground text-xs font-semibold">
                  <tr>
                    <th className="px-4 py-3 text-right">#</th>
                    <th className="px-4 py-3 text-right">الطالب</th>
                    <th className="px-4 py-3 text-center">الدرجة (من {maxScore})</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {students.map((s, i) => (
                    <tr key={s.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3 text-muted-foreground">{i + 1}</td>
                      <td className="px-4 py-3 font-semibold">{s.fullName}</td>
                      <td className="px-4 py-3 text-center">
                        <input
                          type="number" min={0} max={maxScore}
                          value={scores[s.id] || ''}
                          onChange={e => setScores(sc => ({ ...sc, [s.id]: e.target.value }))}
                          className="w-20 p-2 rounded-lg border border-border bg-background text-center text-sm"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex justify-end gap-3">
                {gradesSaved && <span className="text-emerald-600 font-semibold text-sm">✓ تم حفظ الدرجات</span>}
                <button
                  disabled={savingGrades || !examName}
                  onClick={async () => {
                    setSavingGrades(true)
                    try {
                      const entries = Object.entries(scores).filter(([, v]) => v !== '').map(([id, v]) => ({ studentId: id, score: +v }))
                      if (entries.length === 0) return
                      
                      const res = await saveGrades({
                        classId: classInfo.id,
                        schoolId: classInfo.schoolId,
                        subjectId: selectedSubject,
                        examName: examName,
                        examType: examType,
                        maxScore: maxScore,
                        entries: entries
                      })
                      if (!res.ok) { alert(res.error); return }

                      setGradesSaved(true)
                      setTimeout(() => setGradesSaved(false), 3000)
                      setScores({})
                      // A full reload discarded the daily tab's unsaved work;
                      // refreshing the server data keeps the page as it is.
                      router.refresh()
                    } catch {
                      alert('حدث خطأ أثناء الحفظ')
                    } finally { setSavingGrades(false) }
                  }}
                  className="px-8 py-2.5 bg-primary text-primary-foreground font-bold rounded-xl hover:opacity-90 disabled:opacity-50"
                >{savingGrades ? 'جاري الحفظ...' : '💾 حفظ الدرجات'}</button>
              </div>

              {/* Saved Grades List */}
              {savedGrades && savedGrades.length > 0 && (
                <div className="mt-8 pt-8 border-t border-border">
                  <h3 className="font-bold text-lg mb-4">الدرجات المحفوظة</h3>
                  <div className="space-y-3">
                    {/* Group by Exam Name and Subject */}
                    {/* The key carries the term and the year. Without them, an
                        exam of the same name in the second term collapsed into
                        the first term's row and showed one combined count —
                        two different exams reported as one. */}
                    {Object.entries(
                      savedGrades.reduce((acc, curr) => {
                        const key = `${curr.academicYear}_${curr.semester}_${curr.subjectId}_${curr.examName}`
                        if (!acc[key]) acc[key] = {
                          examName: curr.examName, subjectId: curr.subjectId, maxScore: curr.maxScore,
                          semester: curr.semester, academicYear: curr.academicYear,
                          count: 0, date: curr.createdAt,
                        }
                        acc[key].count++
                        return acc
                      }, {} as Record<string, any>)
                    ).map(([key, group]: any) => {
                      const subj = subjects.find(s => s.id === group.subjectId)
                      const isCurrentTerm = termLabel === termLabelOf(group.semester, group.academicYear)
                      return (
                        <div key={key} className="p-4 bg-muted/20 border border-border rounded-xl flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-bold">{group.examName}</div>
                            <div className="text-sm text-muted-foreground">{subj?.name}</div>
                            <div className={`text-xs mt-1 ${isCurrentTerm ? 'text-muted-foreground' : 'text-amber-700 font-semibold'}`}>
                              {termLabelOf(group.semester, group.academicYear)}
                              {!isCurrentTerm && ' — فصل سابق'}
                            </div>
                          </div>
                          <div className="text-left shrink-0">
                            <div className="text-sm font-semibold">{group.count} طالب</div>
                            <div className="text-xs text-muted-foreground">الدرجة من {group.maxScore}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Points Tab ── */}
      {activeTab === 'points' && (
        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <table className="w-full text-sm border border-border rounded-xl overflow-hidden">
            <thead className="bg-muted text-muted-foreground text-xs font-semibold">
              <tr>
                <th className="px-4 py-3 text-right">#</th>
                <th className="px-4 py-3 text-right">الطالب</th>
                <th className="px-4 py-3 text-center">إجمالي النقاط</th>
                <th className="px-4 py-3 text-center">الترتيب</th>
                <th className="px-4 py-3 text-center">تعديل يدوي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[...students]
                .sort((a, b) => (points[b.id] ?? 0) - (points[a.id] ?? 0))
                .map((student, idx) => {
                  const total = points[student.id] ?? 0
                  const medals = ['🥇', '🥈', '🥉']
                  return (
                    <tr key={student.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3 text-muted-foreground">{idx + 1}</td>
                      <td className="px-4 py-3 font-semibold">
                        <Link href={`/teacher/classes/${classInfo.id}/students/${student.id}`} className="hover:text-primary hover:underline">
                          {student.fullName}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-lg font-bold ${total >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {total > 0 ? '+' : ''}{total}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-xl">
                        {idx < 3 ? medals[idx] : <span className="text-sm text-muted-foreground">{idx + 1}</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {manualStudent === student.id ? (
                          <div className="flex items-center gap-2 justify-center">
                            <input
                              type="number"
                              value={manualPoints}
                              onChange={e => setManualPoints(+e.target.value)}
                              className="w-16 p-1.5 rounded-lg border border-border bg-background text-center text-sm"
                              placeholder="+/-"
                            />
                            <input
                              type="text"
                              value={manualReason}
                              onChange={e => setManualReason(e.target.value)}
                              className="w-32 p-1.5 rounded-lg border border-border bg-background text-sm"
                              placeholder="السبب"
                            />
                            <button
                              onClick={() => handleAddManualPoints(student.id)}
                              disabled={addingPoints}
                              className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold"
                            >حفظ</button>
                            <button
                              onClick={() => { setManualStudent(null); setManualError('') }}
                              className="px-2 py-1.5 bg-muted rounded-lg text-xs"
                            >إلغاء</button>
                            {manualError && (
                              <span className="text-xs font-semibold text-red-600">{manualError}</span>
                            )}
                          </div>
                        ) : (
                          <button
                            onClick={() => { setManualStudent(student.id); setManualError('') }}
                            className="px-3 py-1.5 bg-muted hover:bg-muted/70 rounded-lg text-xs font-semibold transition-colors"
                          >✏️ تعديل</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>

          {/* Points legend — read from the school's settings, never hand-typed:
              the old fixed list showed numbers the system had stopped using. */}
          <div className="mt-6 p-4 bg-muted/30 border border-border rounded-2xl">
            <h3 className="font-bold text-sm mb-1">جدول النقاط التلقائية</h3>
            <p className="text-xs text-muted-foreground mb-3">حسب إعدادات مدرستك الحالية</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              {pointsLegend.length === 0 ? (
                <p className="text-muted-foreground col-span-full">كل بنود النقاط معطّلة من الإعدادات</p>
              ) : pointsLegend.map(item => (
                <div key={item.label} className="flex justify-between bg-card p-2 rounded-lg border border-border">
                  <span>{item.label}</span>
                  <span className={`font-bold ${item.pts > 0 ? 'text-emerald-600' : item.pts < 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                    {item.pts > 0 ? '+' : ''}{item.pts}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {/* ── Raise a behaviour case ── */}
      {caseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-background rounded-3xl border border-border shadow-xl w-full max-w-lg">
            <div className="p-4 border-b border-border flex items-center justify-between bg-red-50 dark:bg-red-950/20">
              <h3 className="font-bold text-lg text-red-700 dark:text-red-400">⚠ رفع حالة للموجه الطلابي</h3>
              <button onClick={() => { setCaseModal(null); setCaseError('') }} className="size-8 rounded-full hover:bg-black/10 text-xl leading-none">×</button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm">
                الطالب: <span className="font-bold">{caseModal.fullName}</span>
              </p>
              <div className="rounded-xl bg-muted/50 border border-border p-3 text-xs leading-6 text-muted-foreground">
                لن تصل هذه الملاحظة إلى ولي الأمر مباشرة. يقرؤها الموجه الطلابي أولاً، ثم يقرر:
                يعالجها مع الطالب، أو يبلّغ ولي الأمر بصياغته، أو يحيلها للوكيل. وسترى أنت نتيجة القرار.
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1.5">ما الذي حدث؟</label>
                <textarea
                  value={caseNote}
                  onChange={(e) => setCaseNote(e.target.value)}
                  rows={5}
                  placeholder="اكتب الواقعة بوضوح: ما حدث، ومتى، وما فعلتَه حيالها..."
                  className="w-full p-3 rounded-xl border border-border bg-background text-sm leading-7"
                />
              </div>
              {caseError && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-xl">{caseError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={submitCase}
                  disabled={caseBusy || caseNote.trim().length < 5}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold disabled:opacity-50"
                >{caseBusy ? 'جاري الرفع...' : 'رفع الحالة'}</button>
                <button onClick={() => { setCaseModal(null); setCaseError('') }} className="px-5 rounded-xl bg-muted font-semibold">إلغاء</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Absence lock card ── */}
      {lockCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-background rounded-3xl shadow-xl border border-border w-full max-w-md overflow-hidden animate-in zoom-in-95">
            <div className="p-4 border-b border-border bg-red-50 dark:bg-red-950/20 flex items-center justify-between">
              <h3 className="font-bold text-lg text-red-700 dark:text-red-400">🔒 غياب مسجَّل مسبقاً</h3>
              <button onClick={() => setLockCard(null)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/10 text-xl leading-none">×</button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm leading-7">
                الطالب <span className="font-bold">{lockCard.student.fullName}</span> مسجَّل اليوم{' '}
                <span className="font-bold">{ATT_LABELS[(lockCard.lock.status as AttStatus)] ?? 'غائب'}</span>{' '}
                بواسطة المعلم <span className="font-bold">{lockCard.lock.teacherName}</span>
                {lockCard.lock.at
                  ? ` الساعة ${new Date(lockCard.lock.at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Riyadh' })}`
                  : ''}.
              </p>
              <div className="rounded-xl bg-muted/50 border border-border p-3 text-xs leading-6 text-muted-foreground">
                الطالب الذي خرج من المدرسة يبقى غائباً في <span className="font-semibold text-foreground">جميع الحصص</span> لبقية اليوم،
                فلا يمكن تحضيره من هنا ولا تغيير حالته. إن كان التسجيل خطأً فالمعلم الذي سجّله هو وحده من يستطيع تعديله.
              </div>
              <button
                onClick={() => setLockCard(null)}
                className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl font-bold hover:opacity-90"
              >حسناً</button>
            </div>
          </div>
        </div>
      )}

      {/* ── WhatsApp Templates Modal ── */}
      {whatsappModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-background rounded-3xl shadow-xl border border-border w-full max-w-lg overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[90vh]">
            <div className={`p-4 border-b border-border flex items-center justify-between flex-shrink-0 ${whatsappModal.type === 'positive' ? 'bg-emerald-50 dark:bg-emerald-950/20' : 'bg-red-50 dark:bg-red-950/20'}`}>
              <h3 className={`font-bold text-lg ${whatsappModal.type === 'positive' ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
                {whatsappModal.type === 'positive' ? '🏅 رسالة إيجابية' : '⚠️ رسالة سلبية'}
              </h3>
              <button onClick={() => setWhatsappModal(null)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/10 text-xl leading-none">×</button>
            </div>
            <div className="p-4 sm:p-6 space-y-3 overflow-auto">
              <p className="text-sm font-semibold mb-2 text-muted-foreground">اختر القالب لإرساله إلى ولي أمر الطالب: <span className="text-foreground">{whatsappModal.student.fullName}</span></p>
              
              {(() => {
                const adminTemplates = schoolSettings?.whatsappTemplates?.[whatsappModal.type] || []
                const myTemplates = teacherTemplates?.[whatsappModal.type] || []
                const combined = [...adminTemplates, ...myTemplates]

                if (combined.length === 0) {
                  return (
                    <div className="text-center p-4 text-muted-foreground bg-muted/30 rounded-xl text-sm">
                      لا توجد قوالب مضافة من قِبل الإدارة أو في إعداداتك الشخصية.
                    </div>
                  )
                }

                return combined.map((tpl: string, i: number) => {
                  let parsed = tpl
                    .replace(/{student}/g, whatsappModal.student.fullName)
                    .replace(/{teacher}/g, teacherName)
                    .replace(/{school}/g, schoolName)
                  
                  if (whatsappModal.type === 'negative' && notes[whatsappModal.student.id]) {
                    parsed += `\n\nملاحظة المعلم: ${notes[whatsappModal.student.id]}`
                  }

                  const phone = toSaudiMsisdn(whatsappModal.student.parentPhone)

                  return (
                    <button
                      key={i}
                      onClick={() => {
                        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(parsed)}`, '_blank')
                        setWhatsappModal(null)
                        void logParentWhatsappMessage({
                          schoolId: classInfo.schoolId,
                          classId: classInfo.id,
                          studentId: whatsappModal.student.id,
                          type: whatsappModal.type,
                        })
                      }}
                      className="w-full text-right p-4 rounded-xl border border-border bg-card hover:border-primary hover:bg-muted/30 transition-all focus:outline-none focus:ring-2 focus:ring-primary shadow-sm"
                    >
                      <pre className="text-sm whitespace-pre-wrap font-sans text-foreground/90">{parsed}</pre>
                    </button>
                  )
                })
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
