'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSchool } from './actions'
import { BrandLogo } from '@/components/brand-logo'

export default function AdminSetupPage() {
  const [name, setName] = useState('')
  const [academicYear, setAcademicYear] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await createSchool({ name, academicYear })
      if (res.error) {
        setError(res.error)
      } else {
        router.push('/admin')
      }
    } catch (err: any) {
      setError('حدث خطأ أثناء إعداد المدرسة')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 dir-rtl">
      <div className="w-full max-w-md bg-card p-6 rounded-3xl border border-border shadow-sm">
        <div className="text-center mb-8">
          <BrandLogo size={88} />
          <h1 className="text-2xl font-bold text-foreground mt-4">إعداد النظام</h1>
          <p className="text-muted-foreground mt-2">الرجاء إدخال بيانات المدرسة للبدء</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">اسم المدرسة</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full p-3 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="مثال: مدارس المجد الأهلية"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">العام الدراسي</label>
            <input
              type="text"
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              required
              className="w-full p-3 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="مثال: ١٤٤٦/١٤٤٧"
            />
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading ? 'جاري الإعداد...' : 'حفظ والبدء'}
          </button>
        </form>
      </div>
    </div>
  )
}
