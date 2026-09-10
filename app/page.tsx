import Link from 'next/link'
import { ArrowLeft, GraduationCap, School, UsersRound, Sparkles, HeartHandshake, ShieldCheck, BellRing, LineChart } from 'lucide-react'
import { BrandLogo } from '@/components/brand-logo'
import { ThemeToggle } from '@/components/theme-toggle'

const portals = [
  {
    href: '/admin/login',
    title: 'بوابة الإدارة',
    subtitle: 'إدارة المراحل والفصول والطلاب والمعلمين بالكامل',
    icon: School,
    from: '#4f46e5',
    to: '#7c3aed',
    badge: 'للمديرين',
  },
  {
    href: '/teacher/login',
    title: 'بوابة المعلم',
    subtitle: 'افتح أي فصل وسجّل الحضور وأدخل الدرجات بسهولة',
    icon: GraduationCap,
    from: '#059669',
    to: '#0d9488',
    badge: 'للمعلمين',
  },
  {
    href: '/counselor/login',
    title: 'بوابة الموجه الطلابي',
    subtitle: 'الحالات السلوكية: تُقرأ هنا قبل أن تصل إلى أي بيت',
    icon: HeartHandshake,
    from: '#0891b2',
    to: '#0d9488',
    badge: 'للموجهين',
  },
  {
    href: '/parent/login',
    title: 'بوابة ولي الأمر',
    subtitle: 'تابع حضور أبنائك ودرجاتهم وتنبيهات المدرسة',
    icon: UsersRound,
    from: '#7c3aed',
    to: '#db2777',
    badge: 'لأولياء الأمور',
  },
]

const promises = [
  { icon: BellRing, text: 'الغياب يصل ولي الأمر من المدرسة أولاً' },
  { icon: ShieldCheck, text: 'لا شيء يصل إلى بيت قبل أن يقرأه موجه' },
  { icon: LineChart, text: 'نقاط ودرجات وحضور بأرقام لا تتناقض' },
]

export default function HomePage() {
  return (
    <main data-portal="admin" className="portal-shell relative min-h-screen overflow-hidden px-5 py-12 lg:px-12">
      {/* Coloured light behind the hero */}
      <div className="pointer-events-none absolute -top-40 right-1/4 size-[520px] rounded-full bg-indigo-500/15 blur-3xl dark:bg-indigo-400/10" />
      <div className="pointer-events-none absolute -bottom-48 left-1/4 size-[560px] rounded-full bg-fuchsia-500/10 blur-3xl dark:bg-fuchsia-400/10" />

      <div className="absolute top-6 left-6">
        <ThemeToggle />
      </div>

      <div className="relative mx-auto flex min-h-[85vh] max-w-6xl flex-col justify-center">
        {/* Header */}
        <div className="mb-12">
          <div className="mb-8 flex items-center gap-4">
            <BrandLogo size={72} className="ring-4 ring-white/70 dark:ring-white/10" />
            <div>
              <p className="font-kufi text-2xl font-semibold tracking-tight">مدارس الأوس الأهلية</p>
              <p className="text-sm text-muted-foreground">نظام إدارة المدرسة الموحد</p>
            </div>
          </div>

          <h1 className="text-balance text-4xl font-black tracking-tight text-foreground lg:text-6xl">
            <span className="text-gradient">اختر بوابتك</span>
          </h1>
          <p className="mt-4 max-w-xl text-pretty text-lg leading-8 text-muted-foreground">
            نظام متكامل يربط الإدارة بالمعلمين وأولياء الأمور — كل ما يحدث في الفصل
            يصل فوراً لولي الأمر.
          </p>

          <ul className="mt-6 flex flex-wrap gap-2.5">
            {promises.map(({ icon: Icon, text }) => (
              <li key={text} className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3.5 py-1.5 text-xs font-semibold text-muted-foreground shadow-[var(--shadow-card)] backdrop-blur">
                <Icon className="size-3.5 text-primary" />
                {text}
              </li>
            ))}
          </ul>
        </div>

        {/* Portal cards — two by two on a tablet, one row on a laptop */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {portals.map(({ href, title, subtitle, icon: Icon, from, to, badge }) => (
            <Link
              key={href}
              href={href}
              className="group relative flex flex-col overflow-hidden rounded-3xl border border-border bg-card/85 p-7 shadow-[var(--shadow-card)] backdrop-blur transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[var(--shadow-card-hover)]"
            >
              {/* Colour edge along the top */}
              <span className="absolute inset-x-0 top-0 h-1.5" style={{ backgroundImage: `linear-gradient(90deg, ${from}, ${to})` }} />
              {/* Glow that grows on hover */}
              <span
                className="pointer-events-none absolute -top-16 -left-16 size-44 rounded-full opacity-25 blur-3xl transition-opacity duration-300 group-hover:opacity-50"
                style={{ backgroundColor: from }}
              />

              <span className="relative mb-5 inline-flex w-fit items-center rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
                {badge}
              </span>

              <div
                className="relative mb-8 flex size-14 items-center justify-center rounded-2xl text-white shadow-lg transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3"
                style={{ backgroundImage: `linear-gradient(135deg, ${from}, ${to})`, boxShadow: `0 14px 28px -12px ${from}` }}
              >
                <Icon className="size-7" />
              </div>

              <h2 className="relative text-xl font-extrabold text-foreground">{title}</h2>
              <p className="relative mt-2 flex-1 text-sm leading-6 text-muted-foreground">{subtitle}</p>

              <span className="relative mt-6 flex items-center gap-2 text-sm font-bold" style={{ color: from }}>
                الدخول إلى البوابة
                <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1.5" />
              </span>
            </Link>
          ))}
        </div>

        <p className="mt-12 text-center text-xs text-muted-foreground">
          <Sparkles className="mb-0.5 ml-1 inline size-3 text-primary" />
          مدارس الأوس الأهلية — نظام مدرسي عربي متكامل لإدارة الطلاب والمعلمين وأولياء الأمور
        </p>
      </div>
    </main>
  )
}
