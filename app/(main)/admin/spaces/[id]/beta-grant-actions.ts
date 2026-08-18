'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin/guard'
import { logAdminAction } from '@/lib/admin/audit'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { setSpaceBetaPriceGrant, readSpaceBetaPriceGrant } from '@/lib/billing/space-beta-grant'

// THE PRIVATE BETA PRICE GRANT — the staff write (ADR-1061), behind the "Beta price grant" section
// on /admin/spaces/[id]. The owner closed the beta window (ADR-1060) but had already offered the
// beta rate to a couple of people; this is where that promise gets recorded so the checkout can
// honour it without any of it reaching the public pricing page.
//
// JANITOR-GATED, and that is not a formality: this action decides whether a Space pays $49 or $79.
// It is the platform-operator axis on purpose — a Space OWNER must never be able to reach it, or the
// grant is a self-serve discount. Nothing in /spaces/[slug]/settings calls this.
//
// Every flip is AUDITED (`space.beta_price_grant`), because the two stamp columns record only the
// grant currently in force; admin_audit_log is the append-only history of how it got there.
//
// The write goes through lib/billing/space-beta-grant.ts, which reports a missing column
// (Postgres 42703, the migration not yet applied) as a real, readable failure rather than a silent
// no-op. No em dashes (operator copy, CONTENT-VOICE).

const ADMIN_PATH = '/admin/spaces'

/**
 * Grant or revoke the private beta rate for a Space (staff). Returns ActionResult; the panel renders
 * the error verbatim, including the "apply the proposal migration first" instruction.
 *
 * REVOKING NEVER RAISES A LIVE SUBSCRIPTION. Once the Space has checked out, its locked price id
 * re-bills the founding price for the life of the subscription and this flag is not consulted again
 * (lib/pricing/beta.ts `loadoutChargeArm` checks the lock first). Revoke only affects a Space that
 * has not yet subscribed.
 */
export async function setBetaPriceGrantAction(spaceId: string, granted: boolean): Promise<ActionResult> {
  const { profileId } = await requireAdmin('janitor')
  if (!spaceId) return fail('We could not find that space.')

  // Read first, so the audit entry records the transition rather than just the new value, and so a
  // no-op flip is visible as one. A read we could not make does not block the write (the write does
  // its own error reporting); it just leaves `from` unknown in the ledger.
  const before = await readSpaceBetaPriceGrant(spaceId)
  const from = before.kind === 'ok' ? before.grant.granted : null

  const result = await setSpaceBetaPriceGrant(spaceId, granted, profileId)
  if (!result.ok) return fail(result.error)

  await logAdminAction({
    actorId: profileId,
    action: 'space.beta_price_grant',
    targetType: 'space',
    targetId: spaceId,
    detail: { from, to: granted },
  })
  revalidatePath(`${ADMIN_PATH}/${spaceId}`)
  revalidatePath(ADMIN_PATH)
  return ok()
}
