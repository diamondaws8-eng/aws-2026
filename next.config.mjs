/** @type {import('next').NextConfig} */
const nextConfig = {
  // Type errors must fail the build — shipping a broken page silently is worse
  // than a failed deploy.
  images: {
    unoptimized: true,
  },
  // The server's name and version are nobody's business.
  poweredByHeader: false,
  /**
   * Browser-side hardening for every response. The admin portal edits pupils'
   * records, so it must never be framed by another site (clickjacking), the
   * browser must not second-guess content types, and the referrer must not
   * leak the page a person came from to outside links. No CSP: Next's own
   * inline scripts would need nonces on every page for little gain here.
   */
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
        ],
      },
    ]
  },
}

export default nextConfig
