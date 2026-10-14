'use client'

// THE FEED PREVIEW'S JOIN PROMPT (owner, 2026-10-14). A signed-out visitor reads the public Feed for 30
// seconds, then this prompt asks them to join free to keep reading. It does not close on Escape or a
// backdrop click: the preview has ended, and the ways on are Join, Log in, or back to Home. The clock
// lives in lib/feed/join-gate.ts (sessionStorage, so a reload keeps it).

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Dialog } from '@/components/ui/dialog'
import { buttonClasses } from '@/components/ui/button'
import { BETA_CTA_HREF } from '@/lib/site'
import { FEED_PREVIEW_KEY, previewRemainingMs, previewStartedAt } from '@/lib/feed/join-gate'

const TITLE_ID = 'feed-join-title'

function readStamp(): string | null {
  try {
    return window.sessionStorage.getItem(FEED_PREVIEW_KEY)
  } catch {
    return null
  }
}

function writeStamp(value: number) {
  try {
    window.sessionStorage.setItem(FEED_PREVIEW_KEY, String(value))
  } catch {
    // Private mode or blocked storage: the 30 seconds simply restart on a reload.
  }
}

export function FeedJoinGate() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const now = Date.now()
    const startedAt = previewStartedAt(readStamp(), now)
    writeStamp(startedAt)
    const timer = window.setTimeout(() => setOpen(true), previewRemainingMs(startedAt, now))
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <Dialog open={open} onClose={() => {}} ariaLabelledBy={TITLE_ID} align="center" className="max-w-md">
      <div className="rounded-card border border-border bg-surface p-6 text-center sm:p-8">
        <h2 id={TITLE_ID} className="text-body-lg font-bold text-text">
          Keep reading with a free membership
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-body-sm leading-relaxed text-muted">
          Join free to see the whole Feed, meet the people near you, and find your Circle.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Link href={BETA_CTA_HREF} className={buttonClasses('primary', 'md', 'w-full')}>
            Join free
          </Link>
          <Link href="/sign-in?next=%2Ffeed" className={buttonClasses('secondary', 'md', 'w-full')}>
            Log in
          </Link>
          <Link href="/" className={buttonClasses('ghost', 'sm', 'w-full')}>
            Back to Home
          </Link>
        </div>
      </div>
    </Dialog>
  )
}
