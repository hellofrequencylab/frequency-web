'use client'

import { useState } from 'react'

// The card people see when this page's link is shared (the page's own opengraph-image route). It sits at
// the top of the QR & Share panel so a host sees exactly what a link preview will show. A page with no
// card of its own answers 404, so the image hides itself on error and the panel stays unchanged.
// Tokens only, no hex; copy carries no em or en dashes.

export function SharePreviewCard({ pathname }: { pathname: string }) {
  const [failed, setFailed] = useState(false)
  if (failed || !pathname || pathname === '/') return null
  const src = `${pathname.replace(/\/$/, '')}/opengraph-image`

  return (
    <figure className="mb-4 overflow-hidden rounded-card border border-border bg-canvas">
      {/* eslint-disable-next-line @next/next/no-img-element -- generated share card, served by its own route */}
      <img
        src={src}
        alt="Preview of the card shown when this page is shared"
        width={1200}
        height={630}
        loading="lazy"
        onError={() => setFailed(true)}
        className="block h-auto w-full"
      />
      <figcaption className="px-3 py-2 text-meta text-muted">How this page looks when you share the link</figcaption>
    </figure>
  )
}
