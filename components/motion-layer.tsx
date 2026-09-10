'use client'

import { useEffect } from 'react'

/**
 * The living part of the interface.
 *
 * Three things, all cheap on a laptop and all switched off for anyone who
 * asked their system for less motion:
 *  - aurora: a few blurred colour fields drifting slowly behind the page in
 *    the portal's own hues (pure CSS animation on transform);
 *  - spotlight: cards light up where the pointer is (two CSS variables set
 *    from one delegated mousemove listener — no per-card handlers);
 *  - tilt: anything marked data-tilt leans toward the pointer in 3D and
 *    settles back when it leaves.
 */
export function MotionLayer() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (!window.matchMedia('(pointer: fine)').matches) return

    let raf = 0
    let last: { el: HTMLElement; x: number; y: number } | null = null

    const apply = () => {
      raf = 0
      if (!last) return
      const { el, x, y } = last
      const r = el.getBoundingClientRect()
      el.style.setProperty('--mx', `${x - r.left}px`)
      el.style.setProperty('--my', `${y - r.top}px`)
      if (el.hasAttribute('data-tilt')) {
        const px = (x - r.left) / r.width - 0.5
        const py = (y - r.top) / r.height - 0.5
        const max = Number(el.getAttribute('data-tilt') || 6)
        el.style.transform = `perspective(900px) rotateX(${(-py * max).toFixed(2)}deg) rotateY(${(px * max).toFixed(2)}deg) translateY(-4px)`
        el.style.setProperty('--glare-x', `${(px + 0.5) * 100}%`)
        el.style.setProperty('--glare-y', `${(py + 0.5) * 100}%`)
      }
    }

    const onMove = (e: MouseEvent) => {
      const target = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-tilt], .bg-card')
      if (!target) return
      last = { el: target, x: e.clientX, y: e.clientY }
      if (!raf) raf = requestAnimationFrame(apply)
    }
    const onLeave = (e: MouseEvent) => {
      const target = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-tilt]')
      if (!target || target.contains(e.relatedTarget as Node | null)) return
      target.style.transform = ''
    }

    document.addEventListener('mousemove', onMove, { passive: true })
    document.addEventListener('mouseout', onLeave, { passive: true })
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseout', onLeave)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div aria-hidden className="aurora" >
      <span className="aurora-orb aurora-a" />
      <span className="aurora-orb aurora-b" />
      <span className="aurora-orb aurora-c" />
      <span className="aurora-grid" />
    </div>
  )
}
