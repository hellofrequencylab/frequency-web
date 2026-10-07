'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'

// A LINK CARD THAT COUNTS ITS PRESS (LIVE-856). On a published Spotlight the card sends one beacon as the
// visitor leaves (navigator.sendBeacon survives the navigation) and then follows its link as usual. The body
// is text/plain so no preflight is needed from a website host. Without `beacon` it is a plain link.

export function CountedCardLink({
  href,
  beacon,
  className,
  children,
}: {
  href: string
  beacon: { url: string; space: string; target: string } | null
  className?: string
  children: ReactNode
}) {
  const onClick = () => {
    if (!beacon || typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') return
    try {
      navigator.sendBeacon(beacon.url, new Blob([JSON.stringify({ space: beacon.space, target: beacon.target })], { type: 'text/plain' }))
    } catch {
      // Counting never blocks the link.
    }
  }
  return (
    <Link href={href} className={className} onClick={onClick}>
      {children}
    </Link>
  )
}
