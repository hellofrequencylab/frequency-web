// IN-CONTEXT UPSELL TEASE — the PURE visibility predicate (Pricing ladder Phase E · ADR-466,
// docs/PRICING-LADDER-PLAN.md §4 "In-context upsell teases"). The single rule deciding whether a
// success-moment tease may show. Kept here, framework-free and IO-free, so it unit-tests on its own
// and the component (components/upsell/upsell-tease.tsx) is a thin client island around it.
//
// THE INVARIANT (mirrors every other Phase A-D gate): nothing new appears while billing is OFF. A
// tease shows ONLY when ALL hold:
//   1. billing is actually LIVE (billingLive() — the Stripe env keys AND the master switch),
//   2. the target capability is LOCKED for this account (an unlocked account already has it — no
//      reason to upsell), and
//   3. the optional frequency cap has NOT been spent (so a tease never nags on every success).
// While billing is OFF, condition 1 is false, so the tease renders nothing. There is no path that
// surfaces a prompt that did not exist before the flip.
//
// PRESENTATION-NEUTRAL (ADR-018): this module decides ONLY visibility. The target, copy, and href
// are the component's props; this file never names a feature or writes a sentence.

/** What the server resolves and hands the <UpsellTease> island: is billing live, and is the target
 *  capability locked for this account. Client-safe (no server-only deps), so a client component can
 *  carry it as a prop. The server resolvers in lib/pricing/tease-gate.ts produce it. */
export interface TeaseGate {
  live: boolean
  locked: boolean
}

/** The inputs the visibility rule needs. All resolved by the caller (the server resolves `billingLive`
 *  + `locked`; the client island resolves `dismissed` from per-tease local state). PURE. */
export interface TeaseVisibilityInput {
  /** Is billing ACTUALLY live? (lib/pricing/settings.ts billingLive()). The master gate. */
  billingLive: boolean
  /** Is the target capability LOCKED for this account? (false = they already have it → no upsell). */
  locked: boolean
  /** Has the member dismissed this tease (or spent its frequency cap)? Default false. */
  dismissed?: boolean
}

/**
 * May this success-moment tease show? TRUE only when billing is live AND the capability is locked AND
 * the tease has not been dismissed / capped. PURE — the whole Phase E gate in one predicate, so the
 * "shows only when ON + locked + under cap" contract is directly unit-tested. FAIL-CLOSED: any missing
 * input reads as not-shown (e.g. an undefined `dismissed` defaults to false, but a falsy `billingLive`
 * or `locked` hides it).
 */
export function shouldShowTease(input: TeaseVisibilityInput): boolean {
  if (!input.billingLive) return false // OFF = nothing new ever shows
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
