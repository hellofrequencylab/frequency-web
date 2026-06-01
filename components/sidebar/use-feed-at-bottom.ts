'use client'

import { useEffect, useState } from 'react'

// True once the main feed scroll container is within `threshold` px of its
// bottom. Both bottom docks (left profile, right stats) use this so they reveal
// their extra content at the same moment ("scroll reaches the bottom").
//
// The feed scroll container is tagged with `data-feed-scroll` in AppShell.
export function useFeedAtBottom(threshold = 140): boolean {
  const [atBottom, setAtBottom] = useState(false)

  useEffect(() => {
    const el = document.querySelector('[data-feed-scroll]') as HTMLElement | null
    if (!el) return

    const update = () => {
      const remaining = el.scrollHeight - el.scrollTop - el.clientHeight
      setAtBottom(remaining <= threshold)
    }

    update()
    el.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      el.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [threshold])

  return atBottom
}
