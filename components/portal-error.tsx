'use client'

import { useEffect } from 'react'
import { AlertTriangle, RotateCcw, Home } from 'lucide-react'
import Link from 'next/link'

/**
 * What a person sees when a page throws. The default was an English
 * "Application error" with nothing to press; this says what happened in the
 * school's language, offers to try again, and keeps the portal around it.
 */
export function PortalError({ error, reset, home }: { error: Error & { digest?: string }; reset: () => void; home: string }) {
  useEffect(() => {
    // The server logs carry the stack; the browser console keeps the digest
    // so the two can be matched when somebody reports it.
    console.error('Portal error', error.digest ?? error.message)
  }, [error])

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-[var(--shadow-card)]">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
          <AlertTriangle className="size-7" />
        </div>
        <h1 className="text-xl font-extrabold">حدث خطأ غير متوقع</h1>
        <p className="mt-2 text-sm leading-7 text-muted-foreground">
          لم تُحفظ أي بيانات ناقصة، ويمكنك المحاولة مرة أخرى. إن تكرر الخطأ فأبلغ الإدارة بهذا الرمز:
        </p>
        <p className="mt-2 font-mono text-xs text-muted-foreground" dir="ltr">{error.digest ?? '—'}</p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground"
          >
            <RotateCcw className="size-4" /> حاول مرة أخرى
          </button>
          <Link
            href={home}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-muted px-5 py-3 text-sm font-semibold"
          >
            <Home className="size-4" /> الصفحة الرئيسية
          </Link>
        </div>
      </div>
    </div>
  )
}
