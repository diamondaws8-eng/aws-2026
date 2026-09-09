import { redirect } from 'next/navigation'
import { getTeacherAccess } from '@/lib/teacher-access'
import { getTeacherSettings } from './actions'
import { TeacherSettingsClient } from './settings-client'

export const dynamic = 'force-dynamic'

export default async function TeacherSettingsPage() {
  // The layout redirects an unauthorised visitor, but this page renders in
  // parallel with it, and getTeacherSettings throws when there is no teacher —
  // which reached the logs as an error on every anonymous hit. Asking first
  // says the same thing without the noise.
  const access = await getTeacherAccess()
  if (!access) redirect('/teacher/login')

  const { teacherId, phone, templates } = await getTeacherSettings()

  return (
    <TeacherSettingsClient
      teacherId={teacherId}
      initialPhone={phone}
      initialTemplates={templates}
    />
  )
}
