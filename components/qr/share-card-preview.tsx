'use client'

import { useState } from 'react'

// The card people see when this page's link is shared. It reads the page's own og:image tag, which is the
// exact card URL (the card routes carry a build hash, so the path cannot be guessed). The URL is reduced to
// its path so the image loads from the same origin as the page. A page with no card has no tag, or the image
// fails to load, and the preview hides so the panel stays unchanged. Tokens only, no hex; copy carries no
// em or en dashes.

function cardPathFromMeta(): string | null {
  if (typeof document === 'undefined') return null
  try {
    const content = document.querySelector('meta[property="og:image"]')?.getAttribute('content')
    if (!content) return null
    const u = new URL(content, window.location.origin)
    return `${u.pathname}${u.search}`
  } catch {
    return null
  }
}

export function SharePreviewCard() {
  // Read once when the panel opens (this mounts inside the dialog, never during server render).
  const [src] = useState(cardPathFromMeta)
  const [failed, setFailed] = useState(false)

  if (!src || failed) return null

  return (
    <figure className="mb-4 overflow-hidden rounded-card border border-border bg-canvas">
      {/* eslint-disable-next-line @next/next/no-img-element -- generated share card, served by its own route */}
      <img
        src={src}
        alt="Preview of the card shown when this page is shared"
        width={1200}
        height={630}
        onError={() => setFailed(true)}
        className="block h-auto w-full"
      />
      <figcaption className="px-3 py-2 text-meta text-muted">How this page looks when you share the link</figcaption>
    </figure>
  )
}
