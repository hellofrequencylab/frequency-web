// Beta sequences — audience-targeted variants of the induction (ADR-068 vibe).
// Each "sequence" is a splash + the induction's voiced copy, tuned to WHO is
// arriving, plus a marketing tag stamped on the member so cohorts are segmentable
// forever. The induction template already accepts a `copy` override; a sequence
// just feeds it. TEMPORARY (deleted at launch) like the rest of beta-script.
//
// The three hardcoded templates (early-adopter / personal / founding-partner) are
// retired: sequences are now authored in the DB (sequence_overrides) through the
// /pages/sequences builder, so BETA_SEQUENCES ships empty. What remains in code is
// the BASE flow — Vera's scripted copy from beta-script — published under the
// reserved slug `beta-default`. /onboarding/beta with no ?seq runs it, and the
// owner edits its copy at /pages/splash (saved as the `beta-default` override).
//
// Client-safe (no server imports). The DB layer + merging live in
// lib/onboarding/sequence-overrides.ts and lib/onboarding/resolve-sequence.ts.

import { VERA, BETA_OATHS, HEARD_ABOUT, type OathId, type VeraCopy } from '@/lib/onboarding/beta-script'

export interface SequenceSplash {
  /** Small kicker above the headline. */
  eyebrow: string
  headline: string
  body: string
  /** Primary CTA into the induction. */
  cta: string
  /** Full-bleed hero image behind the splash (public/ path). */
  image: string
  imageAlt: string
  /** A short interstitial line under the hero — wrap the accent word in *asterisks*. */
  statement: string
}

export interface BetaSequence {
  slug: string
  /** Human label for the audience (admin + analytics). */
  audience: string
  /** Tag stamped on members who arrive via this sequence — segment them forever. */
  marketingTag: string
  /** The public splash page copy. */
  splash: SequenceSplash
  /** The induction's voiced copy (Vera's HOT register). */
  vera: VeraCopy
  oaths: { id: OathId; label: string }[]
  heardAbout: string[]
}

/** Reserved slug for the base VERA flow — what /onboarding/beta runs with no ?seq.
 *  Not a "version" (it never appears in the versions list); its DB override is the
 *  owner's edits from the /pages/splash editor. */
export const DEFAULT_SEQUENCE = 'beta-default'

// The base flow: Vera's scripted copy verbatim. The splash block seeds brand-new
// versions cloned in the builder (the default flow itself has no public splash
// page — visitors enter at /onboarding/beta). The marketing tag stays
// `beta_early_adopter` so the default cohort remains ONE segment across the
// rename (it's the registered trait every default-flow member already carries).
const BASE_SEQUENCE: BetaSequence = {
  slug: DEFAULT_SEQUENCE,
  audience: 'Every new member (default)',
  marketingTag: 'beta_early_adopter',
  splash: {
    eyebrow: 'Real community, near you',
    headline: "You're not a user. You're a member.",
    body: 'A place to turn the people near you into real community. Find your Circle, show up in person, and meet the people who live a few streets over.',
    cta: 'Come in',
    image: '/images/site/22a51611-07f6-4c39-8a26-1c996295b6d3.jpg',
    imageAlt: 'A Frequency community dancing together outdoors at golden hour, arms raised',
    statement: 'Close the laptop. Show up in *person*.',
  },
  vera: VERA,
  oaths: BETA_OATHS,
  heardAbout: [...HEARD_ABOUT],
}

// The SPLASH prompts for a brand-new funnel. VERA (induction beats) + BETA_OATHS already
// ship as fill-in prompts; the base flow's SPLASH, though, is the real live copy, so a
// funnel cloned from it would inherit finished copy. This gives the public splash the same
// fill-in guidance, so a fresh funnel reads as a prompts TEMPLATE end to end. Kept SEPARATE
// from BASE_SEQUENCE so seeding a new funnel never reads or mutates the live default flow
// (funnel #1). Plain, no em dashes.
const TEMPLATE_SPLASH_PROMPTS: SequenceSplash = {
  eyebrow: 'Write the kicker above the headline',
  headline: 'Write the headline this audience sees first',
  body: 'Write the short paragraph that says what Frequency is for them',
  cta: 'Write the button label that starts the induction',
  image: '',
  imageAlt: '',
  statement: 'Write the one-line statement (wrap the accent word in *asterisks*)',
}

/** The prompts TEMPLATE a brand-new funnel is seeded from: the SAME structure as the live
 *  default flow (every beat, every oath, the splash) but with fill-in prompts for every
 *  content field, so the operator opens the editor to guidance they replace. Built from the
 *  code prompt copy, NOT from the `beta-default` DB override, so creating a funnel can never
 *  touch or depend on the current live flow (funnel #1). Returns a fresh object each call. */
export function templateSeed(): {
  splash: SequenceSplash
  vera: VeraCopy
  oaths: { id: OathId; label: string }[]
  heardAbout: string[]
} {
  return {
    splash: { ...TEMPLATE_SPLASH_PROMPTS },
    vera: VERA,
    oaths: BETA_OATHS.map((o) => ({ ...o })),
    heardAbout: [...HEARD_ABOUT],
  }
}

/** Code-shipped sequences. Empty since the three launch templates retired — every
 *  audience sequence is now a DB version (sequence_overrides) built in the wizard.
 *  The record stays so a code sequence can be reintroduced without touching callers. */
export const BETA_SEQUENCES: Record<string, BetaSequence> = {}

/** Resolve a CODE sequence by slug, falling back to the base VERA flow. DB overrides
 *  are merged elsewhere (resolve-sequence.ts) — this stays client-safe. */
export function getSequence(slug: string | null | undefined): BetaSequence {
  return (slug && BETA_SEQUENCES[slug]) || BASE_SEQUENCE
}

export function listSequences(): BetaSequence[] {
  return Object.values(BETA_SEQUENCES)
}
