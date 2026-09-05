import { getTeacherSettings } from './actions'
import { TeacherSettingsClient } from './settings-client'

export const dynamic = 'force-dynamic'

export default async function TeacherSettingsPage() {
  const { teacherId, phone, templates } = await getTeacherSettings()

  return (
    <TeacherSettingsClient 
      teacherId={teacherId} 
      initialPhone={phone} 
      initialTemplates={templates} 
    />
  )
}
