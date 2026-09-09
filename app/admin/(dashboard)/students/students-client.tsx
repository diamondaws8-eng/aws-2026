'use client'

import { useState, useRef } from 'react'
import { addStudent, deleteStudent, importStudents, resetParentPassword } from './actions-students'
import { EmptyState } from '@/components/empty-state'
import { normalizeGender, genderLabel, genderShort, GENDER_OPTIONS } from '@/lib/gender'
import {
  Search, Upload, UserPlus, Download, FileSpreadsheet,
  CheckCircle2, AlertTriangle, XCircle, Loader2, X, Users, Pencil, Trash2, IdCard, Phone,
  RotateCcw, Copy, KeyRound,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────
type ImportRow = {
  fullName: string
  nationalId?: string
  parentPhone?: string
  gender: string
  valid: boolean
  error?: string
}

// ── Template download ─────────────────────────────────────────────────────────
function downloadTemplate() {
  import('xlsx').then(XLSX => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['الاسم الكامل', 'رقم الهوية', 'جوال ولي الأمر', 'الجنس (ذكر/أنثى)'],
      ['محمد أحمد الغامدي', '1234567890', '0501234567', 'ذكر'],
      ['نورة سالم العتيبي', '0987654321', '0507654321', 'أنثى'],
    ])
    ws['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 15 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'الطلاب')
    XLSX.writeFile(wb, 'قالب_استيراد_الطلاب.xlsx')
  })
}

