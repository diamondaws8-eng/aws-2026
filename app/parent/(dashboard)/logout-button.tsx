'use client'

import { authClient } from '@/lib/auth-client'
import { useRouter } from 'next/navigation'

export function LogoutButton() {
  const router = useRouter()

  async function handleLogout() {
    await authClient.signOut()
    router.push('/parent/login')
  }

  return (
    <button
      onClick={handleLogout}
      className="w-9 h-9 flex items-center justify-center rounded-xl bg-muted/50 text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-colors"
      title="تسجيل الخروج"
    >
      ↩
    </button>
  )
}
