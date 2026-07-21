'use client'

import { useState } from 'react'
import { CalendarPlus, Check, Copy } from 'lucide-react'

// Client menu for "Subscribe to calendar" (Events B-4 personal feed + EC2 public space feed). Pure
// presentation over a feed URL (resolved server-side) — a button that opens a small panel with copy +
// Google/Apple subscribe actions. No data fetching here; the URL arrives as a prop. The default copy is
// for the PERSONAL member feed (a private token); a public feed (a space calendar) passes its own title
// + description so the microcopy stays truthful (the space slug is public, not a secret).
const PERSONAL_TITLE = 'Your events, in your calendar'
const PERSONAL_DESCRIPTION =
  "Subscribe once and the events you're going to show up in Google or Apple Calendar, and stay current on their own. This link is yours, so keep it private."

export function CalendarSubscribeMenu({
  httpsUrl,
  webcalUrl,
  title = PERSONAL_TITLE,
  description = PERSONAL_DESCRIPTION,
}: {
  httpsUrl: string
  webcalUrl: string
  /** Panel heading. Defaults to the personal-feed copy; a public space feed passes its own. */
  title?: string
  /** Panel body. Defaults to the personal-feed copy; a public space feed passes its own (never
   *  "keep it private" — the space feed URL is public). */
  description?: string
}) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  // Google Calendar's "add by URL" endpoint takes the https feed directly.
  const googleUrl = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(httpsUrl)}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(httpsUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard blocked (rare) — the URL is still visible to copy by hand.
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-elevated hover:text-text"
      >
        <CalendarPlus className="h-4 w-4" />
        Subscribe to calendar
      </button>

      {open && (
        <>
          {/* Click-away backdrop. */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 z-20 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-surface p-4 shadow-pop">
            <p className="text-sm font-semibold text-text">{title}</p>
            <p className="mt-1 text-2xs leading-relaxed text-subtle">{description}</p>

            <div className="mt-3 flex flex-col gap-2">
              <a
                href={webcalUrl}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
              >
                Add to Apple Calendar
              </a>
              <a
                href={googleUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text transition-colors hover:bg-surface-elevated"
              >
                Add to Google Calendar
              </a>
              <button
                type="button"
                onClick={copy}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-elevated hover:text-text"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied' : 'Copy link'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
