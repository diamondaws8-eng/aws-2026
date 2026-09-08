import Link from 'next/link'
import { ArrowLeft, GraduationCap, School, UsersRound, Sparkles, HeartHandshake } from 'lucide-react'
import { BrandLogo } from '@/components/brand-logo'

const portals = [
  {
    href: '/admin/login',
    title: 'بوابة الإدارة',
    subtitle: 'إدارة المراحل والفصول والطلاب والمعلمين بالكامل',
    icon: School,
    gradient: 'from-blue-500 to-blue-700',
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    border: 'border-blue-100 dark:border-blue-900 hover:border-blue-300',
    badge: 'للمديرين',
  },
  {
    href: '/teacher/login',
    title: 'بوابة المعلم',
    subtitle: 'افتح أي فصل وسجّل الحضور وأدخل الدرجات بسهولة',
    icon: GraduationCap,
    gradient: 'from-emerald-500 to-emerald-700',
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    border: 'border-emerald-100 dark:border-emerald-900 hover:border-emerald-300',
    badge: 'للمعلمين',
  },
  {
    href: '/counselor/login',
    title: 'بوابة الموجه الطلابي',
    subtitle: 'الحالات السلوكية: تُقرأ هنا قبل أن تصل إلى أي بيت',
    icon: HeartHandshake,
    gradient: 'from-teal-500 to-teal-700',
    bg: 'bg-teal-50 dark:bg-teal-950/30',
    border: 'border-teal-100 dark:border-teal-900 hover:border-teal-300',
    badge: 'للموجهين',
  },
  {
    href: '/parent/login',
    title: 'بوابة ولي الأمر',
    subtitle: 'تابع حضور أبنائك ودرجاتهم وتنبيهات المدرسة',
    icon: UsersRound,
    gradient: 'from-violet-500 to-violet-700',
    bg: 'bg-violet-50 dark:bg-violet-950/30',
    border: 'border-violet-100 dark:border-violet-900 hover:border-violet-300',
    badge: 'لأولياء الأمور',
  },
]

import { ThemeToggle } from '@/components/theme-toggle'

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background px-5 py-12 lg:px-12 relative">
      <div className="absolute top-6 left-6">
        <ThemeToggle />
      </div>
      <div className="mx-auto flex min-h-[85vh] max-w-5xl flex-col justify-center">

        {/* Header */}
        <div className="mb-14">
          <div className="mb-6 flex items-center gap-4">
            <BrandLogo size={72} />
            <div>
              <p className="text-xl font-bold tracking-tight">مدارس الأوس الأهلية</p>
              <p className="text-sm text-muted-foreground">نظام إدارة المدرسة الموحد</p>
            </div>
          </div>

          <h1 className="text-balance text-4xl font-bold tracking-tight text-foreground lg:text-5xl">
            اختر بوابتك
          </h1>
          <p className="mt-4 max-w-lg text-pretty text-lg leading-8 text-muted-foreground">
            نظام متكامل يربط الإدارة بالمعلمين وأولياء الأمور — كل ما يحدث في الفصل
            يصل فوراً لولي الأمر.
          </p>
        </div>

        {/* Portal cards */}
        <div className="grid gap-5 md:grid-cols-3">
          {portals.map(({ href, title, subtitle, icon: Icon, gradient, bg, border, badge }) => (
            <Link
              key={href}
              href={href}
              className={`group relative flex flex-col rounded-3xl border ${border} ${bg} p-7 transition-all duration-200 hover:-translate-y-1 hover:shadow-xl`}
            >
              {/* Badge */}
              <span className="mb-5 inline-flex w-fit items-center rounded-full bg-background/80 px-3 py-1 text-xs font-semibold text-muted-foreground shadow-sm backdrop-blur-sm">
                {badge}
              </span>

              {/* Icon */}
              <div className={`mb-8 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br ${gradient} text-white shadow-md`}>
                <Icon className="size-7" />
              </div>

              {/* Text */}
              <h2 className="text-xl font-bold text-foreground">{title}</h2>
              <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">{subtitle}</p>

              {/* CTA */}
              <span className="mt-6 flex items-center gap-2 text-sm font-bold text-primary">
                الدخول إلى البوابة
                <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" />
              </span>
            </Link>
          ))}
        </div>

        {/* Footer note */}
        <p className="mt-10 text-center text-xs text-muted-foreground">
          <Sparkles className="mb-0.5 ml-1 inline size-3" />
          مدارس الأوس الأهلية — نظام مدرسي عربي متكامل لإدارة الطلاب والمعلمين وأولياء الأمور
        </p>
      </div>
    </main>
  )
}
