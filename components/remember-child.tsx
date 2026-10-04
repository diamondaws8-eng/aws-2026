'use client'

import { useEffect } from 'react'

/**
 * Remembers which child this device looked at last.
 *
 * The portal's address carries no child unless a chip was pressed, so a family
 * with three children landed on the same one every time they opened it — and
 * a home-screen icon always opens the bare address. The page reads this back
 * and checks it against the parent's own children before using it, so a phone
 * that another family signed in on remembers nothing that matters.
 *
 * Written from the browser because a page cannot set a cookie while it
 * renders. Scoped to the parent portal; no other portal is sent it.
 */
export function RememberChild({ id }: { id: string }) {
  useEffect(() => {
    document.cookie = `parent_child=${id}; path=/parent; max-age=31536000; samesite=lax`
  }, [id])
  return null
}
