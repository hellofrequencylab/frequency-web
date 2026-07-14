'use client'

import { useState } from 'react'
import { Check, Copy, Podcast, Rss } from 'lucide-react'
import { buttonClasses } from '@/components/ui/button'

// Airwaves P3 — the listener SUBSCRIBE row for a public Show page (ADR-608). Three ways to follow a
// Show: open it in Apple Podcasts (the `podcast://` deep link hands the feed straight to the app),
// open Spotify for Podcasters (the RSS lands a Show in Spotify once submitted), or copy the raw RSS
// link to paste into any other player. A client island only because "Copy RSS link" writes to the
// clipboard; everything else is a plain link. Voice: plain, no em dashes; DAWN tokens only.

export function ShowSubscribe({ feedUrl }: { feedUrl: string }) {
  const [copied, setCopied] = useState(false)

  // Apple's `podcast://` scheme wants the feed URL with the http(s) scheme stripped.
  const appleDeepLink = `podcast://${feedUrl.replace(/^https?:\/\//, '')}`

  async function copyFeed() {
    try {
      await navigator.clipboard.writeText(feedUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked (permission / insecure context): select-and-copy fallback is the URL text,
      // which stays visible below, so the listener can copy it by hand.
      setCopied(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <a href={appleDeepLink} className={buttonClasses('secondary', 'md')}>
          <Podcast className="h-4 w-4" aria-hidden />
          Apple Podcasts
        </a>
        <a
          href="https://podcasters.spotify.com/"
          target="_blank"
          rel="noreferrer"
          className={buttonClasses('secondary', 'md')}
        >
          <Podcast className="h-4 w-4" aria-hidden />
          Spotify
        </a>
        <button type="button" onClick={copyFeed} className={buttonClasses('secondary', 'md')} aria-live="polite">
          {copied ? <Check className="h-4 w-4 text-success" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          {copied ? 'Copied' : 'Copy RSS link'}
        </button>
      </div>

      <p className="flex items-start gap-1.5 text-xs text-muted">
        <Rss className="mt-0.5 h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
        <span>
          Paste the RSS link into any podcast app to follow along. To list this Show in the big directories,
          submit the same link at podcasts.apple.com and podcasters.spotify.com.
        </span>
      </p>
    </div>
  )
}
