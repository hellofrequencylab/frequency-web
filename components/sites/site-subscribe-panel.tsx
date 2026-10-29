'use client'

import { useId, useState } from 'react'
import { CalendarPlus, Check, Copy } from 'lucide-react'

// THE WEBSITE CALENDAR'S SUBSCRIBE PANEL (calendar suite pass 9, the handoff's "Guest: Subscribe card").
// It sits under the Upcoming list and says what subscribing does, then offers the three ways in, always
// open: Apple, Google, or copy the link. The Space's feed is public (its slug is the whole address), so
// nothing here asks anyone to keep it private. It takes the feed URLs as props; the page resolves them.

export function SiteSubscribePanel({ brandName, httpsUrl, webcalUrl }: { brandName: string; httpsUrl: string; webcalUrl: string }) {
  const [copied, setCopied] = useState(false)
  const headingId = useId()
  const googleUrl = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(httpsUrl)}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(httpsUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard blocked: the link is still the Apple and Google buttons' own address.
    }
  }

  return (
    <section aria-labelledby={headingId} data-site-subscribe className="min-w-0 rounded-card border border-border bg-surface p-4">
      <h2 id={headingId} className="flex items-center gap-2 text-body font-semibold text-text">
        <CalendarPlus className="h-4 w-4 shrink-0" aria-hidden />
        {brandName} in your calendar
      </h2>
      <p className="mt-1 text-body-sm text-muted">
        Subscribe once and {brandName}&rsquo;s events show up in Google or Apple Calendar, and stay current on their own.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        <a
          href={webcalUrl}
          className="inline-flex items-center justify-center rounded-control bg-primary px-3 py-2 text-body-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
        >
          Add to Apple Calendar
        </a>
        <a
          href={googleUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-control border border-border px-3 py-2 text-body-sm font-medium text-text transition-colors hover:bg-surface-elevated"
        >
          Add to Google Calendar
        </a>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center justify-center gap-2 rounded-control border border-border px-3 py-2 text-body-sm font-medium text-muted transition-colors hover:bg-surface-elevated hover:text-text"
        >
          {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
    </section>
  )
}
