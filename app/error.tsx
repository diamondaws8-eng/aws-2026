'use client'

import { PortalError } from '@/components/portal-error'

export default function Error(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="portal-shell min-h-screen" data-portal="admin">
      <PortalError {...props} home="/" />
    </main>
  )
}
