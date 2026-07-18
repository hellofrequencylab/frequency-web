// BETA NOTICE COPY — the one rule that ties every beta-tied announcement to the beta switch.
//
// While the Beta is open (BETA_OPEN_ACCESS, lib/core/beta.ts) everyone is granted the paid Crew tier, so
// every "here is the permission / here is the price" notice on the site should lead with "the Beta is
// open, this is free right now" and frame the paid rule as what changes AT LAUNCH. When BETA_OPEN_ACCESS
// flips to false (launch day, target September 1) this module returns the LIVE (paid) copy instead, so a
// single switch swaps every notice that reads from here. No per-surface edit needed for the ones wired in.
//
// The FULL registry of beta announcements site-wide (including older hardcoded strings not yet routed
// through here) lives in docs/BETA-NOTICES.md — the launch checklist. New beta copy SHOULD read from this
// module so it is on the switch; when you add a beta notice, add it here and note it in that doc.
//
// PURE (a constant + string helpers), framework-independent, so it is safe on a server page or in an email
// builder and trivially testable. Voice per docs/CONTENT-VOICE: plain, warm, no em or en dashes.

import { BETA_OPEN_ACCESS } from './beta'

/** The date the Beta open-access window closes (copy only; the real switch is BETA_OPEN_ACCESS). Update
 *  here if the launch date moves, and the whole site's beta copy follows. */
export const BETA_ENDS_LABEL = 'September 1'

/** Is the Beta open-access window on? Re-exported so notice code depends on this module, not the raw flag. */
export const betaOpen = BETA_OPEN_ACCESS

/** The standard Beta lead line for a creation / upsell surface, or null once the Beta has closed (at which
 *  point the surface shows only its live permission + safety copy). One sentence, no em dashes. */
export function betaLeadLine(): string | null {
  return BETA_OPEN_ACCESS
    ? `Beta is open through ${BETA_ENDS_LABEL}. Right now everyone can build and publish everything, free. Here is what changes after.`
    : null
}

/** The recurring "upgrade to Crew" affordance suffix. During the Beta it reassures that Crew is free and
 *  one tap; after launch it states the plain upgrade. Centralized so the dozens of create/affordance
 *  strings that carry this phrase can read ONE source (see docs/BETA-NOTICES.md for the sites to migrate). */
export function crewUpgradeSuffix(): string {
  return BETA_OPEN_ACCESS ? 'Crew is free during the Beta, one tap, no card.' : 'Crew is a paid membership.'
}

/** The full "upgrade to Crew to create X" message, beta-aware. `what` is the noun phrase, e.g.
 *  "a practice" / "a Journey". */
export function crewCreateUpsell(what: string): string {
  return `Upgrade to Crew to create ${what}. ${crewUpgradeSuffix()}`
}

/** The promise that nothing a member builds is lost, per content kind. Skeptic-proof: names exactly what
 *  happens to extra content when a plan changes. Beta-independent (always true), but lives here so all the
 *  authoring surfaces share one wording. */
export function contentSafetyLine(kind: 'practice' | 'journey'): string {
  return kind === 'journey'
    ? 'Nothing you build is ever lost. Drafts save as you go, and if your plan changes your extra Journeys simply stay private drafts until you publish them. No content is deleted.'
    : 'Nothing you build is ever lost. Drafts save as you go and stay yours. No content is deleted.'
}
