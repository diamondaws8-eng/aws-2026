/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * For a host that runs the server itself — cPanel's «Setup Node.js App» —
   * the build is one folder holding the server and only the modules it needs,
   * made on this machine and uploaded as it is (scripts/build-cpanel.mjs sets
   * the variable). Vercel builds without it and is not affected.
   */
  ...(process.env.BUILD_STANDALONE === '1'
    ? { output: 'standalone', outputFileTracingRoot: import.meta.dirname }
    : {}),
  // Type errors must fail the build — shipping a broken page silently is worse
  // than a failed deploy.
  images: {
    unoptimized: true,
  },
  // The server's name and version are nobody's business.
  poweredByHeader: false,
  experimental: {
    /**
     * Restoring a backup hands the whole file to a server action, and Next
     * caps an action body at 1 MB by default — which this school's file
     * passes within the first weeks, making restore impossible exactly when
     * it starts to matter. This raises the ceiling for every action, so it
     * is deliberately modest rather than generous; a full year's export is
     * larger still and wants a streaming upload, not a bigger argument.
     *
     * Ten megabytes, not more: the body is read into memory before the action
     * — and so before its sign-in check — runs. The restore screen itself
     * refuses a file over 4.5 MB on the wire, so nothing honest needs more,
     * and on a host with no cap of its own in front (cPanel) a larger ceiling
     * is memory anyone may ask the one server process to hold.
     */
    serverActions: { bodySizeLimit: '10mb' },
  },
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
          // Sign-in only works over https (the session cookie is secure-only);
          // a browser that has seen this stops trying http at all. Vercel adds
          // it by itself; a host of one's own does not.
          { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
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
