'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Gem, X } from 'lucide-react'
import {
  afterBetaNoticeDismissed,
  afterBetaNoticeShown,
  betaNoticeQuiet,
  type BetaNotice,
} from '@/lib/pricing/beta-notice'

// THE BETA GRACE NOTICE (ADR-875) — the warm, NON-BLOCKING line that speaks where the lock tease
// sleeps. It appears at the same success moments <UpsellTease> already knows about (it renders from
// inside that component, so it inherits every existing placement and adds no new call sites), and it
// says three plain things: which tier's tools you are using, when memberships start, and that
// subscribing before then holds the beta rate and earns a Founding badge.
//
// IT BLOCKS NOTHING. There is no wall, no muted content, no modal, and no word claiming a lock. It is
// a `role="note"` beside the thing that just worked, and every capability behind it stays open.
//
// PRESENTATION-NEUTRAL (ADR-018): every sentence and the date arrive as props, resolved server-side
// from the operator's own `beta_grace` window (lib/pricing/beta-notice.ts). This component writes no
// copy and knows no date.
//
// THE QUIET METER: keyed per TIER (not per feature), so dismissing it at the Vault also silences it at
// Vera. It self-quiets after a few appearances and stays quiet for two weeks after a dismiss. The
// arithmetic is pure (lib/pricing/beta-notice.ts); this island only owns the localStorage read/write,
// exactly like the tease's frequency cap.

const STORE_KEY = 'fq_beta_notice_v1'

/** Read the per-tier meters from localStorage (best-effort; {} on any failure). */
function readMeters(): Record<string, unknown> {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || '{}')
  } catch {
    return {}
  }
}

/** Write one tier's meter back (best-effort; a full/blocked store is simply ignored). */
function writeMeter(key: string, value: unknown) {
  try {
    const m = readMeters()
    m[key] = value
    localStorage.setItem(STORE_KEY, JSON.stringify(m))
  } catch {
    /* localStorage unavailable — the meter is best-effort, and nothing here gates access */
  }
}

/** The beta grace notice. Renders nothing unless the server resolved one and this tier's notice is
 *  not currently quiet. Mount it where a success moment already lives. */
export function BetaGraceNotice({ notice }: { notice: BetaNotice }) {
  // Start hidden; the meter is read on the client after mount, so the server render and the first
  // client render agree (no hydration mismatch, no layout shift on a notice that will not show).
  const [ready, setReady] = useState(false)
  const [quiet, setQuiet] = useState(false)

  useEffect(() => {
    const now = Date.now()
    const stored = readMeters()[notice.key]
    const isQuiet = betaNoticeQuiet(stored, now)
    // Count this appearance so the notice goes quiet on its own after a few.
    if (!isQuiet) writeMeter(notice.key, afterBetaNoticeShown(stored, now))
    // Defer the state flip out of the synchronous effect body (mirrors <UpsellTease>) so the first
    // paint matches the server (nothing shown) and no cascading render is triggered.
    queueMicrotask(() => {
      setQuiet(isQuiet)
      setReady(true)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!ready || quiet) return null

  const onDismiss = () => {
    setQuiet(true)
    writeMeter(notice.key, afterBetaNoticeDismissed(Date.now()))
  }

  return (
    <div
      role="note"
      className="relative mt-4 flex items-start gap-3 rounded-2xl border border-border bg-surface-elevated p-4"
    >
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
        <Gem className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-body-sm font-semibold text-text">{notice.title}</p>
        <p className="mt-1 text-body-sm leading-relaxed text-muted">{notice.body}</p>
        <p className="mt-1 text-body-sm leading-relaxed text-muted">{notice.invite}</p>
        <Link
          href={notice.href}
          className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-body-sm font-semibold text-text transition-colors hover:bg-surface"
        >
          {notice.cta}
        </Link>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="-mr-1 -mt-1 rounded-lg p-1 text-subtle transition-colors hover:bg-surface hover:text-text"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  )
}
