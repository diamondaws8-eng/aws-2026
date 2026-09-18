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
    /** غياب بعذر — a day the school was told about is not a day to punish. */
    attendance_excused: number
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
    // Nothing is taken from a pupil who was not there. The day simply earns
    // nothing: no attendance point, and no lesson marks either.
    attendance_absent: 0,
    attendance_late: 0,
    // Equal to presence, not above it. The ceiling of a day's points is the
    // best status a pupil can reach, and if an excused absence scored more than
    // being in class, every pupil who came would sit at half marks for ever.
    attendance_excused: 1,
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
