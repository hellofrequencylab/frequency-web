'use client'

import type { ReactNode } from 'react'

// A LINK ON A MEMBER'S PERSONAL SPOTLIGHT THAT COUNTS ITS PRESS (LIVE-1954). One beacon as the visitor leaves
// (navigator.sendBeacon survives the navigation), then the link opens as usual in a new tab. The body is text/plain
// so no preflight is needed. Without `beacon` (the editor's preview) it is a plain link. No visitor data is sent.

export function CountedExternalLink({
  href,
  beacon,
  className,
  children,
}: {
  href: string
  beacon: { profile: string; link: string } | null
  className?: string
  children: ReactNode
}) {
  const onClick = () => {
    if (!beacon || typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') return
    try {
      navigator.sendBeacon('/api/spotlight/click', new Blob([JSON.stringify(beacon)], { type: 'text/plain' }))
    } catch {
      // Counting never blocks the link.
    }
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className} onClick={onClick}>
      {children}
    </a>
  )
}
