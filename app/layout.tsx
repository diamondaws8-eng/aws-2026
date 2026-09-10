import { Analytics } from '@vercel/analytics/next'
import { Cairo, Geist_Mono, Reem_Kufi } from 'next/font/google'
import type { Metadata, Viewport } from 'next'

const cairo = Cairo({ subsets: ['arabic', 'latin'], variable: '--font-cairo' })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })
// Kufic display face — used for the school's name so it reads as a brand mark.
const reemKufi = Reem_Kufi({ subsets: ['arabic'], variable: '--font-kufi-src', weight: ['400', '600', '700'] })
import './globals.css'

export const metadata: Metadata = {
  title: 'مدارس الأوس الأهلية | نظام إدارة المدرسة',
  description: 'منصة عربية ذكية لإدارة المدرسة ومتابعة أداء الطلاب.',
  applicationName: 'مدارس الأوس الأهلية',
  icons: {
    icon: [{ url: '/logo.jpg' }],
    apple: '/logo.jpg',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  // The browser chrome on a phone matches the page's own background tokens.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f7fb' },
    { media: '(prefers-color-scheme: dark)', color: '#151824' },
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
      <body className={`${cairo.variable} ${geistMono.variable} ${reemKufi.variable} font-sans antialiased bg-background text-foreground transition-colors duration-300`} suppressHydrationWarning>
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
