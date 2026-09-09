// THE IO HALF of the one Connect onboarding prompt (LIVE-233). Server-only.
//
// The decision + every word live in ./payout-prompt.ts, which is PURE and import-free so a client
// component can hold the same sentence. This file does the two reads that decision needs (the
// platform payouts switch and the payee's mirrored Stripe flags) and nothing else, so a surface asks
// one question and gets the answer the other four surfaces would have got.
//
// TWO SHAPES, because the payee differs by path and getting it wrong points an operator at the wrong
// Stripe account:
//   · a PROFILE payee (a maker's Market listing, a personal event's tickets) -> the caller is usually
//     the payee, and `self` copy is right.
//   · a SPACE payee (memberships, bookings, orders, donations, a space-hosted event's tickets) -> the
//     payee is the space OWNER (ADR-819), who may not be the admin reading the page. An editor who
//     cannot onboard is told who can, rather than shown a button that would onboard the wrong person.

import { createAdminClient } from '@/lib/supabase/admin'
import { getConnectStatus, payoutsLive } from './connect'
import {
  payoutPrompt,
  type PayoutChannel,
  type PayoutPrompt,
  type PayoutPromptRelation,
} from './payout-prompt'

/** Resolve the prompt for a PROFILE payee. Returns null when there is nothing to say (the payee is
 *  ready and payouts are live). Never throws: getConnectStatus already degrades to an empty status
 *  on a failed read, and an empty status prompts for setup, which is the safe direction here. */
export async function resolveProfilePayoutPrompt(opts: {
  payeeProfileId: string | null
  viewerProfileId: string | null
  channels: readonly PayoutChannel[]
  payeeName?: string | null
}): Promise<PayoutPrompt | null> {
  const live = await payoutsLive()
  const relation: PayoutPromptRelation =
    opts.viewerProfileId && opts.payeeProfileId && opts.viewerProfileId === opts.payeeProfileId
      ? 'self'
      : 'other'
  // No resolvable payee: there is no account to read, so the prompt is the setup step. `other`
  // relation without a name renders "The owner", which is the honest thing to say when we do not
  // know who gets paid.
  const status = opts.payeeProfileId ? await getConnectStatus(opts.payeeProfileId) : null
  return payoutPrompt({
    channels: opts.channels,
    status,
    payoutsLive: live,
    relation,
    payeeName: opts.payeeName ?? null,
  })
}

/** Resolve the prompt for a SPACE payee: the space OWNER is who Stripe pays (ADR-819), so the owner
 *  profile is the account read and an admin/editor viewer gets the `other` copy naming the space. */
export async function resolveSpacePayoutPrompt(opts: {
  space: { ownerProfileId?: string | null; owner_profile_id?: string | null; name?: string | null; brandName?: string | null }
  viewerProfileId: string | null
  channels: readonly PayoutChannel[]
}): Promise<PayoutPrompt | null> {
  const ownerId = opts.space.ownerProfileId ?? opts.space.owner_profile_id ?? null
  return resolveProfilePayoutPrompt({
    payeeProfileId: ownerId,
    viewerProfileId: opts.viewerProfileId,
    channels: opts.channels,
    // The space is what an admin recognises, not the owner's display name, and naming a person to
    // someone who may not know them reads as a privacy leak rather than a next step.
    payeeName: opts.space.brandName ?? opts.space.name ?? null,
  })
}

/** Resolve the prompt for a SPACE payee from its id alone, for a surface that holds a space id and
 *  nothing else (the Shop console's Storefront tab, a `?panel=` workspace). One extra read of the
 *  owner + the display name; every other surface should pass the space it already loaded.
 *
 *  FAIL-SAFE: an unreadable space resolves to a null payee, which prompts for setup rather than going
 *  quiet, in the same direction as the rest of this module. */
export async function resolveSpacePayoutPromptById(opts: {
  spaceId: string
  viewerProfileId: string | null
  channels: readonly PayoutChannel[]
}): Promise<PayoutPrompt | null> {
  const { data } = await createAdminClient()
    .from('spaces')
    .select('owner_profile_id, name, brand_name')
    .eq('id', opts.spaceId)
    .maybeSingle()
  const row = (data ?? null) as { owner_profile_id?: string | null; name?: string | null; brand_name?: string | null } | null
  return resolveSpacePayoutPrompt({
    space: { owner_profile_id: row?.owner_profile_id ?? null, name: row?.name ?? null, brandName: row?.brand_name ?? null },
    viewerProfileId: opts.viewerProfileId,
    channels: opts.channels,
  })
}
