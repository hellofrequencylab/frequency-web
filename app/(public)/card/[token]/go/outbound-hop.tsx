'use client'

import { useEffect, useRef } from 'react'
import { buttonClasses } from '@/components/ui/button'

// Opens the card's site once per tap, and sends a visitor who comes back (closing the app's in-app
// window, or Back in a browser) on to Frequency's home (LIVE-1298). The tap's nonce keys the "already
// opened" mark in sessionStorage, so the next tap in the same tab opens the site again; a ref covers a
// browser that blocks storage and restores the page from its back/forward cache. Copy obeys CONTENT-VOICE.

export function OutboundHop({ url, nonce }: { url: string; nonce: string | null }) {
  const opened = useRef(false)
  const host = new URL(url).hostname.replace(/^www\./, '')

  useEffect(() => {
    const key = nonce ? `card-go:${nonce}` : null
    const go = () => {
      let seen = opened.current
      try {
        if (key && sessionStorage.getItem(key) === '1') seen = true
      } catch {
        // Storage blocked: the ref still covers a page restored from the back/forward cache.
      }
      if (seen && key) {
        window.location.replace('/')
        return
      }
      opened.current = true
      try {
        if (key) sessionStorage.setItem(key, '1')
      } catch {
        // As above.
      }
      window.location.assign(url)
    }
    go()
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) go()
    }
    window.addEventListener('pageshow', onShow)
    return () => window.removeEventListener('pageshow', onShow)
  }, [url, nonce])

  return (
    <div className="mx-auto flex min-h-[50vh] w-full max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-body text-text">Opening {host}</p>
      <a href={url} className={buttonClasses('primary', 'sm')}>
        Open {host}
      </a>
    </div>
  )
}
