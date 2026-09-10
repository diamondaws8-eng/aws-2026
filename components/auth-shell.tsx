import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { CheckCircle2 } from 'lucide-react'
import { ThemeToggle } from '@/components/theme-toggle'
import { BackToPortals } from '@/components/back-to-portals'
import { BrandLogo } from '@/components/brand-logo'
import { MotionLayer } from '@/components/motion-layer'

type Portal = 'admin' | 'teacher' | 'counselor' | 'parent'

/**
 * The frame every sign-in screen shares: the school's colours on one side,
 * the form on the other. Each portal's accent comes from `data-portal`, so a
 * teacher and a parent see the same shape in their own hue.
 */
export function AuthShell({
  portal,
  title,
  subtitle,
  icon: Icon,
  points,
  children,
}: {
  portal: Portal
  title: string
  subtitle: string
  icon: LucideIcon
  points: string[]
  children: ReactNode
}) {
  const gradient = { backgroundImage: 'linear-gradient(135deg, var(--portal-a), var(--portal-b))' }

  return (
    <div data-portal={portal} className="portal-shell relative min-h-screen">
      <MotionLayer />
      <div className="absolute top-5 left-5 z-10">
        <ThemeToggle />
      </div>
      <div className="absolute top-5 right-5 z-10">
        <BackToPortals />
      </div>

      <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-5 py-20 lg:grid-cols-[1.05fr_1fr] lg:px-10">
        {/* Brand panel — desktop only; a phone goes straight to the form */}
        <section className="hidden lg:block">
          <div
            data-tilt="4"
            className="gradient-live relative overflow-hidden rounded-[2rem] p-10 text-white shadow-2xl"
            style={{ backgroundImage: 'linear-gradient(135deg, var(--portal-a), var(--portal-b), var(--portal-a))' }}
          >
            <span className="glare" />
            <div className="pointer-events-none absolute -top-24 -left-24 size-72 rounded-full bg-white/15 blur-3xl float-slow" />
            <div className="pointer-events-none absolute -bottom-28 -right-16 size-80 rounded-full bg-black/15 blur-3xl float-slower" />
            <div className="pointer-events-none absolute top-16 left-10 size-16 rounded-2xl border border-white/30 bg-white/10 backdrop-blur float-slow" />
            <div className="pointer-events-none absolute bottom-24 left-24 size-9 rounded-full border border-white/30 bg-white/10 float-slower" />
            <div className="pointer-events-none absolute top-1/2 right-12 size-6 rotate-45 rounded-md bg-white/20 float-slow" />
            <div className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:22px_22px]" />

            <div className="relative">
              <div className="flex items-center gap-4">
                <BrandLogo size={60} rounded="rounded-2xl" href={null} className="ring-4 ring-white/30" />
                <div>
                  <p className="font-kufi text-2xl font-semibold leading-tight">مدارس الأوس الأهلية</p>
                  <p className="text-sm text-white/80">نظام إدارة المدرسة الموحد</p>
                </div>
              </div>

              <h2 className="mt-12 text-4xl font-black leading-tight">{title}</h2>
              <p className="mt-3 max-w-md text-lg leading-8 text-white/85">{subtitle}</p>

              <ul className="mt-10 space-y-3.5">
                {points.map((p) => (
                  <li key={p} className="flex items-start gap-3 text-sm leading-6 text-white/95">
                    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-white/20">
                      <CheckCircle2 className="size-4" />
                    </span>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Form card */}
        <section>
          <div className="mx-auto w-full max-w-md rounded-3xl border border-border bg-card/90 p-7 shadow-[var(--shadow-card-hover)] backdrop-blur sm:p-8">
            <div className="mb-7 text-center">
              <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl text-white shadow-[0_12px_24px_-10px_var(--glow)]" style={gradient}>
                <Icon className="size-8" />
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight text-foreground">{title}</h1>
              <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{subtitle}</p>
            </div>
            {children}
          </div>
        </section>
      </div>
    </div>
  )
}
