'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useSyncExternalStore } from 'react'
import { formatRemaining } from '@/lib/offers/operator-offer'

// THE OFFER COUNTDOWN. A strip under the header that keeps counting after the full-screen offer is
// closed. It reads the clock through a store (not in render) and shows nothing on the server pass, so
// the first paint never disagrees with the browser. `pending` means the offer is due but has not been
// shown yet: it opens the offer page once per browser session.

const SEEN_KEY = 'offer:opened'

function subscribe(onChange: () => void): () => void {
  const id = window.setInterval(onChange, 1000)
  return () => window.clearInterval(id)
}
const now = () => Math.floor(Date.now() / 1000) * 1000
const serverNow = () => 0

export function OfferBar({ href, endsAtMs, pending }: { href: string; endsAtMs: number | null; pending: boolean }) {
  const router = useRouter()
  const tick = useSyncExternalStore(subscribe, now, serverNow)

  useEffect(() => {
    if (!pending) return
    try {
      if (window.sessionStorage.getItem(SEEN_KEY) === '1') return
      window.sessionStorage.setItem(SEEN_KEY, '1')
    } catch {
      // Storage blocked: open it this once.
    }
    router.push(href)
  }, [pending, href, router])

  if (endsAtMs === null || tick === 0 || tick >= endsAtMs) return null
  return (
    <div role="status" className="border-b border-primary/30 bg-primary-bg/70">
      <div className="mx-auto flex w-full max-w-[105rem] flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2">
        <p className="text-center text-body-sm text-primary-strong">Your Beta offer ends in</p>
        <span className="shrink-0 rounded-pill bg-primary/10 px-2.5 py-1 text-meta font-semibold text-primary-strong tabular-nums">
          {formatRemaining(endsAtMs - tick)}
        </span>
        <Link href={href} className="text-body-sm font-semibold text-primary-strong underline underline-offset-2">
          See the offer
        </Link>
      </div>
    </div>
  )
}
