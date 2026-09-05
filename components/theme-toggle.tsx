'use client'

import * as React from 'react'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <div className="w-10 h-10 rounded-full bg-muted animate-pulse" />
  }

  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="p-2.5 rounded-full bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors relative focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      aria-label="Toggle theme"
    >
      <div className="relative w-5 h-5">
        <Sun
          className={`absolute inset-0 w-5 h-5 transition-all duration-300 ${
            isDark ? 'scale-0 -rotate-90 opacity-0' : 'scale-100 rotate-0 opacity-100'
          }`}
        />
        <Moon
          className={`absolute inset-0 w-5 h-5 transition-all duration-300 ${
            isDark ? 'scale-100 rotate-0 opacity-100' : 'scale-0 rotate-90 opacity-0'
          }`}
        />
      </div>
    </button>
  )
}
