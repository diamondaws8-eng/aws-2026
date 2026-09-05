'use client'

import * as React from 'react'
import { ThemeProvider as NextThemesProvider } from 'next-themes'

// Suppress the specific React 19 hydration warning for next-themes script tags
// This prevents Next.js Turbopack from throwing a full-screen error overlay in development.
if (typeof window !== 'undefined') {
  const originalConsoleError = console.error
  console.error = (...args) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Encountered a script tag while rendering React component')
    ) {
      return
    }
    originalConsoleError.apply(console, args)
  }
}

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
