import Link from 'next/link'
import { Compass, Home } from 'lucide-react'

export default function NotFound() {
  return (
    <main className="portal-shell flex min-h-screen items-center justify-center p-6" data-portal="admin">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-[var(--shadow-card)]">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Compass className="size-7" />
        </div>
        <h1 className="text-xl font-extrabold">هذه الصفحة غير موجودة</h1>
        <p className="mt-2 text-sm leading-7 text-muted-foreground">
          ربما تغيّر الرابط أو كُتب خطأً. ابدأ من صفحة اختيار البوابة.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground"
        >
          <Home className="size-4" /> اختيار البوابة
        </Link>
      </div>
    </main>
  )
}