// ── Main component ────────────────────────────────────────────────────────────
export default function StudentsClient({
  students,
  classes,
  schoolId,
  canCreate = true,
}: {
  students: any[]
  classes: any[]
  schoolId: string
  /** false for read-only accounts (a deputy without edit rights). */
  canCreate?: boolean
}) {
  const [search, setSearch]           = useState('')
  const [classFilter, setClassFilter] = useState('all')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [loading, setLoading]         = useState(false)
  const [editingStudent, setEditingStudent] = useState<any | null>(null)

  // Single-add form
  const [fullName, setFullName]       = useState('')
  const [nationalId, setNationalId]   = useState('')
  const [parentPhone, setParentPhone] = useState('')
  const [gender, setGender]           = useState('male')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [classId, setClassId]         = useState('')

  // Import state
  const [importRows, setImportRows]     = useState<ImportRow[]>([])
  const [importing, setImporting]       = useState(false)
  const [importClassId, setImportClassId] = useState('')
  const [importResult, setImportResult] = useState<{ created: number; failed: number; errors: string[]; unknownGender?: number; skippedDuplicates?: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Parent password reset
  const [resettingParentId, setResettingParentId] = useState<string | null>(null)
  const [parentResetInfo, setParentResetInfo] = useState<{ studentName: string; parentPhone: string | null; tempPassword: string; mode?: 'created' | 'reset' } | null>(null)

  const handleDeleteStudent = async (student: any) => {
    if (!confirm(
      `حذف الطالب "${student.fullName}" نهائياً؟\n\n` +
      `سيتم حذف سجلات حضوره ودرجاته ونقاطه، وكذلك حساب ولي أمره إن لم يكن له أبناء آخرون في المدرسة.`
    )) return
    const res = await deleteStudent(student.id)
    if (res && !res.ok) alert(res.error)
  }

  const handleResetParentPassword = async (student: any) => {
    if (!confirm(`إعادة تعيين كلمة مرور ولي أمر "${student.fullName}"؟ ستُنشأ كلمة مرور مؤقتة جديدة وتتوقف كلمة المرور الحالية عن العمل.`)) return
    setResettingParentId(student.id)
    try {
      const res = await resetParentPassword(student.id, schoolId)
      if (res.ok && res.tempPassword) {
        setParentResetInfo({ studentName: student.fullName, parentPhone: res.parentPhone ?? student.parentPhone, tempPassword: res.tempPassword })
      } else {
        alert(res.error || 'حدث خطأ أثناء إعادة تعيين كلمة المرور')
      }
    } catch {
      alert('حدث خطأ أثناء إعادة تعيين كلمة المرور')
    } finally {
      setResettingParentId(null)
    }
  }

  const openAddModal = () => {
    setEditingStudent(null)
    setFullName('')
    setNationalId('')
    setParentPhone('')
    setGender('male')
    setDateOfBirth('')
    setClassId('')
    setIsModalOpen(true)
  }

  const openEditModal = (student: any) => {
    setEditingStudent(student)
    setFullName(student.fullName)
    setNationalId(student.nationalId || '')
    setParentPhone(student.parentPhone || '')
    setGender(student.gender || 'male')
    setDateOfBirth(student.dateOfBirth || '')
    setClassId(student.classId || '')
    setIsModalOpen(true)
  }

  // ── Filter ──────────────────────────────────────────────────────────────────
  const filteredStudents = students.filter(s => {
    const matchesSearch = s.fullName.includes(search) || (s.nationalId && s.nationalId.includes(search))
    const matchesClass  = classFilter === 'all' || s.classId === classFilter
    return matchesSearch && matchesClass
  })

  // ── Single add/edit ─────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      let res
      if (editingStudent) {
        const { editStudent } = await import('./actions-students')
        res = await editStudent(editingStudent.id, { fullName, nationalId, parentPhone, gender, dateOfBirth, classId, schoolId })
      } else {
        res = await addStudent({ fullName, nationalId, parentPhone, gender, dateOfBirth, classId, schoolId })
      }
      
      if (res && res.error) {
        alert(res.error)
      } else {
        setIsModalOpen(false)
        setEditingStudent(null)
        setFullName(''); setNationalId(''); setParentPhone(''); setGender('male'); setDateOfBirth(''); setClassId('')
      }
    } catch {
      alert(`حدث خطأ أثناء ${editingStudent ? 'تعديل' : 'إضافة'} الطالب`)
    } finally {
      setLoading(false)
    }
  }

  // ── Excel parse ─────────────────────────────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportResult(null)

    const XLSX = await import('xlsx')
    const buffer = await file.arrayBuffer()
    const wb    = XLSX.read(buffer, { type: 'array' })
    const ws    = wb.Sheets[wb.SheetNames[0]]
    const data  = XLSX.utils.sheet_to_json<any>(ws, { header: 1 })

    const rows: ImportRow[] = []
    for (let i = 1; i < data.length; i++) {
      const row = data[i]
      if (!row || row.length === 0) continue

      const rawName   = String(row[0] || '').trim()
      const rawNid    = String(row[1] || '').trim()
      const rawPhone  = String(row[2] || '').trim()
      const rawGender = String(row[3] || 'ذكر').trim()

      const valid = rawName.length >= 2
      const error = !valid ? 'الاسم فارغ أو قصير جداً' : undefined

      rows.push({
        fullName:    rawName,
        nationalId:  rawNid   || undefined,
        parentPhone: rawPhone || undefined,
        gender:      rawGender,
        valid,
        error,
      })
    }

    setImportRows(rows)
  }

  // ── Execute import ──────────────────────────────────────────────────────────
  const handleImport = async () => {
    const validRows = importRows.filter(r => r.valid)
    if (validRows.length === 0) return

    setImporting(true)
    try {
      const result = await importStudents(
        validRows.map(r => ({
          fullName:    r.fullName,
          nationalId:  r.nationalId,
          parentPhone: r.parentPhone,
          gender:      r.gender,
          classId:     importClassId || undefined,
        })),
        schoolId
      )
      setImportResult(result)
      setImportRows([])
      if (fileRef.current) fileRef.current.value = ''
    } catch {
      alert('حدث خطأ أثناء الاستيراد')
    } finally {
      setImporting(false)
    }
  }

  const validCount   = importRows.filter(r => r.valid).length
  const invalidCount = importRows.filter(r => !r.valid).length

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Header stat + Toolbar ── */}
      <div className="relative overflow-hidden bg-card border border-border rounded-2xl p-5">
        <div className="absolute -top-14 -right-10 size-40 rounded-full bg-blue-400/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col md:flex-row gap-4 justify-between md:items-center">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 text-white shadow-[0_6px_16px_-4px_rgba(37,99,235,0.45)]">
              <Users className="size-5" />
            </div>
            <div>
              <p className="text-lg font-bold">{filteredStudents.length} طالب</p>
              <p className="text-xs text-muted-foreground">من إجمالي {students.length} طالب مسجّل</p>
            </div>
          </div>

          <div className="flex gap-3 flex-wrap">
            <div className="relative min-w-[180px] max-w-sm flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="بحث بالاسم أو الهوية..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full p-3 pr-10 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <select
              value={classFilter}
              onChange={e => setClassFilter(e.target.value)}
              className="p-3 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">جميع الفصول</option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {canCreate && (
            <div className="flex gap-3">
              <button
                onClick={() => setIsImportOpen(true)}
                className="px-5 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:opacity-90 flex items-center gap-2 transition-transform hover:-translate-y-0.5"
              >
                <Upload className="size-4" /> استيراد Excel
              </button>
              <button
                onClick={openAddModal}
                className="px-5 py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:opacity-90 flex items-center gap-2 transition-transform hover:-translate-y-0.5"
              >
                <UserPlus className="size-4" /> إضافة طالب
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Students table ── */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {filteredStudents.length === 0 ? (
          <div className="p-8"><EmptyState icon={Users} title="لا يوجد طلاب" description="لم يتم العثور على طلاب مطابقين" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead className="bg-muted text-muted-foreground text-sm">
                <tr>
                  <th className="p-4 font-semibold">#</th>
                  <th className="p-4 font-semibold">الاسم</th>
                  <th className="p-4 font-semibold">الجنس</th>
                  <th className="p-4 font-semibold">رقم الهوية</th>
                  <th className="p-4 font-semibold">الفصل</th>
                  <th className="p-4 font-semibold">جوال ولي الأمر</th>
                  <th className="p-4 font-semibold text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredStudents.map((student, i) => (
                  <tr key={student.id} className="hover:bg-muted/50 transition-colors">
                    <td className="p-4 text-muted-foreground">{i + 1}</td>
                    <td className="p-4">
                      <div className="flex items-center gap-2.5">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 text-xs font-bold">
                          {student.fullName?.charAt(0) ?? '؟'}
                        </div>
                        <span className="font-semibold">{student.fullName}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      {/* An unknown is called unknown and coloured, so a bad
                          import is found by looking rather than by guessing. */}
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full border ${
                        student.gender === 'female' ? 'bg-pink-50 text-pink-700 border-pink-100'
                        : student.gender === 'male' ? 'bg-blue-50 text-blue-700 border-blue-100'
                        : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                        {genderShort(student.gender)}
                      </span>
                    </td>
                    <td className="p-4 text-muted-foreground">
                      {student.nationalId ? (
                        <span className="inline-flex items-center gap-1.5"><IdCard className="size-3.5" />{student.nationalId}</span>
                      ) : '-'}
                    </td>
                    <td className="p-4">
                      {student.gradeName ? (
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 border border-violet-100">
                          {student.gradeName} — {student.className}
                        </span>
                      ) : (
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-muted text-muted-foreground">غير مسكن</span>
                      )}
                    </td>
                    <td className="p-4 text-muted-foreground">
                      {student.parentPhone ? (
                        <span className="inline-flex items-center gap-1.5"><Phone className="size-3.5" />{student.parentPhone}</span>
                      ) : '-'}
                    </td>
                    <td className="p-4 text-center space-x-2 space-x-reverse">
                      {student.canEdit === false ? (
                        <span className="text-xs text-muted-foreground">اطّلاع فقط</span>
                      ) : (
                        <>
                          {student.parentUserId && (
                            <button
                              onClick={() => handleResetParentPassword(student)}
                              disabled={resettingParentId === student.id}
                              className="inline-flex items-center gap-1.5 text-amber-600 hover:bg-amber-50 px-3 py-1 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                              title="إعادة تعيين كلمة مرور ولي الأمر"
                            >
                              {resettingParentId === student.id ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
                              كلمة المرور
                            </button>
                          )}
                          <button
                            onClick={() => openEditModal(student)}
                            className="inline-flex items-center gap-1.5 text-blue-600 hover:bg-blue-50 px-3 py-1 rounded-lg text-sm font-semibold transition-colors"
                          >
                            <Pencil className="size-3.5" /> تعديل
                          </button>
                          <button
                            onClick={() => handleDeleteStudent(student)}
                            className="inline-flex items-center gap-1.5 text-destructive hover:bg-destructive/10 px-3 py-1 rounded-lg text-sm font-semibold transition-colors"
                          >
                            <Trash2 className="size-3.5" /> حذف
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          IMPORT MODAL
      ══════════════════════════════════════════════════════════════════════════ */}
      {isImportOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-card rounded-3xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh]">

            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-border shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-[0_6px_16px_-4px_rgba(5,150,105,0.45)]">
                  <Upload className="size-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">استيراد الطلاب من Excel</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    قم بتحميل القالب أولاً، أملأه وارفعه هنا
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setIsImportOpen(false); setImportRows([]); setImportResult(null); if (fileRef.current) fileRef.current.value = '' }}
                className="w-9 h-9 flex items-center justify-center rounded-xl bg-muted hover:bg-muted/80 text-muted-foreground transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">

              {/* Step 1 — Download template */}
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-2xl p-4 flex items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white text-xs font-bold mt-0.5">1</span>
                  <div>
                    <p className="font-bold text-blue-900 dark:text-blue-200">تنزيل القالب</p>
                    <p className="text-sm text-blue-700 dark:text-blue-300 mt-0.5">
                      احفظ القالب، أضف بيانات طلابك، ثم ارفعه هنا
                    </p>
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                      الأعمدة: <span className="font-mono">الاسم الكامل | رقم الهوية | جوال ولي الأمر | الجنس</span>
                    </p>
                  </div>
                </div>
                <button
                  onClick={downloadTemplate}
                  className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:opacity-90 text-sm transition-transform hover:-translate-y-0.5"
                >
                  <Download className="size-4" /> تنزيل القالب
                </button>
              </div>

              {/* Step 2 — Select class */}
              <div>
                <p className="font-bold mb-2 flex items-center gap-2">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-foreground text-xs font-bold">2</span>
                  اختر الفصل الذي ستستورد إليه الطلاب
                </p>
                <select
                  value={importClassId}
                  onChange={e => setImportClassId(e.target.value)}
                  className="w-full p-3 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary text-sm"
                >
                  <option value="">— بدون فصل (يمكن التعيين لاحقاً) —</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {importClassId && (
                  <p className="text-xs text-emerald-600 mt-1.5 font-semibold inline-flex items-center gap-1">
                    <CheckCircle2 className="size-3.5" /> سيتم استيراد جميع الطلاب إلى: {classes.find(c => c.id === importClassId)?.name}
                  </p>
                )}
              </div>

              {/* Step 3 — Upload file */}
              <div>
                <p className="font-bold mb-2 flex items-center gap-2">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-foreground text-xs font-bold">3</span>
                  رفع ملف Excel
                </p>
                <label className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-2xl p-8 cursor-pointer hover:bg-muted/30 hover:border-primary/40 transition-colors">
                  <FileSpreadsheet className="size-9 mb-2 text-emerald-600" />
                  <span className="font-semibold text-sm">انقر لاختيار ملف Excel</span>
                  <span className="text-xs text-muted-foreground mt-1">.xlsx أو .xls</span>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Import result */}
              {importResult && (
                <div className={`rounded-2xl p-4 border ${importResult.failed === 0 ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800' : 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800'}`}>
                  <p className="font-bold text-lg flex items-center gap-2">
                    {importResult.failed === 0
                      ? <CheckCircle2 className="size-5 text-emerald-600" />
                      : <AlertTriangle className="size-5 text-amber-600" />}
                    نتيجة الاستيراد
                  </p>
                  <div className="flex gap-6 mt-2 text-sm">
                    <span className="text-emerald-700 dark:text-emerald-300 font-semibold inline-flex items-center gap-1">
                      <CheckCircle2 className="size-3.5" /> تم إضافة: {importResult.created} طالب
                    </span>
                    {!!importResult.skippedDuplicates && importResult.skippedDuplicates > 0 && (
                      <span className="inline-flex items-center gap-1.5 text-amber-700 font-semibold">
                        <AlertTriangle className="size-3.5" /> تُخطّي {importResult.skippedDuplicates} مكرَّراً برقم هوية مسجَّل
                      </span>
                    )}
                    {!!importResult.unknownGender && importResult.unknownGender > 0 && (
                      <span className="inline-flex items-center gap-1.5 text-amber-700 font-semibold">
                        <AlertTriangle className="size-3.5" /> بلا جنس محدد: {importResult.unknownGender} — حدّدهم من القائمة
                      </span>
                    )}
                    {importResult.failed > 0 && (
                      <span className="text-red-600 dark:text-red-400 font-semibold inline-flex items-center gap-1">
                        <XCircle className="size-3.5" /> فشل: {importResult.failed}
                      </span>
                    )}
                  </div>
                  {importResult.errors.length > 0 && (
                    <div className="mt-2 text-xs text-red-600 dark:text-red-400">
                      <p className="font-semibold mb-1">الصفوف الفاشلة:</p>
                      <ul className="list-disc list-inside space-y-0.5">
                        {importResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* How new parents get in */}
              {importResult && importResult.created > 0 && (
                <div className="rounded-2xl p-4 border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800">
                  <p className="font-bold flex items-center gap-2 text-blue-900 dark:text-blue-200">
                    <KeyRound className="size-4 shrink-0" /> بيانات دخول أولياء الأمور
                  </p>
                  <p className="text-sm text-blue-800 dark:text-blue-300 mt-1">
                    اسم الدخول هو <span className="font-bold">رقم جوال ولي الأمر</span>، وكلمة المرور المبدئية{' '}
                    <span className="font-mono font-bold bg-white/70 dark:bg-black/20 px-1.5 py-0.5 rounded">12345678</span>.
                    عند أول دخول سيطلب منه النظام اختيار كلمة مرور خاصة به.
                  </p>
                </div>
              )}

              {/* Step 4 — Preview */}
              {importRows.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="font-bold flex items-center gap-2">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-foreground text-xs font-bold">4</span>
                      معاينة البيانات ({importRows.length} صف)
                    </p>
                    <div className="flex gap-3 text-sm">
                      <span className="text-emerald-600 font-semibold inline-flex items-center gap-1"><CheckCircle2 className="size-3.5" /> صحيح: {validCount}</span>
                      {invalidCount > 0 && <span className="text-red-600 font-semibold inline-flex items-center gap-1"><XCircle className="size-3.5" /> خطأ: {invalidCount}</span>}
                    </div>
                  </div>

                  <div className="border border-border rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto max-h-72">
                      <table className="w-full text-right text-sm">
                        <thead className="bg-muted text-muted-foreground sticky top-0">
                          <tr>
                            <th className="p-3 font-semibold">#</th>
                            <th className="p-3 font-semibold">الاسم الكامل</th>
                            <th className="p-3 font-semibold">رقم الهوية</th>
                            <th className="p-3 font-semibold">جوال ولي الأمر</th>
                            <th className="p-3 font-semibold">الجنس</th>
                            <th className="p-3 font-semibold">الحالة</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {importRows.map((row, i) => (
                            <tr key={i} className={row.valid ? 'hover:bg-muted/30' : 'bg-red-50/50 dark:bg-red-950/20'}>
                              <td className="p-3 text-muted-foreground">{i + 1}</td>
                              <td className="p-3 font-semibold">{row.fullName || <span className="text-muted-foreground italic">فارغ</span>}</td>
                              <td className="p-3 text-muted-foreground">{row.nationalId || '—'}</td>
                              <td className="p-3 text-muted-foreground">{row.parentPhone || '—'}</td>
                              <td className={`p-3 ${normalizeGender(row.gender) === null ? 'text-amber-700 font-semibold' : ''}`}>
                                {genderLabel(normalizeGender(row.gender))}
                              </td>
                              <td className="p-3">
                                {row.valid
                                  ? <CheckCircle2 className="size-4 text-emerald-600" />
                                  : <span className="inline-flex items-center gap-1 text-red-600 text-xs font-semibold"><XCircle className="size-3.5" />{row.error}</span>
                                }
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {invalidCount > 0 && (
                    <p className="text-xs text-amber-600 mt-2 inline-flex items-center gap-1">
                      <AlertTriangle className="size-3.5" /> الصفوف ذات الخطأ لن يتم استيرادها. سيتم استيراد {validCount} طالب فقط.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div className="p-6 border-t border-border shrink-0 flex gap-3">
              <button
                onClick={handleImport}
                disabled={importing || validCount === 0}
                className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity inline-flex items-center justify-center gap-2"
              >
                {importing
                  ? <><Loader2 className="size-4 animate-spin" /> جاري الاستيراد...</>
                  : <>
                      <Upload className="size-4" />
                      {validCount > 0
                        ? `استيراد ${validCount} طالب${importClassId ? ` إلى ${classes.find(c => c.id === importClassId)?.name}` : ''}`
                        : 'استيراد الطلاب'}
                    </>
                }
              </button>
              <button
                onClick={() => { setIsImportOpen(false); setImportRows([]); setImportResult(null); setImportClassId(''); if (fileRef.current) fileRef.current.value = '' }}
                className="px-6 py-3 bg-muted text-muted-foreground font-semibold rounded-xl hover:bg-muted/80"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          ADD/EDIT SINGLE STUDENT MODAL
      ══════════════════════════════════════════════════════════════════════════ */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-card p-6 rounded-3xl w-full max-w-lg shadow-xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 text-white shadow-[0_6px_16px_-4px_rgba(37,99,235,0.45)]">
                <UserPlus className="size-5" />
              </div>
              <h2 className="text-xl font-bold">{editingStudent ? 'تعديل طالب' : 'إضافة طالب جديد'}</h2>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm mb-1">الاسم الكامل</label>
                <input type="text" required value={fullName} onChange={e => setFullName(e.target.value)} className="w-full p-3 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm mb-1">رقم الهوية</label>
                  <input type="text" value={nationalId} onChange={e => setNationalId(e.target.value)} className="w-full p-3 rounded-xl border border-border bg-background outline-none" />
                </div>
                <div>
                  <label className="block text-sm mb-1">رقم جوال ولي الأمر</label>
                  <input type="text" required value={parentPhone} onChange={e => setParentPhone(e.target.value)} className="w-full p-3 rounded-xl border border-border bg-background outline-none" placeholder="05XXXXXXXX" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm mb-1">الجنس</label>
                  <select value={gender} onChange={e => setGender(e.target.value)} className="w-full p-3 rounded-xl border border-border bg-background outline-none">
                    <option value="male">ذكر</option>
                    <option value="female">أنثى</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm mb-1">الفصل (اختياري)</label>
                  <select value={classId} onChange={e => setClassId(e.target.value)} className="w-full p-3 rounded-xl border border-border bg-background outline-none">
                    <option value="">بدون فصل</option>
                    {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-4 mt-8">
                <button type="submit" disabled={loading} className="flex-1 py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:opacity-90 disabled:opacity-50">
                  {loading ? 'جاري الحفظ...' : editingStudent ? 'حفظ التعديلات' : 'إضافة الطالب'}
                </button>
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-3 bg-muted text-muted-foreground font-semibold rounded-xl hover:bg-muted/80">
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          PARENT PASSWORD RESET RESULT
      ══════════════════════════════════════════════════════════════════════════ */}
      {parentResetInfo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-card p-6 rounded-3xl w-full max-w-md shadow-xl text-center space-y-4">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="size-8" />
            </div>
            <h2 className="text-xl font-bold">
              {parentResetInfo.mode === 'created' ? 'تم إنشاء حساب ولي الأمر' : 'تم إعادة تعيين كلمة المرور'}
            </h2>
            <p className="text-sm text-muted-foreground">ولي أمر الطالب: {parentResetInfo.studentName}</p>
            <div className="bg-muted p-4 rounded-xl text-right space-y-2">
              <p className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground text-sm">رقم الجوال (اسم الدخول)</span>
                <span className="font-bold dir-ltr text-sm">{parentResetInfo.parentPhone || '-'}</span>
              </p>
              <p className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground text-sm">كلمة المرور</span>
                <span className="font-bold font-mono text-sm inline-flex items-center gap-1"><Copy className="size-3.5 text-muted-foreground" />{parentResetInfo.tempPassword}</span>
              </p>
            </div>
            <p className="text-sm text-amber-600 bg-amber-50 p-3 rounded-xl flex items-center gap-2">
              <AlertTriangle className="size-4 shrink-0" />
              يرجى نسخ هذه البيانات ومشاركتها مع ولي الأمر. لا يمكن استعادتها لاحقاً.
            </p>
            <button onClick={() => setParentResetInfo(null)} className="w-full py-3 bg-primary text-primary-foreground font-semibold rounded-xl mt-4">
              إغلاق
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
