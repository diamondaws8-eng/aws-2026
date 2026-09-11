// ── School Settings Types ─────────────────────────────────────────────────────
export type SchoolSettings = {
  features: {
    attendance: boolean
    behavior: boolean
    homework: boolean
    materials: boolean
    participation: boolean
  }
  points: {
    attendance_present: number
    attendance_absent: number
    attendance_late: number
    behavior_excellent: number
    behavior_good: number
    behavior_bad: number
    homework_done: number
    homework_notdone: number
    materials_brought: number
    materials_missing: number
    participation_active: number
    participation_inactive: number
  }
  whatsappTemplates: {
    positive: string[]
    negative: string[]
  }
}

export const DEFAULT_SETTINGS: SchoolSettings = {
  features: { attendance: true, behavior: true, homework: true, materials: true, participation: true },
  points: {
    attendance_present: 1,
    attendance_absent: -1,
    attendance_late: 0,
    behavior_excellent: 2,
    behavior_good: 1,
    behavior_bad: -2,
    homework_done: 1,
    homework_notdone: -1,
    materials_brought: 1,
    materials_missing: -1,
    participation_active: 2,
    participation_inactive: 0,
  },
  whatsappTemplates: {
    positive: [
      'السلام عليكم ورحمة الله وبركاته\nعزيزي ولي أمر الطالب: {student}\nأتقدم لكم بالشكر الجزيل على الجهود المبذولة مع الطالب، حيث أنه من الطلاب المتميزين خلال الفترة الماضية.\nفلكم جزيل الشكر والتقدير، وإلى مزيد من التقدم والنجاح بمشيئة الله تعالى.\nمعلم المادة: {teacher}\nالمدرسة: {school}'
    ],
    negative: [
      'السلام عليكم ورحمة الله وبركاته\nعزيزي ولي أمر الطالب: {student}\nنُفيدكم بأن هناك ملاحظة على أداء ابنكم/ابنتكم اليوم. نرجو منكم المتابعة والاهتمام حرصاً على مستواه الدراسي.\nولكم جزيل الشكر\nمعلم المادة: {teacher}\nالمدرسة: {school}'
    ]
  }
}

/** Typed by the owner to wipe the trial records — see resetOperationalData. */
export const RESET_PHRASE = 'مسح بيانات التجربة'
