import { Analytics } from '@vercel/analytics/next'
import { Cairo, Geist_Mono } from 'next/font/google'
import type { Metadata, Viewport } from 'next'

const cairo = Cairo({ subsets: ['arabic', 'latin'], variable: '--font-cairo' })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })
import './globals.css'

export const metadata: Metadata = {
  title: 'مِداد | نظام إدارة المدرسة',
  description: 'منصة عربية ذكية لإدارة المدرسة ومتابعة أداء الطلاب.',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: 'black' },
  ],
}

import { ThemeProvider } from '@/components/theme-provider'

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body className={`${cairo.variable} ${geistMono.variable} font-sans antialiased bg-background text-foreground transition-colors duration-300`} suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          {process.env.NODE_ENV === 'production' && <Analytics />}
        </ThemeProvider>
      </body>
    </html>
  )
}
