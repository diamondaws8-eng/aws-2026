import { db } from '@/lib/db'
import { schools } from '@/lib/db/schema'
import AdminLoginForm from './login-form'

export const dynamic = 'force-dynamic'

export default async function AdminLoginPage() {
  // Once a school exists, nobody may register themselves into the system —
  // admin-side accounts are created from فريق الإدارة instead.
  const [existingSchool] = await db.select({ id: schools.id }).from(schools).limit(1)

  return <AdminLoginForm allowSignup={!existingSchool} />
}
