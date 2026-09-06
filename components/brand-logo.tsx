import Image from 'next/image'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export function BrandLogo({
  size = 48,
  href = '/',
  className,
  rounded = 'rounded-2xl',
}: {
  size?: number
  href?: string | null
  className?: string
  rounded?: string
}) {
  const image = (
    <Image
      src="/logo.jpg"
      alt="مدارس الأوس الأهلية"
      width={size}
      height={size}
      className={cn(rounded, 'object-cover shadow-sm', className)}
      priority
    />
  )

  if (!href) return image

  return (
    <Link href={href} className="inline-flex shrink-0" aria-label="مدارس الأوس الأهلية">
      {image}
    </Link>
  )
}
