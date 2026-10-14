'use client'

// THE NAVIGATION PROGRESS BAR (owner, 2026-10-14: "the menu links don't seem to be working"). A click on
// an in-app link starts a soft navigation that renders nothing until the next page's payload arrives, so
// a slow page read like a dead link. This bar appears on the click and clears when the route changes.
//
// Tiny on purpose (it ships in both shells on every page): one capture-phase click listener, no router
// patching. It ignores modified clicks, new-tab targets, downloads, hash-only and same-URL links, and
// external hosts, and gives up after 30s so a failed navigation never leaves it running.

import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

export function NavProgress() {
  const pathname = usePathname()
  const [busy, setBusy] = useState(false)
  const [seen, setSeen] = useState(pathname)

  // The route changed: the navigation finished.
  if (seen !== pathname) {
    setSeen(pathname)
    if (busy) setBusy(false)
  }

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.('a')
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return
      const href = a.getAttribute('href')
      if (!href || href.startsWith('#')) return
      let url: URL
      try {
        url = new URL(href, window.location.href)
      } catch {
        return
      }
      if (url.origin !== window.location.origin) return
      if (url.pathname === window.location.pathname && url.search === window.location.search) return
      setBusy(true)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  useEffect(() => {
    if (!busy) return
    const t = window.setTimeout(() => setBusy(false), 30_000)
    return () => window.clearTimeout(t)
  }, [busy])

  return <div className={busy ? 'fq-navprog on' : 'fq-navprog'} role="progressbar" aria-hidden={!busy} aria-label="Loading page" />
}
