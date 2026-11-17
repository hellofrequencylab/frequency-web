'use client'

import type { MouseEvent, ReactNode } from 'react'

// THE OWNER'S LINKS ON A THEMED SPOTLIGHT COUNT THEIR PRESSES (LIVE-2327). The theme layouts (New World, Services,
// CyberWitch, ...) each draw the owner's Links block as their own anchors, so rather than thread a beacon through every
// layout, this one wrapper listens for a press on any anchor inside it whose address is one of the owner's links and
// sends the same beacon a Link card sends (LIVE-856). `targets` maps each link address to its `link:<hash>` target.
// Only a published Spotlight renders it; the console preview never does. No visitor data is sent.

export function CountedLinkScope({
  beacon,
  targets,
  children,
}: {
  beacon: { url: string; space: string }
  targets: Record<string, string>
  children: ReactNode
}) {
  const onClickCapture = (e: MouseEvent<HTMLDivElement>) => {
    const a = (e.target as Element | null)?.closest?.('a')
    const href = a?.getAttribute('href')
    const target = href && Object.hasOwn(targets, href) ? targets[href] : undefined
    if (!target || typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') return
    try {
      navigator.sendBeacon(beacon.url, new Blob([JSON.stringify({ space: beacon.space, target })], { type: 'text/plain' }))
    } catch {
      // Counting never blocks the link.
    }
  }
  return <div onClickCapture={onClickCapture}>{children}</div>
}
