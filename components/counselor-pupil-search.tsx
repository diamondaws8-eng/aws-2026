'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Search, Loader2 } from 'lucide-react'
import { searchMyPupils } from '@/app/counselor/(dashboard)/actions'

type Pupil = { id: string; fullName: string; className: string | null }

/**
 * Find a pupil by name and open their record — for the parent who is
 * standing at the door and has no case open. Matched on the server, within
 * this counsellor's stages only.
 */
export function CounselorPupilSearch() {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Pupil[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      try { setResults(await searchMyPupils(q)) } catch { setResults([]) } finally { setSearching(false) }
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div className="relative max-w-md">
      <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="افتح سجل طالب بالاسم…"
        aria-label="بحث عن طالب"
        className="h-11 w-full rounded-xl border border-border bg-card pr-10 pl-3 text-sm"
      />
      {(results.length > 0 || searching) && (
        <ul className="absolute z-20 mt-1 w-full rounded-xl border border-border bg-card shadow-lg max-h-64 overflow-auto">
          {searching && <li className="px-3 py-2 text-xs text-muted-foreground inline-flex items-center gap-2"><Loader2 className="size-3 animate-spin" /> يبحث…</li>}
          {results.map((p) => (
            <li key={p.id}>
              <Link href={`/counselor/students/${p.id}`} className="block px-3 py-2 text-sm hover:bg-muted" onClick={() => setQ('')}>
                <span className="font-semibold">{p.fullName}</span>{p.className ? <span className="text-muted-foreground"> · فصل {p.className}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {q.trim().length >= 2 && !searching && results.length === 0 && (
        <p className="mt-1.5 text-xs text-muted-foreground">لا طالب بهذا الاسم ضمن مراحلك</p>
      )}
    </div>
  )
}
