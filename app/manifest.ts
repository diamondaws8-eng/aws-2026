import type { MetadataRoute } from 'next'

/**
 * What a phone needs to keep the site on its home screen. It is also the
 * condition for the rest: an iPhone only lets a site send notifications once
 * it has been added there and opened from there.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'مدارس الأوس الأهلية',
    short_name: 'الأوس',
    description: 'منصة عربية ذكية لإدارة المدرسة ومتابعة أداء الطلاب.',
    // One app for every portal: the front door sends a signed-in person on to
    // their own. The id keeps it the same app if the start address ever moves.
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    dir: 'rtl',
    lang: 'ar',
    // The page's own daylight background, so the splash screen and the status
    // bar do not flash another colour before the first paint.
    background_color: '#f6f7fb',
    theme_color: '#f6f7fb',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
