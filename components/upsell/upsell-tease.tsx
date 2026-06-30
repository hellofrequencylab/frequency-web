'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Sparkles, X } from 'lucide-react'
import { shouldShowTease, teaseCapSpent, TEASE_DEFAULT_CAP } from '@/lib/pricing/upsell-tease'

// IN-CONTEXT UPSELL TEASE (Pricing ladder Phase E · ADR-466, docs/PRICING-LADDER-PLAN.md §4). A small,
// dismissible, plain-voice prompt shown AT A SUCCESS MOMENT — the instant a habit just paid off — with a
// single CTA to the upgrade that unlocks the next step. It is NOT a gate and NOT a modal: it never blocks
// the surface, it sits beside the win the member just had.
//
// THE GATE (the whole Phase E invariant, the pure predicate in lib/pricing/upsell-tease.ts):
//   it renders ONLY when billing is LIVE, the target capability is LOCKED for this account, and the
//   per-tease frequency cap has not been spent. While `billing_live` is OFF, `live` is false and this
//   renders NOTHING — no prompt that did not exist before the flip. The server resolves `live`
//   (billingLive()) and `locked` (the capability gate) and passes them in; this island only adds the
//   dismiss / cap state.
//
// PRESENTATION-NEUTRAL (ADR-018): the target, the copy, and the href are PROPS. This component never
// names a feature or writes a sentence — each wiring site supplies honest, concrete copy (CONTENT-VOICE
// §10: no guilt, no manufactured urgency, no em dashes, never narrate the reader's feelings).

const STORE_KEY = 'fq_upsell_tease_v1'

/** Read the per-tease seen-count meter from localStorage (best-effort; {} on any failure). */
function readSeen(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || '{}')
  } catch {
    return {}
  }
}

/** Record that a tease was seen / dismissed by bumping its count to at least the cap (best-effort). */
function markSeen(target: string, cap: number) {
  try {
    const m = readSeen()
    m[target] = Math.max(typeof m[target] === 'number' ? m[target] : 0, cap)
    localStorage.setItem(STORE_KEY, JSON.stringify(m))
  } catch {
    /* localStorage unavailable — the cap is best-effort, the gate still holds server-side */
  }
}

export interface UpsellTeaseProps {
  /** A STABLE key identifying this tease (the target capability), e.g. 'contacts-crm', 'qr-studio'.
   *  Drives the frequency cap so the same tease never nags. PRESENTATION-NEUTRAL: a key, not shown. */
  target: string
  /** Is billing ACTUALLY live? Resolved server-side via lib/pricing/settings.ts billingLive(). */
  live: boolean
  /** Is the target capability LOCKED for this account? Resolved server-side (the capability gate).
   *  When false, the member already has it, so there is nothing to upsell and this renders nothing. */
  locked: boolean
  /** The CTA destination — the Crew upgrade (`/upgrade`) or the Space add-on picker. */
  href: string
  /** The headline: name, plainly, what the upgrade unlocks. No guilt, no urgency. */
  title: string
  /** One concrete sentence on what they get. Optional. */
  body?: string
  /** The CTA label. Defaults to a plain "See what's included". */
  cta?: string
  /** How many times this tease may appear before it goes quiet. Default one gentle nudge. */
  cap?: number
}

/** A success-moment upsell tease. Renders nothing unless billing is live, the capability is locked, and
 *  the tease is under its frequency cap. Mount it INLINE where the win just happened. */
export function UpsellTease({
  target,
  live,
  locked,
  href,
  title,
  body,
  cta = "See what's included",
  cap = TEASE_DEFAULT_CAP,
}: UpsellTeaseProps) {
  // Start hidden; the cap is read on the client (localStorage) after mount, so the server render and the
  // first client render agree (no hydration mismatch, no layout shift on a tease that will not show).
  const [ready, setReady] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // Only consult the meter when the server-side gate would even allow a tease — keeps OFF a true no-op.
    if (!shouldShowTease({ billingLive: live, locked })) return
    const spent = teaseCapSpent(readSeen()[target], cap)
    // Count this appearance toward the cap so the next success moment stays quiet.
    if (!spent) markSeen(target, cap)
    // Defer the state flip out of the synchronous effect body (mirrors components/teaser-gate.tsx) so
    // it does not trigger a cascading render — and so the first paint matches the server (nothing shown).
    queueMicrotask(() => {
      setDismissed(spent)
      setReady(true)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The pure predicate is the single source of truth. `ready` keeps it client-only (post-cap-read).
  if (!ready) return null
  if (!shouldShowTease({ billingLive: live, locked, dismissed })) return null

  const onDismiss = () => {
    setDismissed(true)
    markSeen(target, cap)
  }

  return (
    <div
      role="note"
      className="relative mt-4 flex items-start gap-3 rounded-2xl border border-primary/30 bg-primary-bg/50 p-4"
    >
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
        <Sparkles className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-text">{title}</p>
        {body && <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>}
        <Link
          href={href}
          className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
        >
          {cta}
        </Link>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="-mr-1 -mt-1 rounded-lg p-1 text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  )
}
