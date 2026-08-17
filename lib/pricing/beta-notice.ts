// THE BETA GRACE NOTICE (ADR-875) — the PURE tier-detection, visibility rule, and copy behind the
// warm, non-blocking notice a member sees while the beta grace window is open.
//
// THE OTHER HALF OF ADR-874. That decision put the LOCK teases to sleep during the grace window,
// because a tease that says "this is locked, upgrade to unlock it" is untrue while nothing is
// locked. But the detection it slept was doing real work: it knew, at a success moment, that this
// account had just reached for a capability that belongs to a tier above its plan. This module keeps
// that detection and changes only what it SAYS. During grace the same signal produces a notice that
// names the tier honestly, states when memberships start, and invites (never blocks):
//
//     "You are using Collective tools"
//     "Memberships start September 1. Everything stays open until then."
//     "Take the yearly plan before September 1 to add the Founding Business badge to your Space."
//
// THE INVITE NO LONGER MENTIONS A BETA RATE (ADR-1057). It used to read "to hold the beta rate and
// add the badge", which was true only while the beta pricing window was open. The owner closed that
// window on 2026-08-17 ("scratch the beta pricing and just charge full price"), and this notice keys
// off the SEPARATE feature-gate grace window (`beta_grace`, still ending September 1), so it kept
// rendering an offer the checkout would refuse. The badge half was always the real invitation and it
// is still true, so that is what is left.
//
// NOTHING IS PREVENTED. There is no lock, no wall, and no word here claiming one — a source-shape
// test asserts this file never says "locked" / "unlock" / "unavailable", so a later rewrite that
// reaches for gate language fails CI instead of shipping a lie.
//
// THE DATE IS NEVER HARDCODED. Every date string is formatted from the `beta_grace` window the
// operator owns (lib/pricing/beta.ts betaGraceEndsAtMs), so moving that one setting moves every
// sentence. A source-shape test asserts the month name appears nowhere in this file.
//
// TIER DETECTION IS DERIVED, NEVER HAND-MAPPED. A feature's tier is read off its REAL merged gate
// (lib/pricing/gates.ts), a tier floor is itself the tier, and a Space entitlement key resolves to
// the LOWEST plan whose depth set grants it (lib/pricing/plans.ts planEntitlementKeys). There is no
// feature -> tier table here to drift out of step with the gates that actually bite on Sept 1.
//
// PURE + framework-free + client-safe (no Supabase/Next/React), like the rest of lib/pricing/*: the
// server seam (lib/pricing/beta-state.ts) resolves the IO and hands the result in.

import type { FeatureGate, GateAxis } from './gates'
import { planEntitlementKeys, SPACE_PLANS, type SpacePlan } from './plans'
import { tierLabelOnAxis, tierRankOnAxis } from './feature-tiers'

// ── The target: which tier a capability belongs to ────────────────────────────────────────────

/** The tier a capability sits on: the ladder (`tier` = membership, `plan` = Space) and the label on
 *  it. This is what the notice NAMES, and what it keys its dismissal on. */
export interface BetaNoticeTarget {
  axis: GateAxis
  /** The entitlement label on that axis, e.g. 'crew' | 'business' | 'collective'. */
  tier: string
}

/** The DISMISSAL key: per TIER, never per feature. A member who dismisses the Crew notice at the
 *  Vault should not meet the same sentence again at Vera, so every Crew capability shares one key
 *  and a member sees at most a couple of these in total. PURE. */
export function betaNoticeKey(target: BetaNoticeTarget): string {
  return `${target.axis}:${target.tier}`
}

/** The tier a FEATURE belongs to, read off its REAL merged gate (code map + operator overrides).
 *  Returns null when there is no gate, the gate is disabled (it never binds, so nobody is "using"
 *  a paid tier through it), or the gate's floor is the free tier (nothing above free is in play).
 *  PURE — hand it the gate mergeGate() already produced. */
export function targetForGate(gate: FeatureGate | null | undefined): BetaNoticeTarget | null {
  if (!gate || !gate.enabled) return null
  const tier = String(gate.minEntitlement)
  if (tierRankOnAxis(gate.axis, tier) <= 0) return null
  return { axis: gate.axis, tier }
}

