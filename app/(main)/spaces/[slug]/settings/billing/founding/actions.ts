'use server'

import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { createFoundingBusinessCheckout } from '@/lib/founding/business-checkout'
import type { BillingPeriod } from '@/lib/billing/pricing-keys'
import { type ActionResult, ok, fail } from '@/lib/action-result'

// FOUNDING BUSINESS CHECKOUT ACTION (ADR-599 / ADR-803 / ADR-811).
//
// `createFoundingBusinessCheckout` existed with zero callers, and the Stripe session it builds
// redirects to /spaces/<slug>/settings/billing/founding[/success] — routes that did not exist. So the
// per-city founding cohort was unreachable: no button, no link, no route, and `founding_members`
// business rows could never be created through checkout. This is the missing seam.
//
// AUTHORIZATION mirrors the sibling billing actions exactly: the ADMIN floor, not `canManage`. These
// mutate the owner's live Stripe subscription, so an EDITOR must not reach them (the same reasoning
// that moved the seat/portal/plan actions off canManage).
//
// The checkout re-runs every gate itself (billing live, already paying, city cap), so a non-`open`
// state comes back as a state rather than a broken URL, and nothing here can charge while billing is
// OFF. No em dashes.

/** Authorize the caller as an ADMIN (or owner) of `slug`'s space — the billing floor. */
async function authorizeOwner(slug: string): Promise<{ spaceId: string } | null> {
  const caller = await getCallerProfile()
  const space = await getVisibleSpaceBySlug(slug, caller?.id ?? null)
  if (!space) return null
  const caps = await getSpaceCapabilities(space, caller?.id ?? null)
  if (!caps.isAdmin) return null
  return { spaceId: space.id }
}

/** The message for each non-`open` gate, so the surface never has to invent copy for a blocked state. */
const STATE_MESSAGE: Record<string, string> = {
  not_open: 'Founding spots are not open yet.',
  already_active: 'This Space already has a plan, so it cannot start a founding checkout.',
  sold_out: 'The founding spots for that city are taken.',
}

/** Begin the founding Business checkout for a Space. Owner/admin gated; returns a clean message for
 *  every blocked state rather than a URL that cannot work. */
export async function startFoundingBusinessCheckout(
  slug: string,
  city: string,
  period: BillingPeriod = 'monthly',
): Promise<ActionResult<{ url: string }>> {
  const auth = await authorizeOwner(slug)
  if (!auth) return fail('You do not have access to manage this space.')

  const result = await createFoundingBusinessCheckout({
    spaceId: auth.spaceId,
    slug,
    period,
    city: (city ?? '').trim(),
  })
  if (result.ok) return ok({ url: result.url })
  if ('state' in result) return fail(STATE_MESSAGE[result.state] ?? 'Founding checkout is not available.')
  return fail(result.error)
}
