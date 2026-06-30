'use client'

import { useState } from 'react'
import { Share2, Check } from 'lucide-react'

// Public share affordance for /discover detail pages. A warm visitor who likes
// what they're reading is the cheapest source of the next visitor: handing them a
// one-tap share turns an indexable page into a viral loop. Pure front-end — no
// new data, no server action. Uses the native Web Share API on mobile (where it
// opens the OS share sheet: Messages, WhatsApp, AirDrop…), and falls back to the
// same clipboard-with-textarea pattern the rest of the app's copy buttons use
// (entry-point-share, invite-link-button) when navigator.share is unavailable.
export function ShareButton({
  path,
  title,
  text,
  label = 'Share',
}: {
  /** Site-relative path to share, e.g. /discover/journeys/the-slug. */
  path: string
  /** Title passed to the native share sheet. */
  title: string
  /** Optional descriptive text for the native share sheet. */
  text?: string
  label?: string
}) {
  const [copied, setCopied] = useState(false)

  async function onShare() {
    // window.location.origin keeps the shared link correct across preview/prod
    // without threading SITE_URL through to the client.
    const url = `${window.location.origin}${path}`

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title, text, url })
        return
      } catch {
        // User dismissed the sheet, or share failed — fall through to copy so the
        // button still does something useful.
      }
    }

    try {
      await navigator.clipboard.writeText(url)
    } catch {
      const el = document.createElement('textarea')
      el.value = url
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      type="button"
      onClick={onShare}
      className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated"
    >
      {copied ? (
        <Check className="h-4 w-4 text-success" aria-hidden />
      ) : (
        <Share2 className="h-4 w-4" aria-hidden />
      )}
      {copied ? 'Link copied' : label}
    </button>
  )
}