/** The tier a plain membership-tier FLOOR belongs to (the Crew authoring capabilities that gate on
 *  the tier directly, with no named feature-gate row). The floor IS the tier. Null for the free
 *  floor. PURE. */
export function targetForTier(minTier: string): BetaNoticeTarget | null {
  if (tierRankOnAxis('tier', minTier) <= 0) return null
  return { axis: 'tier', tier: minTier }
}

/** The tier a SPACE ENTITLEMENT KEY belongs to: the LOWEST paid plan whose depth set grants it,
 *  derived from the plan -> entitlement-keys map (lib/pricing/plans.ts) that the billing resolver
 *  itself writes. Deriving it means the notice can never name a tier the plan ladder disagrees with.
 *  Null when NO plan grants the key (an add-on-only key, or an unknown one). PURE.
 *
 *  SPACE_PLANS is ordered by capability rank, so the first plan that grants the key IS the lowest. */
export function targetForEntitlementKey(key: string): BetaNoticeTarget | null {
  const wanted = (key ?? '').trim()
  if (!wanted) return null
  for (const plan of SPACE_PLANS) {
    if (tierRankOnAxis('plan', plan) <= 0) continue // skip the free floor
    if (planEntitlementKeys(plan as SpacePlan).includes(wanted)) return { axis: 'plan', tier: plan }
  }
  return null
}

// ── The visibility rule ───────────────────────────────────────────────────────────────────────

/** Everything the decision needs, all resolved by the caller. */
export interface BetaNoticeVisibility {
  /** Is the beta grace window still open? (lib/pricing/beta.ts betaGraceActive) */
  graceActive: boolean
  /** Is checkout actually sellable? (billingLive) An invite to subscribe needs a real checkout. */
  selling: boolean
  /** Is this account ALREADY on the target tier or above? Then it is not "using" a tier above its
   *  plan and there is nothing to say. Default false. */
  alreadyEntitled?: boolean
  /** Does this member / Space already carry founding status? They answered the call already. */
  isFounding?: boolean
  /** Does this Space have an ACTIVE off-Stripe billing agreement (ADR-872)? They already paid. */
  hasBillingAgreement?: boolean
}

/**
 * May the beta grace notice show? TRUE only inside an OPEN grace window, with checkout really
 * sellable, for an account that is below the tier it just reached for, is not already founding, and
 * is not paying us outside Stripe. PURE — the whole rule in one predicate, so every suppression is
 * directly unit-tested. FAIL-QUIET: any missing input reads as not-shown.
 */
export function shouldShowBetaNotice(v: BetaNoticeVisibility): boolean {
  if (!v.graceActive) return false // the ladder is biting (or never had a window): the tease speaks, not this
  if (!v.selling) return false // no live checkout to invite anyone into
  if (v.alreadyEntitled) return false // they are on that tier already
  if (v.isFounding) return false // already a founder: never sell them what they hold
  if (v.hasBillingAgreement) return false // paying by cash/check (ADR-872): never invite them to buy again
  return true
}

// ── The copy ──────────────────────────────────────────────────────────────────────────────────
// CONTENT-VOICE: plain sentences, proper nouns carry the weight, no em dashes, no manufactured
// urgency, and never a claim that something is prevented (because nothing is).

/** Where the invite points. The pricing page is the honest selling surface (ADR-874). */
export const BETA_NOTICE_HREF = '/pricing'

/** The CTA label. Plain, no urgency. */
export const BETA_NOTICE_CTA = 'See the plans'

/** The rendered notice: everything the client island needs, resolved server-side. Plain data. */
export interface BetaNotice {
  /** The per-TIER dismissal key. */
  key: string
  /** "You are using Collective tools" */
  title: string
  /** When memberships start, and that nothing changes before then. */
  body: string
  /** The invitation: back the year early, earn the Founding badge. (No rate claim: the beta pricing
   *  window is closed, ADR-1057.) */
  invite: string
  cta: string
  href: string
}

/** The date memberships start, formatted from the grace window (never a literal). UTC, because the
 *  window boundary is UTC (ADR-874). Null when no window is configured or it does not parse. PURE. */
