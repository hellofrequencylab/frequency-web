import 'server-only'

// THE BETA FOUNDER GRANT (ADR-875) — anybody who subscribes BEFORE memberships start becomes a
// founder, automatically, at the reconciliation point.
//
// The founder's ask: "inspire people to pay before the first to help us build the dream and get a
// founder's badge on their profile." The badge machinery already exists on both sides (ADR-873):
// `founding_members` + `profiles.is_founding_member` render the member Founder chip and the Founding
// Business chip. What was missing was the hook that fires when somebody actually buys.
//
// WHY AT RECONCILIATION, NOT AT THE SUCCESS PAGE. The client success page is a redirect a browser may
// never follow: a member who closes the tab, pays on a phone that goes to sleep, or completes a
// subscription Stripe activates asynchronously would silently miss their badge. The webhook is the
// truth. This mirrors the placement discipline lib/billing/founders.ts (retired) already set for the Founders
// Round one-time grant: ONE grant function, reached from the signature-verified webhook, idempotent
// enough that a Stripe retry or a duplicate event is a harmless no-op.
//
// THE CUTOFF IS THE SUBSCRIPTION'S OWN CREATION INSTANT, not the event's. A renewal in October fires
// another `customer.subscription.updated`, and reading the EVENT time there would decide "after the
// cutoff" for a founder who subscribed in August and re-run the boundary test on every renewal for
// the rest of their life. `subscription.created` is fixed the moment they bought, so the answer is
// the same on the first event and the thousandth: replay-safe by construction.
//
// FAIL-QUIET: a founding grant is a badge, not a payment. It must NEVER throw into the webhook — a
// failed badge write must not make Stripe retry (or worse, bounce) a settled subscription. Every
// failure returns a reason and is logged.

import { getBetaGrace } from '@/lib/pricing/settings'
import { betaGraceEndsAtMs } from '@/lib/pricing/beta'
import { grantFoundingStatus, type FoundingKind } from '@/lib/founding/status'
import { isError } from '@/lib/action-result'

/** Why a grant did or did not happen. Returned rather than thrown, so the webhook never fails on it. */
export type BetaFoundingReason =
  | 'granted'
  | 'after_cutoff'
  | 'no_window'
  | 'no_subject'
  | 'error'

export interface BetaFoundingResult {
  granted: boolean
  reason: BetaFoundingReason
}

/**
 * Did a purchase that completed at `atMs` earn founding status? PURE.
 *
 * TRUE only strictly BEFORE the grace window ends. Same boundary convention as the rest of the beta
 * (ADR-874): `until: '2026-09-01'` means the last founding day is Aug 31 and a purchase at
 * 2026-09-01T00:00:00.000Z UTC is already past it.
 *
 * With NO window configured there is no founding cohort to join, so this is false. Note the fail-safe
 * direction is the OPPOSITE of the grace gate's: `betaGraceActive` fails toward GRANTING features
 * (never lock a member out), while this fails toward NOT granting a permanent badge and a
 * grandfathered rate on the strength of an unreadable date. Withholding a badge is recoverable by a
 * one-line operator grant; a wrongly-granted lifetime rate is not.
 */
export function earnsBetaFounding(atMs: number, graceEndsAtMs: number | null): boolean {
  if (graceEndsAtMs === null || !Number.isFinite(graceEndsAtMs)) return false
  if (!Number.isFinite(atMs)) return false
  return atMs < graceEndsAtMs
}

/**
 * Grant founding status for a purchase, if it landed before memberships start.
 *
 *   • kind 'member'   → the member Founder chip (grantFoundingStatus also sets
 *                       profiles.is_founding_member, which is what the profile badge reads).
 *   • kind 'business' → the Founding Business chip on the Space (ADR-873).
 *
 * IDEMPOTENT: grantFoundingStatus no-ops on an already-active row, so the `.created` and `.updated`
 * events for the same subscription, a Stripe retry, and every future renewal all land on the same
 * state. `lockedRateCents` records what they actually paid on a NEW row (an existing row's locked
 * rate is never overwritten), so the grandfather promise is stored on the founder's own record.
 *
 * NEVER THROWS. Returns why nothing happened instead.
 */
export async function grantBetaFounding(input: {
  kind: FoundingKind
  profileId?: string | null
  spaceId?: string | null
  /** When the purchase completed, ms epoch. Use the SUBSCRIPTION's creation instant (see above). */
  atMs: number
  /** The amount actually charged, in cents, when the caller knows it. Locked onto a new row. */
  lockedRateCents?: number | null
}): Promise<BetaFoundingResult> {
  const profileId = input.profileId ?? null
  const spaceId = input.spaceId ?? null
  if (!profileId && !spaceId) return { granted: false, reason: 'no_subject' }
  try {
    const endsAtMs = betaGraceEndsAtMs((await getBetaGrace()).until)
    if (endsAtMs === null) return { granted: false, reason: 'no_window' }
    if (!earnsBetaFounding(input.atMs, endsAtMs)) return { granted: false, reason: 'after_cutoff' }
    const result = await grantFoundingStatus({
      profileId,
      spaceId,
      kind: input.kind,
      lockedRateCents: input.lockedRateCents ?? null,
    })
    if (isError(result)) return { granted: false, reason: 'error' }
    return { granted: true, reason: 'granted' }
  } catch (err) {
    console.error('[beta-founding] grant failed:', err)
    return { granted: false, reason: 'error' }
  }
}
