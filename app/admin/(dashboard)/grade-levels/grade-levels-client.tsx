'use client'

import { useState } from 'react'
import { addGradeLevel, deleteGradeLevel, editGradeLevel, addClass, deleteClass, editClass, getStudentsForClass, addSubject, deleteSubject, assignTeacherToSubject } from './actions-levels'
import { ChevronDown, ChevronUp, Plus, Trash2, BookOpen, UserCog, Edit2, Download, Layers, CheckCircle2, Eye } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import * as XLSX from 'xlsx'

type SubjectData = {
  id: string
  name: string
  teacherUserId: string | null
  teacherName: string | null
}

type ClassData = {
  id: string
  name: string
  gradeLevelId: string
  schoolId: string
  subjects: SubjectData[]
}

type GradeData = {
  id: string
  name: string
  schoolId: string
  classes: ClassData[]
}

type TeacherOption = { userId: string; fullName: string }

type Props = {
  grades: GradeData[]
  schoolId: string
  teacherOptions: TeacherOption[]
  /** Grade levels this user may modify (others are shown read-only). */
  editableGradeIds: string[]
  /** Whether this user may add/remove grade levels at all. */
  canCreateGrades: boolean
}

const GRADE_ACCENTS = [
  { bar: 'from-violet-500 to-purple-500', badge: 'bg-violet-100 text-violet-700', blob: 'bg-violet-400/10' },
  { bar: 'from-blue-500 to-cyan-500', badge: 'bg-blue-100 text-blue-700', blob: 'bg-blue-400/10' },
  { bar: 'from-emerald-500 to-teal-500', badge: 'bg-emerald-100 text-emerald-700', blob: 'bg-emerald-400/10' },
  { bar: 'from-amber-500 to-orange-500', badge: 'bg-amber-100 text-amber-700', blob: 'bg-amber-400/10' },
  { bar: 'from-rose-500 to-pink-500', badge: 'bg-rose-100 text-rose-700', blob: 'bg-rose-400/10' },
]

