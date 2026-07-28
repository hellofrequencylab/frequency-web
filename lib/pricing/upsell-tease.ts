// IN-CONTEXT UPSELL TEASE — the PURE visibility predicate (Pricing ladder Phase E · ADR-466,
// docs/PRICING-LADDER-PLAN.md §4 "In-context upsell teases"). The single rule deciding whether a
// success-moment tease may show. Kept here, framework-free and IO-free, so it unit-tests on its own
// and the component (components/upsell/upsell-tease.tsx) is a thin client island around it.
//
// THE INVARIANT (mirrors every other Phase A-D gate): nothing new appears until the paid feature GATES
// are live. A tease shows ONLY when ALL hold:
//   1. the feature gates are actually LIVE (featureGatesLive() — billing on AND the beta grace window
//      ended, ADR-874; a tease claims a lock, so it must not fire while nothing is locked),
//   2. the target capability is LOCKED for this account (an unlocked account already has it — no
//      reason to upsell), and
//   3. the optional frequency cap has NOT been spent (so a tease never nags on every success).
// While the gates are not live, condition 1 is false, so the tease renders nothing. There is no path
// that surfaces a prompt that did not exist before the flip.
//
// PRESENTATION-NEUTRAL (ADR-018): this module decides ONLY visibility. The target, copy, and href
// are the component's props; this file never names a feature or writes a sentence.

import type { BetaNotice } from './beta-notice'

/** What the server resolves and hands the <UpsellTease> island: are the gates live, is the target
 *  capability locked for this account, and (ADR-875) the beta grace NOTICE that speaks in the tease's
 *  place while the gates are still soft. Client-safe (no server-only deps), so a client component can
 *  carry it as a prop. The server resolvers in lib/pricing/tease-gate.ts produce it.
 *
 *  `live` and `notice` are mutually exclusive by construction: `live` means the gates bite (so the
 *  tease is the true thing to say) and `notice` means the beta grace window is still open (so the
 *  warm, non-blocking line is). Neither set = this surface says nothing. */
export interface TeaseGate {
  live: boolean
  locked: boolean
  /** The beta grace notice, or null. Present ONLY while the gates are not live (ADR-875). */
  notice?: BetaNotice | null
}

/** The inputs the visibility rule needs. All resolved by the caller (the server resolves `gatesLive`
 *  + `locked`; the client island resolves `dismissed` from per-tease local state). PURE. */
export interface TeaseVisibilityInput {
  /** Are the paid feature GATES live? (lib/pricing/settings.ts featureGatesLive()). The master gate.
   *  Deliberately not billingLive(): during the beta grace window billing sells but nothing is locked,
   *  and a tease that claims a lock in that window is untrue (ADR-874). */
  gatesLive: boolean
  /** Is the target capability LOCKED for this account? (false = they already have it → no upsell). */
  locked: boolean
  /** Has the member dismissed this tease (or spent its frequency cap)? Default false. */
  dismissed?: boolean
}

/**
 * May this success-moment tease show? TRUE only when the gates are live AND the capability is locked
 * AND the tease has not been dismissed / capped. PURE — the whole Phase E gate in one predicate, so the
 * "shows only when ON + locked + under cap" contract is directly unit-tested. FAIL-CLOSED: any missing
 * input reads as not-shown (e.g. an undefined `dismissed` defaults to false, but a falsy `gatesLive`
 * or `locked` hides it).
 */
export function shouldShowTease(input: TeaseVisibilityInput): boolean {
  if (!input.gatesLive) return false // not live = nothing new ever shows
  if (!input.locked) return false // they already have it — never upsell an unlocked capability
  if (input.dismissed) return false // dismissed / cap spent — never nag
  return true
}

// ── Frequency cap (the "under cap" half) — a PURE, best-effort local-storage meter ───────────────
// The tease must never nag: once a member has seen a given tease enough times (or dismissed it), it
// stays quiet. This mirrors components/teaser-gate.tsx's localStorage meter shape, kept pure here so
// the count math is testable without a DOM. The store itself (read/write) lives in the client island;
// these helpers do the arithmetic.

/** How many times the SAME tease may appear before it goes quiet, by default. One gentle nudge. */
export const TEASE_DEFAULT_CAP = 1

/** Has a tease been shown at least `cap` times already (so it should stay quiet now)? PURE. A
 *  non-positive cap means "no cap" (always under). A negative/garbage seen count reads as 0. */
export function teaseCapSpent(seenCount: number | null | undefined, cap: number = TEASE_DEFAULT_CAP): boolean {
  if (cap <= 0) return false
  const seen = typeof seenCount === 'number' && seenCount > 0 ? Math.floor(seenCount) : 0
  return seen >= cap
}
