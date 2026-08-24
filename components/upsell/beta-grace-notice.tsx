'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { GateNotice } from '@/components/ui/gate-notice'
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
// taking the yearly plan before then adds the Founding badge. (It used to say the invite also held
// a beta rate; ADR-1060 closed the beta pricing window on 2026-08-17 and lib/pricing/beta-notice.ts
// stopped writing that sentence, so this line was describing copy the module no longer produces.)
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
    // THROUGH THE KIT (PROG-DAWN2). This was a hand-rolled box that said exactly what
    // GateNotice's `preview` kind says: the capability is visible and free while billing
    // is off, and billing turns on later. It kept its own frame only because the kit had
    // nowhere to put a second paragraph, a CTA, or a dismiss control; all three are slots
    // now, so the notice composes and the product carries one gate vocabulary instead of two.
    // The wrapper keeps `role="note"` (a note beside the win, never a wall) and owns the
    // spacing, because spacing at a call site is the caller's job.
    <div role="note" className="mt-4">
      <GateNotice
        kind="preview"
        title={notice.title}
        onDismiss={onDismiss}
        action={
          <Link
            href={notice.href}
            className="inline-flex items-center gap-1.5 rounded-control border border-border px-3.5 py-2 text-body-sm font-semibold text-text transition-colors hover:bg-surface"
          >
            {notice.cta}
          </Link>
        }
      >
        {/* The three plain things, and the reason this could not compose before: the second
            and third are separate paragraphs, and a <p> cannot hold a <p>. */}
        <p className="leading-relaxed">{notice.body}</p>
        <p className="leading-relaxed">{notice.invite}</p>
      </GateNotice>
    </div>
  )
}
