import 'server-only'

// THE BETA STATE (ADR-875) — the ONE answer to "where does this account stand in the beta push".
//
// The beta founder push has four moving parts and they were about to be re-derived independently by
// every surface that cares: is the grace window still open, when does it end, is this member/Space
// already a founder, and is this one of the Spaces paying us off-Stripe (ADR-872). Three surfaces
// deriving that story three ways is how a member gets invited to buy something they already own.
// So it is derived ONCE, here, and every surface reads this.
//
// COMPOSES EXISTING READERS ONLY — it owns no new state:
//   • billingLive()            (lib/pricing/settings.ts)   is checkout real
//   • getBetaGrace + betaGraceActive / betaGraceEndsAtMs   is the window open, and when does it end
//   • getFoundingStatus        (lib/founding/status.ts)     do they already carry founding status
//   • activeAgreementForSpace  (lib/billing/manual-agreements.ts) do they already pay by cash/check
//
// WHY billingLive() AND NOT featureGatesLive(): this is a SELLING seam, not a gating seam. It decides
// what we SAY, never what anybody may DO — nothing here can grant or revoke a single capability. Per
// ADR-874 the honest selling surfaces (the pricing page, the upgrade CTAs, and now this notice) ride
// the charging switch and are open for business the whole window, while every capability wall rides
// featureGatesLive(). A source-shape test in gates-live.test.ts locks this file on the selling side.
//
// FAIL-QUIET: every read is wrapped so a DB hiccup produces "no invite" rather than an invite shown
// to a founder or a cash-paying Space. Missing an upsell is a marketing cost; selling a member
// something they already bought is a trust cost, and this repo pays the cheaper one.
//
// REQUEST-CACHED (react `cache`): a page with several tease mounts resolves the window once and each
// distinct subject once, so adding the notice adds no per-mount query.

import { cache } from 'react'
import { billingLive, getBetaGrace } from './settings'
import { betaGraceActive, betaGraceEndsAtMs } from './beta'
import { shouldShowBetaNotice } from './beta-notice'
import { getFoundingStatus } from '@/lib/founding/status'
import { activeAgreementForSpace } from '@/lib/billing/manual-agreements'

/** Where a member or a Space stands in the beta push. Plain data; safe to hand to a client island. */
export interface BetaState {
  /** Is the beta grace window still open? While it is, every capability stays granted (ADR-874). */
  graceActive: boolean
  /** The instant memberships start (ms epoch), or null when no window is configured. The ONE source
   *  every sentence formats its date from; nothing downstream may write a date literal. */
  graceEndsAtMs: number | null
  /** Is checkout actually sellable right now (billingLive)? An invite needs a real checkout behind it. */
  selling: boolean
  /** Does this member / Space already carry founding status (reserved or active)? */
  isFounding: boolean
  /** Does this Space have an ACTIVE off-Stripe billing agreement (ADR-872, the cash-paying Spaces)? */
  hasBillingAgreement: boolean
  /** May we show this subject the founder invite? graceActive AND selling AND not already founding
   *  AND not paying outside Stripe. (The per-capability "are they already on that tier" check stays
   *  with the caller, which is the only thing that knows which tier is in play.) */
  inviteOpen: boolean
}

/** Nothing to say. The fail-quiet default everywhere. */
const QUIET: BetaState = {
  graceActive: false,
  graceEndsAtMs: null,
  selling: false,
  isFounding: false,
  hasBillingAgreement: false,
  inviteOpen: false,
}

/** The SELLING WINDOW alone (no subject): is the grace window open, is checkout real, and when do
 *  memberships start. REQUEST-CACHED. FAIL-QUIET. */
export const betaWindow = cache(
  async (): Promise<{ graceActive: boolean; selling: boolean; graceEndsAtMs: number | null }> => {
    try {
      const grace = await getBetaGrace()
      return {
        graceActive: betaGraceActive(grace),
        selling: await billingLive(),
        graceEndsAtMs: betaGraceEndsAtMs(grace.until),
      }
    } catch {
      return { graceActive: false, selling: false, graceEndsAtMs: null }
    }
  },
)

/** Does this subject already carry founding status? REQUEST-CACHED per subject.
 *
 *  'reserved' counts. A reserved founder has already answered the founding call (the spot is held,
 *  ADR-599's no-charge invariant), so inviting them again would be noise. Only a 'lapsed' row falls
 *  out of the cohort and hears the invite again. getFoundingStatus is itself fail-safe to null, so a
 *  read error never fabricates founder status. */
const foundingFor = cache(async (profileId: string | null, spaceId: string | null): Promise<boolean> => {
  if (!profileId && !spaceId) return false
  const record = await getFoundingStatus({ profileId, spaceId })
  return !!record && record.status !== 'lapsed'
})

/** Does this Space pay us outside Stripe (an ACTIVE manual agreement, ADR-872)? REQUEST-CACHED. */
const agreementFor = cache(async (spaceId: string | null): Promise<boolean> => {
  if (!spaceId) return false
  return (await activeAgreementForSpace(spaceId)) !== null
})

/**
 * Where this member and/or Space stands in the beta push. Pass whichever subject the surface knows:
 * a `profileId` for a personal capability, a `spaceId` for a Space capability, or both. With no
 * subject at all it still answers the window questions (useful for an operator readout).
 *
 * FAIL-QUIET on any error: `inviteOpen` false, so a hiccup silences the invite rather than showing
 * it to somebody who already paid.
 */
export async function readBetaState(
  subject: { profileId?: string | null; spaceId?: string | null } = {},
): Promise<BetaState> {
  try {
    const profileId = subject.profileId ?? null
    const spaceId = subject.spaceId ?? null
    const [window, isFounding, hasBillingAgreement] = await Promise.all([
      betaWindow(),
      foundingFor(profileId, spaceId),
      agreementFor(spaceId),
    ])
    return {
      graceActive: window.graceActive,
      graceEndsAtMs: window.graceEndsAtMs,
      selling: window.selling,
      isFounding,
      hasBillingAgreement,
      inviteOpen: shouldShowBetaNotice({
        graceActive: window.graceActive,
        selling: window.selling,
        isFounding,
        hasBillingAgreement,
      }),
    }
  } catch {
    return QUIET
  }
}
