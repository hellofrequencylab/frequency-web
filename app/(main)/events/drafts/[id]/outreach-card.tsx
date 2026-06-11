'use client'

// The outreach prompt after publishing an event on an organizer's behalf: the
// one-time claim link plus a prewritten note to send them. Shown right after a
// 'posted' publish and again on the published draft page while the event stays
// unclaimed. Copy is voice-canon (plain, no em dashes).

import { useState } from 'react'
import Link from 'next/link'
import { Check, Copy, Link2, Zap } from 'lucide-react'
import { SITE_URL } from '@/lib/site'

export function OutreachCard({ claimToken, slug }: { claimToken: string; slug: string }) {
  const [copied, setCopied] = useState<'message' | 'link' | null>(null)

  const claimLink = `${SITE_URL}/events/claim/${claimToken}`
  const message = `I posted your event on Frequency so locals can find it. It is yours to claim here: ${claimLink}`

  async function copy(kind: 'message' | 'link') {
    try {
      await navigator.clipboard.writeText(kind === 'message' ? message : claimLink)
      setCopied(kind)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      /* clipboard can be blocked — the text stays visible to copy by hand */
    }
  }

  return (
    <div className="rounded-2xl border border-primary/40 bg-primary-bg/60 p-4">
      <p className="flex items-center gap-1.5 text-sm font-bold text-text">
        <Zap className="h-4 w-4 text-primary" /> It is live. Now tell the organizer.
      </p>
      <p className="mt-1 text-sm text-muted">
        Send them this note. When they claim the event they become its host, and you get the
        credit for putting it on the map.
      </p>

      <div className="mt-3 rounded-xl border border-border bg-surface p-3">
        <p className="break-words text-sm text-text">{message}</p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => copy('message')}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover"
        >
          {copied === 'message' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied === 'message' ? 'Copied' : 'Copy the message'}
        </button>
        <button
          type="button"
          onClick={() => copy('link')}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-2 text-xs font-medium text-text transition-colors hover:bg-surface-elevated"
        >
          {copied === 'link' ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
          {copied === 'link' ? 'Copied' : 'Copy link'}
        </button>
        <Link href={`/events/${slug}`} className="text-xs font-semibold text-primary-strong hover:underline">
          View the event
        </Link>
      </div>
    </div>
  )
}
