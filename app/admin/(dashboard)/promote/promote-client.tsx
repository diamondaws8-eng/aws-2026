'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { NotificationBell } from '@/components/notification-bell'
import { transferStudents } from './actions'
import { ArrowLeft, Users, CheckSquare, Square, Loader2, AlertTriangle } from 'lucide-react'

type ClassOption = {
  id: string
  name: string
  gradeName: string
  gradeOrder: number
  canEdit: boolean
}

type Student = { id: string; fullName: string; classId: string }

export function PromoteClient({
  classes,
  students,
  canEdit,
  unassignedCount,
}: {
  classes: ClassOption[]
  students: Student[]
  canEdit: boolean
  unassignedCount: number
}) {
  const router = useRouter()
  const [sourceId, setSourceId] = useState('')
  const [targetId, setTargetId] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)

  const label = (c: ClassOption) => `${c.gradeName} — ${c.name}`

  const inSource = useMemo(
    () => (sourceId ? students.filter((s) => s.classId === sourceId) : []),
    [students, sourceId],
  )

  // Everyone moves up by default; the exceptions are the repeaters, and it is
  // far quicker to untick three than to tick thirty-seven.
  const pickSource = (id: string) => {
    setSourceId(id)
    setSelected(new Set(students.filter((s) => s.classId === id).map((s) => s.id)))
    setNote(null)
    if (id === targetId) setTargetId('')
  }

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const allPicked = inSource.length > 0 && inSource.every((s) => selected.has(s.id))
  const toggleAll = () =>
    setSelected(allPicked ? new Set() : new Set(inSource.map((s) => s.id)))

  const source = classes.find((c) => c.id === sourceId)
  const target = classes.find((c) => c.id === targetId)
  const blockedBySource = source && !source.canEdit
  const blockedByTarget = target && !target.canEdit

  const submit = async () => {
    if (!targetId || selected.size === 0) return
    setBusy(true)
    setNote(null)
    try {
      const res = await transferStudents([...selected], targetId)
      if (res.ok) {
        setNote({ ok: true, text: `تم ترحيل ${res.moved} طالباً إلى ${target ? label(target) : 'الفصل الجديد'} ✅` })
        setSelected(new Set())
        setSourceId('')
        setTargetId('')
        router.refresh()
      } else {
        setNote({ ok: false, text: res.error })
      }
    } catch {
      setNote({ ok: false, text: 'حدث خطأ غير متوقع' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">ترحيل الطلاب</h1>
          <p className="text-muted-foreground mt-1">
            نقل فصل كامل إلى فصله الجديد دفعة واحدة — سجلّ الأعوام السابقة لا يتحرك معهم.
          </p>
        </div>
        <NotificationBell />
      </div>

      {!canEdit && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          حسابك للقراءة فقط — يمكنك الاطلاع دون تنفيذ الترحيل.
        </p>
      )}

      {note && (
        <p className={`rounded-2xl border p-4 text-sm ${
          note.ok ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'
        }`}>
          {note.text}
        </p>
      )}

      <div className="rounded-3xl border border-border bg-card p-6">
        <div className="grid sm:grid-cols-[1fr_auto_1fr] gap-4 items-end">
          <div>
            <label className="block text-sm font-semibold mb-1.5">من فصل</label>
            <select
              value={sourceId}
              onChange={(e) => pickSource(e.target.value)}
              className="w-full p-3 rounded-xl border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">— اختر الفصل الحالي —</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {label(c)} ({students.filter((s) => s.classId === c.id).length})
                </option>
              ))}
            </select>
          </div>

          <div className="hidden sm:flex items-center justify-center pb-3 text-muted-foreground">
            <ArrowLeft className="size-5" />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1.5">إلى فصل</label>
            <select
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              disabled={!sourceId}
              className="w-full p-3 rounded-xl border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
            >
              <option value="">— اختر الفصل الجديد —</option>
              {classes.filter((c) => c.id !== sourceId).map((c) => (
                <option key={c.id} value={c.id}>{label(c)}</option>
              ))}
            </select>
          </div>
        </div>

        {(blockedBySource || blockedByTarget) && (
          <p className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertTriangle className="size-4 shrink-0 mt-0.5" />
            <span>
              {blockedBySource && 'الفصل المصدر خارج المراحل التي تملك تعديلها. '}
              {blockedByTarget && 'الفصل المستهدف خارج المراحل التي تملك تعديلها. '}
              الترحيل سيُرفض من الخادم.
            </span>
          </p>
        )}
      </div>

      {sourceId && (
        <div className="rounded-3xl border border-border bg-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-bold">
                طلاب {source ? label(source) : ''}
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                الكل محدَّد. أزل تحديد من يعيد السنة أو يبقى في فصله.
              </p>
            </div>
            <button
              type="button"
              onClick={toggleAll}
              className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-sm font-semibold hover:bg-muted/70"
            >
              {allPicked ? <Square className="size-4" /> : <CheckSquare className="size-4" />}
              {allPicked ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
            </button>
          </div>

          {inSource.length === 0 ? (
            <p className="rounded-xl bg-muted/40 p-6 text-center text-sm text-muted-foreground">
              لا يوجد طلاب في هذا الفصل.
            </p>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {inSource.map((s, i) => {
                  const on = selected.has(s.id)
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggle(s.id)}
                      className={`flex items-center gap-2.5 rounded-xl border p-3 text-right text-sm transition-colors ${
                        on ? 'border-primary/40 bg-primary/5' : 'border-border hover:bg-muted/40'
                      }`}
                    >
                      {on
                        ? <CheckSquare className="size-4 shrink-0 text-primary" />
                        : <Square className="size-4 shrink-0 text-muted-foreground" />}
                      <span className="text-xs text-muted-foreground shrink-0">{i + 1}</span>
                      <span className="truncate font-semibold">{s.fullName}</span>
                    </button>
                  )
                })}
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border pt-5">
                <span className="inline-flex items-center gap-2 text-sm">
                  <Users className="size-4 text-muted-foreground" />
                  <span className="font-bold">{selected.size}</span> من {inSource.length} محدَّد
                </span>
                <button
                  type="button"
                  onClick={submit}
                  disabled={!canEdit || busy || !targetId || selected.size === 0}
                  className="ms-auto inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
                >
                  {busy
                    ? <><Loader2 className="size-4 animate-spin" /> جاري الترحيل...</>
                    : <>ترحيل {selected.size} طالباً {target ? `إلى ${label(target)}` : ''}</>}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <p className="rounded-2xl bg-muted/40 p-4 text-xs leading-7 text-muted-foreground">
        <span className="font-bold">ما الذي يتحرك وما الذي يبقى:</span> يتحرك مكان الطالب الحالي فقط.
        أما سجل الحضور والدرجات والنقاط للأعوام والفصول السابقة فيبقى مرتبطاً بالفصل الذي حدث فيه —
        فسجل العام الماضي يظل يُقرأ على أنه فصل العام الماضي.
        {unassignedCount > 0 && (
          <> <span className="font-bold text-amber-700">
            وهناك {unassignedCount} طالباً بلا فصل مسنَد لا يظهرون هنا — راجعهم في صفحة الطلاب.
          </span></>
        )}
      </p>
    </div>
  )
}