export default function GradeLevelsClient({ grades, schoolId, teacherOptions, editableGradeIds, canCreateGrades }: Props) {
  const canEditGrade = (gradeId: string) => editableGradeIds.includes(gradeId)
  const [expandedGrades, setExpandedGrades] = useState<Set<string>>(new Set(grades.map(g => g.id)))
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set())
  const [newGradeName, setNewGradeName] = useState('')
  const [newClassNames, setNewClassNames] = useState<Record<string, string>>({})
  const [newSubjectNames, setNewSubjectNames] = useState<Record<string, string>>({})
  const [addingGrade, setAddingGrade] = useState(false)
  const [loadingActions, setLoadingActions] = useState<Set<string>>(new Set())

  const setLoading = (key: string, val: boolean) =>
    setLoadingActions(prev => { const n = new Set(prev); val ? n.add(key) : n.delete(key); return n })

  const toggleGrade = (id: string) =>
    setExpandedGrades(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const toggleClass = (id: string) =>
    setExpandedClasses(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const [editingClassId, setEditingClassId] = useState<string | null>(null)
  const [editingClassName, setEditingClassName] = useState('')

  const [editingGradeId, setEditingGradeId] = useState<string | null>(null)
  const [editingGradeName, setEditingGradeName] = useState('')

  const handleEditGrade = async (gradeId: string) => {
    if (!editingGradeName.trim()) return
    setLoading(gradeId, true)
    const res = await editGradeLevel(gradeId, editingGradeName)
    setLoading(gradeId, false)
    if (res && !res.ok) {
      alert(res.error)
      return
    }
    setEditingGradeId(null)
  }

  const handleDeleteGrade = async (gradeId: string, gradeName: string) => {
    if (!confirm(`حذف مرحلة "${gradeName}"؟`)) return
    const res = await deleteGradeLevel(gradeId)
    if (res && !res.ok) alert(res.error)
  }

  const handleDeleteClass = async (classId: string, className: string) => {
    if (!confirm(`حذف فصل "${className}"؟`)) return
    const res = await deleteClass(classId)
    if (res && !res.ok) alert(res.error)
  }

  const handleEditClass = async (classId: string) => {
    if (!editingClassName.trim()) return
    setLoading(classId, true)
    await editClass(classId, editingClassName)
    setEditingClassId(null)
    setLoading(classId, false)
  }

  const handleDownloadExcel = async (classId: string, className: string, gradeName: string) => {
    setLoading(`dl-${classId}`, true)
    try {
      const students = await getStudentsForClass(classId, schoolId)
      // Format similar to import sheet: الاسم الرباعي | رقم الهوية | رقم جوال ولي الأمر | الجنس | تاريخ الميلاد
      const wsData = [
        ['الاسم الرباعي', 'رقم الهوية', 'رقم جوال ولي الأمر', 'الجنس', 'تاريخ الميلاد (اختياري) YYYY-MM-DD']
      ]
      students.forEach(s => {
        wsData.push([
          s.fullName,
          s.nationalId || '',
          s.parentPhone || '',
          s.gender === 'male' ? 'ذكر' : s.gender === 'female' ? 'أنثى' : '',
          s.dateOfBirth || ''
        ])
      })
      const ws = XLSX.utils.aoa_to_sheet(wsData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'الطلاب')
      XLSX.writeFile(wb, `طلاب_فصل_${className}_${gradeName}.xlsx`)
    } finally {
      setLoading(`dl-${classId}`, false)
    }
  }

  const totalClasses = grades.reduce((sum, g) => sum + g.classes.length, 0)
  const totalSubjects = grades.reduce((sum, g) => sum + g.classes.reduce((s, c) => s + c.subjects.length, 0), 0)

  return (
    <div className="space-y-5">
      {/* Add Grade Level */}
      {canCreateGrades && (
      <div className="relative overflow-hidden bg-card border border-border rounded-2xl p-5">
        <div className="absolute -top-14 -left-10 size-40 rounded-full bg-violet-400/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3 sm:w-64 shrink-0">
            <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-[0_6px_16px_-4px_rgba(124,58,237,0.45)]">
              <Layers className="size-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm">إضافة مرحلة دراسية</h3>
              <p className="text-xs text-muted-foreground">
                {grades.length} مرحلة · {totalClasses} فصل · {totalSubjects} مادة
              </p>
            </div>
          </div>
          <form action={async (fd) => { setAddingGrade(true); await addGradeLevel(fd); setNewGradeName(''); setAddingGrade(false) }}
            className="flex gap-2 flex-1">
            <input type="hidden" name="schoolId" value={schoolId} />
            <input
              name="name" value={newGradeName} onChange={e => setNewGradeName(e.target.value)}
              placeholder="مثال: المرحلة الابتدائية"
              className="flex-1 p-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              required
            />
            <button type="submit" disabled={addingGrade}
              className="px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5 transition-transform hover:-translate-y-0.5">
              <Plus className="size-4" /> إضافة
            </button>
          </form>
        </div>
      </div>
      )}

      {grades.length === 0 && (
        <EmptyState
          icon={Layers}
          title="لا توجد مراحل دراسية"
          description={canCreateGrades
            ? 'أضف أول مرحلة دراسية من الحقل أعلاه للبدء في بناء الهيكل الأكاديمي'
            : 'لم يتم إسناد أي مرحلة دراسية لحسابك بعد'}
        />
      )}

      {/* Grades */}
      {grades.map((grade, gi) => {
        const accent = GRADE_ACCENTS[gi % GRADE_ACCENTS.length]
        const editable = canEditGrade(grade.id)
        return (
          <div key={grade.id} className="relative overflow-hidden bg-card border border-border rounded-2xl">
            <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-l ${accent.bar}`} />
            {/* Grade header */}
            <div className="flex items-center justify-between px-5 py-4 pt-5 cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => toggleGrade(grade.id)}>
              <div className="flex items-center gap-3">
                <div className={`flex size-9 items-center justify-center rounded-xl ${accent.badge}`}>
                  <Layers className="size-4" />
                </div>
                {editingGradeId === grade.id ? (
                  <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    <input
                      autoFocus
                      value={editingGradeName}
                      onChange={e => setEditingGradeName(e.target.value)}
                      className="px-2 py-1 text-sm rounded-lg border border-primary bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleEditGrade(grade.id)
                        else if (e.key === 'Escape') setEditingGradeId(null)
                      }}
                    />
                    <button
                      onClick={() => handleEditGrade(grade.id)}
                      disabled={loadingActions.has(grade.id)}
                      className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded disabled:opacity-50"
                    >
                      حفظ
                    </button>
                    <button onClick={() => setEditingGradeId(null)} className="text-xs bg-muted text-foreground px-2 py-1 rounded">
                      إلغاء
                    </button>
                  </div>
                ) : (
                  <h2 className="font-bold text-base flex items-center gap-2">
                    {grade.name}
                    {canCreateGrades && (
                      <button
                        onClick={e => { e.stopPropagation(); setEditingGradeId(grade.id); setEditingGradeName(grade.name) }}
                        title="تعديل اسم المرحلة"
                        className="text-muted-foreground hover:text-primary transition-colors"
                      >
                        <Edit2 className="size-3.5" />
                      </button>
                    )}
                  </h2>
                )}
                <span className="text-xs font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  {grade.classes.length} فصل
                </span>
                {expandedGrades.has(grade.id) ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
                {!editable && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                    <Eye className="size-3" /> اطّلاع فقط
                  </span>
                )}
              </div>
              {canCreateGrades && (
                <button onClick={e => { e.stopPropagation(); handleDeleteGrade(grade.id, grade.name) }}
                  className="p-1.5 text-muted-foreground hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>

            {expandedGrades.has(grade.id) && (
              <div className="border-t border-border px-5 pb-5 pt-4 space-y-4">
                {/* Add class */}
                {editable && (
                <form action={async (fd) => { await addClass(fd); setNewClassNames(p => ({ ...p, [grade.id]: '' })) }}
                  className="flex gap-2">
                  <input type="hidden" name="gradeLevelId" value={grade.id} />
                  <input type="hidden" name="schoolId" value={schoolId} />
                  <input
                    name="name"
                    value={newClassNames[grade.id] || ''}
                    onChange={e => setNewClassNames(p => ({ ...p, [grade.id]: e.target.value }))}
                    placeholder="اسم الفصل (أ، ب، ج...)"
                    className="flex-1 p-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    required
                  />
                  <button type="submit"
                    className="px-3 py-2 bg-muted hover:bg-muted/70 text-foreground rounded-xl text-sm font-semibold flex items-center gap-1 transition-colors">
                    <Plus className="size-3.5" /> فصل
                  </button>
                </form>
                )}

                {grade.classes.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">لا توجد فصول — أضف فصلاً</p>
                )}

                {/* Classes */}
                <div className="space-y-3">
                  {grade.classes.map(cls => (
                    <div key={cls.id} className="border border-border rounded-xl overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3 bg-muted/20 hover:bg-muted/40 transition-colors">
                        <div className="flex items-center gap-2 cursor-pointer flex-1" onClick={() => toggleClass(cls.id)}>
                          {expandedClasses.has(cls.id) ? <ChevronUp className="size-3.5 text-muted-foreground" /> : <ChevronDown className="size-3.5 text-muted-foreground" />}

                          {editingClassId === cls.id ? (
                            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                              <input
                                autoFocus
                                value={editingClassName}
                                onChange={e => setEditingClassName(e.target.value)}
                                className="px-2 py-1 text-sm rounded border border-primary focus:outline-none"
                                onKeyDown={e => {
                                  if (e.key === 'Enter') handleEditClass(cls.id)
                                  else if (e.key === 'Escape') setEditingClassId(null)
                                }}
                              />
                              <button onClick={() => handleEditClass(cls.id)} disabled={loadingActions.has(cls.id)} className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded">حفظ</button>
                              <button onClick={() => setEditingClassId(null)} className="text-xs bg-muted text-foreground px-2 py-1 rounded">إلغاء</button>
                            </div>
                          ) : (
                            <span className="font-semibold text-sm flex items-center gap-2">
                              <span className={`flex size-6 items-center justify-center rounded-lg text-[11px] font-bold ${accent.badge}`}>
                                {cls.name}
                              </span>
                              فصل {cls.name}
                              {editable && (
                                <button onClick={e => { e.stopPropagation(); setEditingClassId(cls.id); setEditingClassName(cls.name) }} className="text-muted-foreground hover:text-primary transition-colors">
                                  <Edit2 className="size-3" />
                                </button>
                              )}
                            </span>
                          )}

                          <span className="text-xs text-muted-foreground bg-background px-2 py-0.5 rounded-full border border-border">
                            {cls.subjects.length} مادة
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <button onClick={e => { e.stopPropagation(); handleDownloadExcel(cls.id, cls.name, grade.name) }}
                            disabled={loadingActions.has(`dl-${cls.id}`)}
                            title="تحميل قائمة الطلاب (Excel)"
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1 text-xs font-semibold">
                            <Download className="size-3.5" />
                            {loadingActions.has(`dl-${cls.id}`) ? 'جاري التحميل...' : 'إكسيل'}
                          </button>
                          {editable && (
                            <button onClick={e => { e.stopPropagation(); handleDeleteClass(cls.id, cls.name) }}
                              title="حذف الفصل"
                              className="p-1.5 text-muted-foreground hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                              <Trash2 className="size-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Subjects panel */}
                      {expandedClasses.has(cls.id) && (
                        <div className="px-4 py-4 space-y-3 bg-background/50">
                          <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                            <BookOpen className="size-3.5" /> المواد الدراسية وتعيين المعلمين
                          </p>

                          {/* Add subject */}
                          {editable && (
                          <form action={async (fd) => { await addSubject(fd); setNewSubjectNames(p => ({ ...p, [cls.id]: '' })) }}
                            className="flex gap-2">
                            <input type="hidden" name="classId" value={cls.id} />
                            <input type="hidden" name="schoolId" value={schoolId} />
                            <input
                              name="name"
                              value={newSubjectNames[cls.id] || ''}
                              onChange={e => setNewSubjectNames(p => ({ ...p, [cls.id]: e.target.value }))}
                              placeholder="اسم المادة (رياضيات، علوم...)"
                              className="flex-1 p-2 rounded-xl border border-border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                              required
                            />
                            <button type="submit"
                              className="px-3 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-xl text-xs font-semibold flex items-center gap-1 transition-colors">
                              <Plus className="size-3" /> مادة
                            </button>
                          </form>
                          )}

                          {/* Subjects list */}
                          {cls.subjects.length === 0 ? (
                            <p className="text-xs text-muted-foreground text-center py-3">لا توجد مواد — أضف مادة</p>
                          ) : (
                            <div className="space-y-2">
                              {cls.subjects.map(sub => (
                                <div key={sub.id}
                                  className="flex items-center gap-2 p-2.5 bg-card border border-border rounded-xl transition-colors hover:border-primary/30">
                                  <span className="text-sm font-semibold flex-1">{sub.name}</span>

                                  {/* Teacher assign */}
                                  <div className="flex items-center gap-1.5">
                                    <UserCog className="size-3.5 text-muted-foreground" />
                                    {editable ? (
                                      <select
                                        defaultValue={sub.teacherUserId || ''}
                                        onChange={async (e) => {
                                          setLoading(sub.id, true)
                                          await assignTeacherToSubject(sub.id, e.target.value || null)
                                          setLoading(sub.id, false)
                                        }}
                                        className="text-xs border border-border rounded-lg px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary max-w-[160px]"
                                        disabled={loadingActions.has(sub.id)}
                                      >
                                        <option value="">— اختر المعلم —</option>
                                        {teacherOptions.map(t => (
                                          <option key={t.userId} value={t.userId}>أ. {t.fullName}</option>
                                        ))}
                                      </select>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">
                                        {sub.teacherName ? `أ. ${sub.teacherName}` : 'لم يُسند معلم'}
                                      </span>
                                    )}
                                    {editable && sub.teacherName && (
                                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-semibold whitespace-nowrap">
                                        <CheckCircle2 className="size-3" /> {sub.teacherName.split(' ')[0]}
                                      </span>
                                    )}
                                  </div>

                                  {editable && (
                                    <button onClick={() => deleteSubject(sub.id)}
                                      className="p-1 text-muted-foreground hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0">
                                      <Trash2 className="size-3.5" />
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
