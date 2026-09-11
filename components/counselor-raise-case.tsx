'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PenLine, Search, Loader2, X, XCircle } from 'lucide-react'
import { searchMyPupils, raiseCaseByCounselor } from '@/app/counselor/(dashboard)/actions'

type Pupil = { id: string; fullName: string; className: string | null }

/**
 * The counsellor writing a case of their own — a thing they saw, or a parent
 * who came in. Pick the pupil by typing a name, describe it, and it joins the
 * same inbox as the teachers' cases to be decided like any other.
 */
export function CounselorRaiseCase() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Pupil[]>([])
  const [searching, setSearching] = useState(false)
  const [pupil, setPupil] = useState<Pupil | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || pupil || q.trim().length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      try { setResults(await searchMyPupils(q)) } catch { setResults([]) } finally { setSearching(false) }
    }, 250)
    return () => clearTimeout(t)
  }, [q, open, pupil])

  const reset = () => { setOpen(false); setQ(''); setResults([]); setPupil(null); setNote(''); setError('') }

  const submit = async () => {
    if (!pupil) return
    setBusy(true); setError('')
    try {
      const res = await raiseCaseByCounselor({ studentId: pupil.id, note })
      if (!res.ok) { setError(res.error); return }
      reset()
      router.refresh()
    } catch { setError('تعذّر حفظ الحالة') } finally { setBusy(false) }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground min-h-10"
      >
        <PenLine className="size-4" /> تسجيل ملاحظة بنفسي
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-3xl border border-border bg-background shadow-xl max-h-[92vh] overflow-auto">
            <div className="flex items-center justify-between border-b border-border p-4 sticky top-0 bg-background">
              <div>
                <h3 className="text-lg font-bold">ملاحظة من الموجه</h3>
                <p className="text-xs text-muted-foreground">تدخل صندوقك مع حالات المعلمين وتُقرَّر مثلها</p>
              </div>
              <button onClick={reset} className="size-8 rounded-full hover:bg-muted" aria-label="إغلاق"><X className="size-4 mx-auto" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-bold mb-1.5">الطالب</label>
                {pupil ? (
                  <div className="flex items-center justify-between rounded-xl border border-primary/40 bg-primary/5 px-3 py-2.5 text-sm">
                    <span><span className="font-semibold">{pupil.fullName}</span>{pupil.className ? <span className="text-muted-foreground"> · فصل {pupil.className}</span> : null}</span>
                    <button type="button" onClick={() => setPupil(null)} className="text-xs text-muted-foreground underline">تغيير</button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      autoFocus
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="اكتب اسم الطالب…"
                      className="h-11 w-full rounded-xl border border-border bg-background pr-10 pl-3 text-sm"
                    />
                    {(results.length > 0 || searching) && (
                      <ul className="absolute z-10 mt-1 w-full rounded-xl border border-border bg-card shadow-lg max-h-56 overflow-auto">
                        {searching && <li className="px-3 py-2 text-xs text-muted-foreground inline-flex items-center gap-2"><Loader2 className="size-3 animate-spin" /> يبحث…</li>}
                        {results.map((p) => (
                          <li key={p.id}>
                            <button type="button" onClick={() => { setPupil(p); setResults([]) }} className="w-full text-right px-3 py-2 text-sm hover:bg-muted">
                              <span className="font-semibold">{p.fullName}</span>{p.className ? <span className="text-muted-foreground"> · فصل {p.className}</span> : null}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {q.trim().length >= 2 && !searching && results.length === 0 && (
                      <p className="mt-1.5 text-xs text-muted-foreground">لا طالب بهذا الاسم ضمن مراحلك</p>
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-bold mb-1.5">ما لاحظته</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={4}
                  placeholder="ما حدث، متى، ومن كان حاضراً…"
                  className="w-full rounded-xl border border-border bg-background p-3 text-sm"
                />
              </div>
              {error && (
                <p className="text-sm text-red-600 bg-red-50 p-3 rounded-xl inline-flex items-center gap-2 w-full"><XCircle className="size-4 shrink-0" /> {error}</p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={submit}
                  disabled={busy || !pupil || note.trim().length < 5}
                  className="flex-1 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-50 inline-flex items-center justify-center gap-2"
                >
                  {busy ? <><Loader2 className="size-4 animate-spin" /> جاري الحفظ...</> : 'حفظ في صندوقي'}
                </button>
                <button type="button" onClick={reset} className="px-5 rounded-xl bg-muted font-semibold text-sm">إلغاء</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
