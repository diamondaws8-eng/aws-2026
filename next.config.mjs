/** @type {import('next').NextConfig} */
const nextConfig = {
  // Type errors must fail the build — shipping a broken page silently is worse
  // than a failed deploy.
  images: {
    unoptimized: true,
  },
}

export default nextConfig
