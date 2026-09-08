'use client'

import { useEffect, useState } from 'react'
import { Users, GraduationCap, BookOpen, Layers } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

function useCountUp(target: number, duration = 1000): number {
  const [value, setValue] = useState(0)
  useEffect(() => {
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(target * eased)
      if (progress < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return value
}

function HeroStatCard({
  icon: Icon,
  label,
  value,
  sublabel,
  colorFrom,
  colorTo,
  glow,
  bg,
}: {
  icon: LucideIcon
  label: string
  value: number
  sublabel: string
  colorFrom: string
  colorTo: string
  glow: string
  bg: string
}) {
  const animated = useCountUp(value)
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 transition-transform hover:-translate-y-0.5">
      <div className="absolute -top-10 -left-10 size-32 rounded-full blur-2xl opacity-40" style={{ backgroundColor: bg }} />
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-2 text-3xl font-black tracking-tight tabular-nums">{Math.round(animated)}</p>
          <p className="mt-1.5 text-xs font-medium text-muted-foreground">{sublabel}</p>
        </div>
        <div
          className="flex size-11 shrink-0 items-center justify-center rounded-xl text-white"
          style={{
            backgroundImage: `linear-gradient(135deg, ${colorFrom}, ${colorTo})`,
            boxShadow: `0 6px 16px -4px ${glow}`,
          }}
        >
          <Icon className="size-5" />
        </div>
      </div>
    </div>
  )
}

export function HeroStats({
  studentCount,
  teacherCount,
  classCount,
  gradeCount,
}: {
  studentCount: number
  teacherCount: number
  classCount: number
  gradeCount: number
}) {
  const avgPerClass = classCount > 0 ? Math.round(studentCount / classCount) : 0
  const avgPerTeacher = teacherCount > 0 ? Math.round(studentCount / teacherCount) : 0
  const avgClassesPerGrade = gradeCount > 0 ? (classCount / gradeCount).toFixed(1) : '0'

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <HeroStatCard
        icon={Users}
        label="إجمالي الطلاب"
        value={studentCount}
        sublabel={classCount > 0 ? `≈ ${avgPerClass} طالب لكل فصل` : 'لا توجد فصول بعد'}
        colorFrom="#60a5fa"
        colorTo="#2563eb"
        glow="rgba(37,99,235,0.45)"
        bg="#3b82f6"
      />
      <HeroStatCard
        icon={GraduationCap}
        label="إجمالي المعلمين"
        value={teacherCount}
        sublabel={teacherCount > 0 ? `≈ ${avgPerTeacher} طالب لكل معلم` : 'لا يوجد معلمون بعد'}
        colorFrom="#34d399"
        colorTo="#059669"
        glow="rgba(5,150,105,0.45)"
        bg="#10b981"
      />
      <HeroStatCard
        icon={BookOpen}
        label="الفصول الدراسية"
        value={classCount}
        sublabel={gradeCount > 0 ? `≈ ${avgClassesPerGrade} فصل لكل مرحلة` : 'لا توجد مراحل بعد'}
        colorFrom="#fbbf24"
        colorTo="#d97706"
        glow="rgba(217,119,6,0.45)"
        bg="#f59e0b"
      />
      <HeroStatCard
        icon={Layers}
        label="المراحل الدراسية"
        value={gradeCount}
        sublabel={`موزعة على ${classCount} فصل دراسي`}
        colorFrom="#a78bfa"
        colorTo="#7c3aed"
        glow="rgba(124,58,237,0.45)"
        bg="#8b5cf6"
      />
    </div>
  )
}