export function betaStartLabel(endsAtMs: number | null | undefined): string | null {
  if (typeof endsAtMs !== 'number' || !Number.isFinite(endsAtMs)) return null
  return new Date(endsAtMs).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

/** Build the notice for a target tier and the grace window's end. Null when the window has no
 *  readable date (there is nothing honest to say without one). PURE.
 *
 *  The badge line differs by axis because the badges do: a Space earns the Founding Business mark
 *  (ADR-873), a member earns the Founder mark on their profile. Both already exist; this only
 *  names them.
 *
 *  THE INVITE NAMES THE YEARLY PLAN, not "subscribe" (ADR-880). The badge is earned by backing the
 *  year, early, with money that actually moved: a monthly subscriber does not become a founder, and a
 *  trial that never charges earns nothing. The copy has to say the same thing the code grants on, and
 *  since ADR-1057 it says nothing about a rate, because there is no longer a beta rate to hold. */
export function betaNoticeCopy(
  target: BetaNoticeTarget,
  graceEndsAtMs: number | null | undefined,
): BetaNotice | null {
  const when = betaStartLabel(graceEndsAtMs)
  if (!when) return null
  const label = tierLabelOnAxis(target.axis, target.tier)
  const badge =
    target.axis === 'plan'
      ? 'add the Founding Business badge to your Space'
      : 'add the Founder badge to your profile'
  return {
    key: betaNoticeKey(target),
    title: `You are using ${label} tools`,
    body: `Memberships start ${when}. Everything stays open until then.`,
    invite: `Take the yearly plan before ${when} to ${badge}.`,
    cta: BETA_NOTICE_CTA,
    href: BETA_NOTICE_HREF,
  }
}

// ── The quiet meter (a notice that never nags) ────────────────────────────────────────────────
// Keyed per TIER (betaNoticeKey), so a member meets at most a couple of these. The arithmetic is
// pure here; the client island owns the localStorage read/write, exactly like the tease's cap.

/** How many times one tier's notice may appear before it goes quiet on its own. */
export const BETA_NOTICE_CAP = 3

/** How long a dismissed (or capped-out) notice stays quiet: two weeks. Long enough not to nag,
 *  short enough that somebody who dismissed it in July still hears about the date in August. */
export const BETA_NOTICE_QUIET_MS = 14 * 24 * 60 * 60 * 1000

/** The per-tier meter the island stores: how many times it has been shown, and the instant it is
 *  allowed to speak again. */
export interface BetaNoticeMeter {
  seen: number
  until: number
}

/** Read a stored meter defensively (garbage from localStorage reads as a fresh meter). PURE. */
export function asBetaNoticeMeter(raw: unknown): BetaNoticeMeter {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { seen: 0, until: 0 }
  const r = raw as { seen?: unknown; until?: unknown }
  const seen = typeof r.seen === 'number' && r.seen > 0 ? Math.floor(r.seen) : 0
  const until = typeof r.until === 'number' && r.until > 0 ? Math.floor(r.until) : 0
  return { seen, until }
}

/** Is this tier's notice currently QUIET (dismissed, or capped out, and still inside its window)?
 *  PURE. */
export function betaNoticeQuiet(raw: unknown, nowMs: number): boolean {
  return asBetaNoticeMeter(raw).until > nowMs
}

/** The meter after the notice is SHOWN once: count the appearance, and go quiet once the cap is
 *  spent. PURE. */
export function afterBetaNoticeShown(
  raw: unknown,
  nowMs: number,
  cap: number = BETA_NOTICE_CAP,
  quietMs: number = BETA_NOTICE_QUIET_MS,
): BetaNoticeMeter {
  const prev = asBetaNoticeMeter(raw)
  const seen = prev.seen + 1
  return { seen, until: seen >= cap ? nowMs + quietMs : prev.until }
}

/** The meter after the member DISMISSES it: quiet for the full window, immediately. PURE. */
export function afterBetaNoticeDismissed(
  nowMs: number,
  cap: number = BETA_NOTICE_CAP,
  quietMs: number = BETA_NOTICE_QUIET_MS,
): BetaNoticeMeter {
  return { seen: cap, until: nowMs + quietMs }
}
