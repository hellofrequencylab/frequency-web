'use client'

import { useEffect, useState } from 'react'
import { readLinkCard, type LinkCard } from '@/lib/link-preview/actions'

// A CARD UNDER A MESSAGE WITH A LINK (LIVE-2530). Reads once per mount under the viewer's session:
// an outside page's cached title, blurb and image, or one of our own events or Spaces live. Nothing
// shows while it loads or when there is nothing to show, so a link never jumps the thread around
// with an empty box. The image is a plain https <img> with no referrer, never proxied or optimized.

export function LinkCardFor({ url }: { url: string }) {
  const [card, setCard] = useState<LinkCard | null>(null)

  useEffect(() => {
    let live = true
    let retry: ReturnType<typeof setTimeout> | null = null
    const read = (again: boolean) =>
      readLinkCard(url)
        .then((c) => {
          if (!live) return
          if (c) setCard(c)
          // A link just sent is fetched after the send returns, so look once more a moment later.
          else if (again) retry = setTimeout(() => void read(false), 5000)
        })
        .catch(() => {})
    void read(true)
    return () => {
      live = false
      if (retry) clearTimeout(retry)
    }
  }, [url])

  if (!card) return null
  return (
    <a
      href={card.url}
      target={card.kind === 'outside' ? '_blank' : undefined}
      rel={card.kind === 'outside' ? 'noopener noreferrer nofollow' : undefined}
      className="mt-2 flex max-w-sm gap-3 overflow-hidden rounded-control border border-border bg-surface p-2 text-left transition-colors hover:border-primary-bg"
      data-link-card={card.kind}
    >
      {card.kind === 'outside' && card.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={card.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-16 w-16 shrink-0 rounded-sm object-cover" />
      )}
      <span className="min-w-0">
        <span className="block text-meta text-muted">{card.kind === 'outside' ? card.siteName ?? card.host : card.label}</span>
        <span className="block truncate text-body-sm font-semibold text-text">{card.title}</span>
        {card.kind === 'outside' && card.description && <span className="line-clamp-2 block text-meta text-muted">{card.description}</span>}
      </span>
    </a>
  )
}
