'use server'

import { db } from '@/lib/db'
import { students, user, account } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'



// ── Add single student ────────────────────────────────────────────────────────
export async function addStudent(input: any) {
  try {
    let parentUserId = null

    if (input.parentPhone) {
      const phoneDigits     = input.parentPhone.replace(/\D/g, '')
      const parentEmailAddr = `${phoneDigits}@parent.midad.local`

      const [existingUser] = await db.select().from(user).where(eq(user.email, parentEmailAddr)).limit(1)

      if (!existingUser) {
        try {
          const result = await auth.api.signUpEmail({
            body: { email: parentEmailAddr, password: '12345678', name: `ولي أمر ${input.fullName}` }
          })
          await db.update(user).set({ role: 'parent', updatedAt: new Date() }).where(eq(user.email, parentEmailAddr))
        } catch (e) {
          console.error("signUpEmail Error:", e)
        }
      }

      const [pUser] = await db.select().from(user).where(eq(user.email, parentEmailAddr)).limit(1)
      parentUserId = pUser?.id ?? null
    }

    await db.insert(students).values({
      schoolId:    input.schoolId,
      fullName:    input.fullName,
      nationalId:  input.nationalId || null,
      parentPhone: input.parentPhone || null,
      gender:      input.gender,
      classId:     input.classId || null,
      parentUserId,
    })

    revalidatePath('/admin/students')
    return { ok: true }
  } catch (err: any) {
    console.error("Server Action Error in addStudent:", err)
    return { ok: false, error: err.message || String(err) }
  }
}

// ── Delete student ────────────────────────────────────────────────────────────
export async function deleteStudent(id: string) {
  await db.delete(students).where(eq(students.id, id))
  revalidatePath('/admin/students')
}

// ── Edit student ──────────────────────────────────────────────────────────────
export async function editStudent(id: string, input: any) {
  try {
    let parentUserId = null

    if (input.parentPhone) {
      const phoneDigits     = input.parentPhone.replace(/\D/g, '')
      const parentEmailAddr = `${phoneDigits}@parent.midad.local`

      const [existingUser] = await db.select().from(user).where(eq(user.email, parentEmailAddr)).limit(1)

      if (!existingUser) {
        try {
          await auth.api.signUpEmail({
            body: { email: parentEmailAddr, password: '12345678', name: `ولي أمر ${input.fullName}` }
          })
          await db.update(user).set({ role: 'parent', updatedAt: new Date() }).where(eq(user.email, parentEmailAddr))
        } catch (e) {
          console.error("signUpEmail Error:", e)
        }
      }

      const [pUser] = await db.select().from(user).where(eq(user.email, parentEmailAddr)).limit(1)
      parentUserId = pUser?.id ?? null
    }

    await db.update(students).set({
      fullName:    input.fullName,
      nationalId:  input.nationalId || null,
      parentPhone: input.parentPhone || null,
      gender:      input.gender,
      classId:     input.classId || null,
      parentUserId,
    }).where(eq(students.id, id))

    revalidatePath('/admin/students')
    return { ok: true }
  } catch (err: any) {
    console.error("Server Action Error in editStudent:", err)
    return { ok: false, error: err.message || String(err) }
  }
}


// ── Bulk import from Excel ────────────────────────────────────────────────────
export async function importStudents(
  rows: {
    fullName: string
    nationalId?: string
    parentPhone?: string
    gender: string
    classId?: string
  }[],
  schoolId: string
) {
  let created = 0
  let failed  = 0
  const errors: string[] = []
  
  // Cache headers to avoid calling await headers() in every loop iteration
  const reqHeaders = await headers()

  for (const row of rows) {
    try {
      if (!row.fullName?.trim()) {
        failed++
        errors.push('صف بدون اسم')
        continue
      }

      let parentUserId: string | null = null

      if (row.parentPhone) {
        // Excel sometimes exports numbers as floats e.g. 5012345678.0
        const phoneDigits     = String(row.parentPhone).replace(/\.0+$/, '').replace(/\D/g, '')
        const parentEmailAddr = `${phoneDigits}@parent.midad.local`

        const [existingUser] = await db
          .select()
          .from(user)
          .where(eq(user.email, parentEmailAddr))
          .limit(1)

        if (!existingUser) {
          try {
            const result = await auth.api.signUpEmail({
              body: { email: parentEmailAddr, password: '12345678', name: `ولي أمر ${row.fullName.trim()}` }
            })
            await db
              .update(user)
              .set({ role: 'parent', updatedAt: new Date() })
              .where(eq(user.email, parentEmailAddr))
          } catch (e) {
            console.error("Excel import signUpEmail Error:", e)
          }
        }
        
        const [pUser] = await db.select().from(user).where(eq(user.email, parentEmailAddr)).limit(1)
        parentUserId = pUser?.id ?? null
      }

      await db.insert(students).values({
        schoolId,
        fullName:    row.fullName.trim(),
        nationalId:  row.nationalId  ? String(row.nationalId).replace(/\.0+$/, '').trim()  : null,
        parentPhone: row.parentPhone ? String(row.parentPhone).replace(/\.0+$/, '').trim() : null,
        gender:      row.gender === 'أنثى' || row.gender === 'female' ? 'female' : 'male',
        classId:     row.classId || null,
        parentUserId,
      })
      created++
    } catch (e) {
      failed++
      errors.push(row.fullName || 'صف غير معروف')
    }
  }

  revalidatePath('/admin/students')
  return { created, failed, errors }
}
