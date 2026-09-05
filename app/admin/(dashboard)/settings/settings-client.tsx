'use client'

import { useState } from 'react'
import { saveSchoolSettings, changeAdminPassword, exportFullBackup } from './actions-settings'
import type { SchoolSettings } from './settings-types'

// ── Toggle Switch ─────────────────────────────────────────────────────────────
function Toggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
        enabled ? 'bg-primary' : 'bg-muted'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-6 w-6 rounded-full bg-white shadow-md ring-0 transition-transform duration-200 ${
          enabled ? '-translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

// ── Points Input ──────────────────────────────────────────────────────────────
function PointInput({
  label, value, onChange, color,
}: {
  label: string; value: number; onChange: (v: number) => void; color: string
}) {
  return (
    <div className={`flex items-center justify-between p-3 rounded-xl border ${color}`}>
      <span className="text-sm font-semibold">{label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(value - 1)}
          className="w-7 h-7 rounded-lg bg-background border border-border flex items-center justify-center font-bold text-base hover:bg-muted transition-colors"
        >−</button>
        <span className={`w-10 text-center font-black text-base ${value > 0 ? 'text-emerald-600' : value < 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
          {value > 0 ? `+${value}` : value}
        </span>
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          className="w-7 h-7 rounded-lg bg-background border border-border flex items-center justify-center font-bold text-base hover:bg-muted transition-colors"
        >+</button>
      </div>
    </div>
  )
}

// ── Section Card ─────────────────────────────────────────────────────────────
function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
      <div className="px-6 py-4 border-b border-border bg-muted/30 flex items-center gap-2">
        <span className="text-xl">{icon}</span>
        <h2 className="font-bold text-base">{title}</h2>
      </div>
      <div className="p-6">{children}</div>
    </div>
  )
}

// ── Main Client Component ─────────────────────────────────────────────────────
export default function SettingsClient({
  schoolId,
  initialSettings,
  adminEmail,
}: {
  schoolId: string
  initialSettings: SchoolSettings
  adminEmail: string
}) {
  const [settings, setSettings] = useState<SchoolSettings>(initialSettings)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // Password form
  const [currentPw, setCurrentPw]   = useState('')
  const [newPw, setNewPw]           = useState('')
  const [confirmPw, setConfirmPw]   = useState('')
  const [pwLoading, setPwLoading]   = useState(false)
  const [pwMsg, setPwMsg]           = useState<{ ok: boolean; text: string } | null>(null)

  // ── Feature helpers ──────────────────────────────────────────────────────────
  const setFeature = (key: keyof SchoolSettings['features'], val: boolean) =>
    setSettings(s => ({ ...s, features: { ...s.features, [key]: val } }))

  const setPoint = (key: keyof SchoolSettings['points'], val: number) =>
    setSettings(s => ({ ...s, points: { ...s.points, [key]: val } }))

  const addTemplate = (type: 'positive' | 'negative') => {
    setSettings(s => ({
      ...s,
      whatsappTemplates: {
        ...s.whatsappTemplates,
        [type]: [...(s.whatsappTemplates?.[type] || []), '']
      }
    }))
  }
  
  const updateTemplate = (type: 'positive' | 'negative', index: number, val: string) => {
    setSettings(s => {
      const arr = [...(s.whatsappTemplates?.[type] || [])]
      arr[index] = val
      return { ...s, whatsappTemplates: { ...s.whatsappTemplates, [type]: arr } }
    })
  }

  const removeTemplate = (type: 'positive' | 'negative', index: number) => {
    setSettings(s => {
      const arr = (s.whatsappTemplates?.[type] || []).filter((_, i) => i !== index)
      return { ...s, whatsappTemplates: { ...s.whatsappTemplates, [type]: arr } }
    })
  }

  // ── Save settings ────────────────────────────────────────────────────────────
  const handleSaveSettings = async () => {
    setSaving(true)
    setSaveMsg(null)
    try {
      await saveSchoolSettings(schoolId, settings)
      setSaveMsg({ ok: true, text: '✅ تم حفظ الإعدادات بنجاح' })
    } catch {
      setSaveMsg({ ok: false, text: '❌ حدث خطأ أثناء الحفظ' })
    } finally {
      setSaving(false)
      setTimeout(() => setSaveMsg(null), 3000)
    }
  }

  // ── Change password ──────────────────────────────────────────────────────────
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPw !== confirmPw) { setPwMsg({ ok: false, text: 'كلمة المرور الجديدة وتأكيدها غير متطابقتين' }); return }
    if (newPw.length < 6) { setPwMsg({ ok: false, text: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' }); return }
    setPwLoading(true)
    setPwMsg(null)
    const result = await changeAdminPassword(currentPw, newPw)
    if (result.ok) {
      setPwMsg({ ok: true, text: '✅ تم تغيير كلمة المرور بنجاح' })
      setCurrentPw(''); setNewPw(''); setConfirmPw('')
    } else {
      setPwMsg({ ok: false, text: result.error || 'حدث خطأ' })
    }
    setPwLoading(false)
  }

  // ── Backup ───────────────────────────────────────────────────────────────────
  const [backupLoading, setBackupLoading] = useState(false)
  const [backupMsg, setBackupMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const handleBackup = async () => {
    setBackupLoading(true)
    setBackupMsg(null)
    try {
      const res = await exportFullBackup(schoolId)
      if (res.ok && res.data) {
        const json = JSON.stringify(res.data, null, 2)
        const blob = new Blob([json], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `backup_midad_${new Date().toISOString().split('T')[0]}.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        setBackupMsg({ ok: true, text: '✅ تم تحميل النسخة الاحتياطية بنجاح' })
      } else {
        setBackupMsg({ ok: false, text: res.error || 'حدث خطأ أثناء أخذ النسخة' })
      }
    } catch {
      setBackupMsg({ ok: false, text: 'حدث خطأ غير متوقع' })
    } finally {
      setBackupLoading(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Section 1: Features & Points ─────────────────────────────────────── */}
      <Section title="التحكم في ميزات جدول المعلم" icon="🎛️">
        <p className="text-sm text-muted-foreground mb-5">
          يمكنك تفعيل أو تعطيل كل ميزة في الجدول اليومي للمعلم. الميزات المعطّلة لن تظهر للمعلم ولن تؤثر في النقاط.
        </p>

        <div className="space-y-4">
          {/* Attendance */}
          <div className={`rounded-2xl border p-4 transition-all ${settings.features.attendance ? 'border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800' : 'border-border bg-muted/30 opacity-60'}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl">📅</span>
                <div>
                  <p className="font-bold">حضور الحصص</p>
                  <p className="text-xs text-muted-foreground mt-0.5">تسجيل حضور وغياب وتأخر الطلاب</p>
                </div>
              </div>
              <Toggle enabled={settings.features.attendance} onChange={v => setFeature('attendance', v)} />
            </div>

            {settings.features.attendance && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3 pt-3 border-t border-emerald-200 dark:border-emerald-800">
                <PointInput label="✅ حضور"  value={settings.points.attendance_present} onChange={v => setPoint('attendance_present', v)} color="border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/10" />
                <PointInput label="❌ غياب"  value={settings.points.attendance_absent}  onChange={v => setPoint('attendance_absent', v)}  color="border-red-200 bg-red-50/50 dark:bg-red-950/10" />
                <PointInput label="⏰ تأخر"  value={settings.points.attendance_late}    onChange={v => setPoint('attendance_late', v)}    color="border-amber-200 bg-amber-50/50 dark:bg-amber-950/10" />
              </div>
            )}
          </div>

          {/* Behavior */}
          <div className={`rounded-2xl border p-4 transition-all ${settings.features.behavior ? 'border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800' : 'border-border bg-muted/30 opacity-60'}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl">⭐</span>
                <div>
                  <p className="font-bold">درجة السلوك</p>
                  <p className="text-xs text-muted-foreground mt-0.5">تقييم سلوك الطالب (ممتاز / جيد / يحتاج تحسين)</p>
                </div>
              </div>
              <Toggle enabled={settings.features.behavior} onChange={v => setFeature('behavior', v)} />
            </div>

            {settings.features.behavior && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3 pt-3 border-t border-blue-200 dark:border-blue-800">
                <PointInput label="🌟 ممتاز"         value={settings.points.behavior_excellent} onChange={v => setPoint('behavior_excellent', v)} color="border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/10" />
                <PointInput label="👍 جيد"            value={settings.points.behavior_good}      onChange={v => setPoint('behavior_good', v)}      color="border-blue-200 bg-blue-50/50 dark:bg-blue-950/10" />
                <PointInput label="⚠️ يحتاج تحسين"  value={settings.points.behavior_bad}       onChange={v => setPoint('behavior_bad', v)}       color="border-red-200 bg-red-50/50 dark:bg-red-950/10" />
              </div>
            )}
          </div>

          {/* Homework */}
          <div className={`rounded-2xl border p-4 transition-all ${settings.features.homework ? 'border-violet-200 bg-violet-50 dark:bg-violet-950/20 dark:border-violet-800' : 'border-border bg-muted/30 opacity-60'}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl">📚</span>
                <div>
                  <p className="font-bold">الواجب المنزلي</p>
                  <p className="text-xs text-muted-foreground mt-0.5">متابعة إنجاز الواجب (منجز / لم ينجزه)</p>
                </div>
              </div>
              <Toggle enabled={settings.features.homework} onChange={v => setFeature('homework', v)} />
            </div>

            {settings.features.homework && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 pt-3 border-t border-violet-200 dark:border-violet-800">
                <PointInput label="✅ أنجز الواجب"     value={settings.points.homework_done}    onChange={v => setPoint('homework_done', v)}    color="border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/10" />
                <PointInput label="❌ لم ينجز الواجب" value={settings.points.homework_notdone} onChange={v => setPoint('homework_notdone', v)} color="border-red-200 bg-red-50/50 dark:bg-red-950/10" />
              </div>
            )}
          </div>

          {/* Materials */}
          <div className={`rounded-2xl border p-4 transition-all ${settings.features.materials ? 'border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800' : 'border-border bg-muted/30 opacity-60'}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🎒</span>
                <div>
                  <p className="font-bold">الأدوات المدرسية</p>
                  <p className="text-xs text-muted-foreground mt-0.5">متابعة إحضار الطالب للأدوات (أحضر / لم يحضر)</p>
                </div>
              </div>
              <Toggle enabled={settings.features.materials} onChange={v => setFeature('materials', v)} />
            </div>

            {settings.features.materials && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 pt-3 border-t border-orange-200 dark:border-orange-800">
                <PointInput label="✅ أحضر الأدوات"     value={settings.points.materials_brought}    onChange={v => setPoint('materials_brought', v)}    color="border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/10" />
                <PointInput label="❌ لم يحضر الأدوات" value={settings.points.materials_missing} onChange={v => setPoint('materials_missing', v)} color="border-red-200 bg-red-50/50 dark:bg-red-950/10" />
              </div>
            )}
          </div>

          {/* Participation */}
          <div className={`rounded-2xl border p-4 transition-all ${settings.features.participation ? 'border-sky-200 bg-sky-50 dark:bg-sky-950/20 dark:border-sky-800' : 'border-border bg-muted/30 opacity-60'}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🙋‍♂️</span>
                <div>
                  <p className="font-bold">المشاركة الصفية</p>
                  <p className="text-xs text-muted-foreground mt-0.5">تقييم تفاعل الطالب ومشاركته (مشارك / غير مشارك)</p>
                </div>
              </div>
              <Toggle enabled={settings.features.participation} onChange={v => setFeature('participation', v)} />
            </div>

            {settings.features.participation && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 pt-3 border-t border-sky-200 dark:border-sky-800">
                <PointInput label="🌟 مشارك متفاعل"     value={settings.points.participation_active}    onChange={v => setPoint('participation_active', v)}    color="border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/10" />
                <PointInput label="😴 غير مشارك" value={settings.points.participation_inactive} onChange={v => setPoint('participation_inactive', v)} color="border-slate-200 bg-slate-50/50 dark:bg-slate-950/10" />
              </div>
            )}
          </div>
        </div>

        {/* Save button */}
        <div className="flex items-center gap-4 mt-6">
          <button
            onClick={handleSaveSettings}
            disabled={saving}
            className="px-8 py-3 bg-primary text-primary-foreground font-bold rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {saving ? '⏳ جاري الحفظ...' : '💾 حفظ الإعدادات'}
          </button>
          {saveMsg && (
            <span className={`text-sm font-semibold animate-in fade-in ${saveMsg.ok ? 'text-emerald-600' : 'text-red-600'}`}>
              {saveMsg.text}
            </span>
          )}
        </div>
      </Section>

      {/* ── Section 1.5: WhatsApp Templates ─────────────────────────────────── */}
      <Section title="قوالب رسائل الواتساب" icon="💬">
        <p className="text-sm text-muted-foreground mb-5">
          يمكنك إنشاء عدة قوالب لرسائل الواتساب التي يرسلها المعلم لأولياء الأمور. استخدم المتغيرات التالية لتعويضها تلقائياً عند الإرسال:
          <br/>
          <code className="bg-muted px-1.5 py-0.5 rounded text-primary mx-1">{'{student}'}</code> (اسم الطالب)،
          <code className="bg-muted px-1.5 py-0.5 rounded text-primary mx-1">{'{teacher}'}</code> (اسم المعلم)،
          <code className="bg-muted px-1.5 py-0.5 rounded text-primary mx-1">{'{school}'}</code> (اسم المدرسة).
          <br/><br/>
          <span className="text-amber-600 font-semibold text-xs">ملاحظة المعلم (إن وجدت) ستُضاف تلقائياً في نهاية القالب السلبي.</span>
        </p>

        <div className="space-y-6">
          {/* Positive Templates */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-emerald-600 flex items-center gap-2">
                <span className="p-1.5 bg-emerald-100 dark:bg-emerald-950/50 rounded-lg">🏅</span> القوالب الإيجابية (إشادة / شكر)
              </h3>
              <button
                onClick={() => addTemplate('positive')}
                className="text-xs bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-semibold px-3 py-1.5 rounded-lg transition-colors"
              >
                + إضافة قالب إيجابي
              </button>
            </div>
            
            <div className="space-y-3">
              {(settings.whatsappTemplates?.positive || []).length === 0 && (
                <div className="text-sm text-muted-foreground text-center p-4 bg-muted/30 rounded-xl">لا توجد قوالب إيجابية.</div>
              )}
              {(settings.whatsappTemplates?.positive || []).map((tpl, i) => (
                <div key={i} className="flex gap-2">
                  <textarea
                    value={tpl}
                    onChange={e => updateTemplate('positive', i, e.target.value)}
                    className="flex-1 p-3 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-emerald-500 text-sm min-h-[100px] resize-y"
                    placeholder="اكتب رسالة الشكر هنا..."
                  />
                  <button
                    onClick={() => removeTemplate('positive', i)}
                    className="w-10 flex-shrink-0 flex items-center justify-center bg-red-50 text-red-600 hover:bg-red-100 rounded-xl transition-colors"
                    title="حذف القالب"
                  >
                    🗑️
                  </button>
                </div>
              ))}
            </div>
          </div>

          <hr className="border-border" />

          {/* Negative Templates */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-red-600 flex items-center gap-2">
                <span className="p-1.5 bg-red-100 dark:bg-red-950/50 rounded-lg">⚠️</span> القوالب السلبية (تنبيه / ملاحظة)
              </h3>
              <button
                onClick={() => addTemplate('negative')}
                className="text-xs bg-red-100 hover:bg-red-200 text-red-800 font-semibold px-3 py-1.5 rounded-lg transition-colors"
              >
                + إضافة قالب سلبي
              </button>
            </div>
            
            <div className="space-y-3">
              {(settings.whatsappTemplates?.negative || []).length === 0 && (
                <div className="text-sm text-muted-foreground text-center p-4 bg-muted/30 rounded-xl">لا توجد قوالب سلبية.</div>
              )}
              {(settings.whatsappTemplates?.negative || []).map((tpl, i) => (
                <div key={i} className="flex gap-2">
                  <textarea
                    value={tpl}
                    onChange={e => updateTemplate('negative', i, e.target.value)}
                    className="flex-1 p-3 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-red-500 text-sm min-h-[100px] resize-y"
                    placeholder="اكتب رسالة التنبيه هنا..."
                  />
                  <button
                    onClick={() => removeTemplate('negative', i)}
                    className="w-10 flex-shrink-0 flex items-center justify-center bg-red-50 text-red-600 hover:bg-red-100 rounded-xl transition-colors"
                    title="حذف القالب"
                  >
                    🗑️
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Save button (duplicate for convenience) */}
        <div className="flex items-center gap-4 mt-6">
          <button
            onClick={handleSaveSettings}
            disabled={saving}
            className="px-8 py-3 bg-primary text-primary-foreground font-bold rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {saving ? '⏳ جاري الحفظ...' : '💾 حفظ التعديلات'}
          </button>
          {saveMsg && (
            <span className={`text-sm font-semibold animate-in fade-in ${saveMsg.ok ? 'text-emerald-600' : 'text-red-600'}`}>
              {saveMsg.text}
            </span>
          )}
        </div>
      </Section>

      {/* ── Section 2: Change Password ───────────────────────────────────────── */}
      <Section title="تغيير كلمة المرور" icon="🔐">
        <p className="text-sm text-muted-foreground mb-5">
          حساب المدير: <span className="font-mono bg-muted px-2 py-0.5 rounded-lg text-xs">{adminEmail}</span>
        </p>

        <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
          <div>
            <label className="block text-sm font-semibold mb-1.5">كلمة المرور الحالية</label>
            <input
              type="password"
              required
              value={currentPw}
              onChange={e => setCurrentPw(e.target.value)}
              className="w-full p-3 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary text-sm"
              placeholder="••••••••"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1.5">كلمة المرور الجديدة</label>
            <input
              type="password"
              required
              value={newPw}
              onChange={e => setNewPw(e.target.value)}
              className="w-full p-3 rounded-xl border border-border bg-background outline-none focus:ring-2 focus:ring-primary text-sm"
              placeholder="6 أحرف على الأقل"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1.5">تأكيد كلمة المرور الجديدة</label>
            <input
              type="password"
              required
              value={confirmPw}
              onChange={e => setConfirmPw(e.target.value)}
              className={`w-full p-3 rounded-xl border bg-background outline-none focus:ring-2 focus:ring-primary text-sm ${
                confirmPw && newPw !== confirmPw ? 'border-red-400' : 'border-border'
              }`}
              placeholder="••••••••"
            />
            {confirmPw && newPw !== confirmPw && (
              <p className="text-xs text-red-500 mt-1">كلمتا المرور غير متطابقتين</p>
            )}
          </div>

          {pwMsg && (
            <div className={`rounded-xl p-3 text-sm font-semibold ${pwMsg.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300' : 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/30 dark:border-red-800 dark:text-red-300'}`}>
              {pwMsg.text}
            </div>
          )}

          <button
            type="submit"
            disabled={pwLoading || (!!confirmPw && newPw !== confirmPw)}
            className="w-full py-3 bg-primary text-primary-foreground font-bold rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {pwLoading ? '⏳ جاري التغيير...' : '🔐 تغيير كلمة المرور'}
          </button>
        </form>
      </Section>

      {/* ── Section 3: Backup ────────────────────────────────────────────────── */}
      <Section title="النسخ الاحتياطي والأمان" icon="💾">
        <p className="text-sm text-muted-foreground mb-5">
          يمكنك تحميل نسخة احتياطية كاملة (بصيغة JSON) تحتوي على كافة بيانات النظام (فصول، طلاب، معلمين، درجات، وسجلات حضور) للرجوع إليها في حالات الطوارئ.
        </p>

        <div className="flex items-center gap-4">
          <button
            onClick={handleBackup}
            disabled={backupLoading}
            className="px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-2"
          >
            {backupLoading ? '⏳ جاري تجهيز النسخة...' : '📥 تحميل النسخة الاحتياطية الآن'}
          </button>
          
          {backupMsg && (
            <span className={`text-sm font-semibold animate-in fade-in ${backupMsg.ok ? 'text-emerald-600' : 'text-red-600'}`}>
              {backupMsg.text}
            </span>
          )}
        </div>
      </Section>

    </div>
  )
}
