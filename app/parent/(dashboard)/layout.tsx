import { db } from '@/lib/db'
import { students, schools } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'
import { requireParent, childIdentityNumbers } from '@/lib/parent-access'
import { PortalLayout } from '@/components/portal-layout'
import { SetPasswordCard } from './set-password-card'
import { PushResume } from '@/components/push-resume'

export default async function ParentDashboardLayout({ children }: { children: React.ReactNode }) {
  // A parent's portal, for parents. A teacher or an administrator who lands
  // here is signed in, but not as a parent — the helper sends them to pick
  // their portal. The page underneath asks the same helper, so the two share
  // one lookup and can never disagree about who is asking.
  const parent = await requireParent()

  // While the account still has the shared starter password, nothing else is
  // reachable — the parent must pick their own password first. This card only
  // hides the page; what keeps the child's data back is each reader refusing
  // on the same flag.
  if (parent.mustChangePassword) {
    const identityOnFile = (await childIdentityNumbers(parent.id)).length > 0
    return <SetPasswordCard askChildId={identityOnFile} />
  }

  // The school's real name, through the first linked child. It used to be a
  // hard-coded string — right until the day the school is renamed or a second
  // one exists, and then wrong on every parent's screen.
  const [row] = await db
    .select({ schoolName: schools.name, childName: students.fullName })
    .from(students)
    .innerJoin(schools, eq(schools.id, students.schoolId))
    .where(eq(students.parentUserId, parent.id))
    .orderBy(sql`CASE WHEN ${students.status} = 'active' THEN 0 ELSE 1 END`, students.fullName)
    .limit(1)
  const schoolName = row?.schoolName ?? 'بوابة ولي الأمر'
  // The account itself carries no child's name (see PARENT_ACCOUNT_NAME); the
  // label is made here, for a family that has already proven who it is.
  const displayName = row ? `ولي أمر ${row.childName}` : parent.name

  return (
    <PortalLayout
      role="parent"
      user={{ name: displayName, email: parent.email }}
      schoolName={schoolName}
    >
      <PushResume />
      {children}
    </PortalLayout>
  )
}
