'use server'

// BUY A NEW DOMAIN, the Domain section's third method (LIVE-781). Thin server actions over
// lib/sites/domain-purchase.ts: search a name, start the Space's checkout, and settle an on-page payment.
// Search and start RE-RESOLVE the Space from the slug and RE-GATE the caller as an editor (owner / admin /
// editor) and the custom_domain plan gate, exactly like the connect actions beside them in ./actions.ts.
// Everything is behind domainPurchaseOpen(), which is OFF until an operator turns domain sales on.

import { headers } from 'next/headers'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { rateLimitOk } from '@/lib/rate-limit'
import { parseSiteDomain } from '@/lib/sites/domain'
import { parseRegistrantContact } from '@/lib/sites/registrar'
import { onPageCheckoutAvailable } from '@/lib/billing/stripe-browser'
import {
  createDomainPurchaseCheckout,
  domainPurchaseOpen,
  recordDomainPurchaseFromSessionId,
  searchDomain,
} from '@/lib/sites/domain-purchase'
import type { DomainSearch } from '@/lib/sites/domain-pricing'

const COMING_SOON = 'Buying a domain is coming soon.'

/** The caller as an editor of `slug`'s Space, with its plan and bound domain, or null on any miss. */
async function authorizeDomainBuyer(slug: string): Promise<{ spaceId: string; plan: string | null; domain: string | null } | null> {
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null
  if (!viewerProfileId) return null
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) return null
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  if (!caps.canEditProfile) return null
  return { spaceId: space.id, plan: space.plan ?? null, domain: space.domain ?? null }
}

async function customDomainAllowed(plan: string | null): Promise<boolean> {
  const [{ featureAllowed }, { featureGatesLive }, { asSpacePlan }] = await Promise.all([
    import('@/lib/pricing/gates'),
    import('@/lib/pricing/settings'),
    import('@/lib/pricing/plans'),
  ])
  return featureAllowed('custom_domain', { plan: asSpacePlan(plan) }, { gatesLive: await featureGatesLive() })
}

/** Is `input` free to buy, and what does a year cost the Space? */
export async function searchDomainToBuy(slug: string, input: string): Promise<ActionResult<DomainSearch>> {
  const auth = await authorizeDomainBuyer(slug)
  if (!auth) return fail('Only the people who run this Space can buy a domain for it.')
  if (!(await domainPurchaseOpen())) return fail(COMING_SOON)
  const parsed = parseSiteDomain(input)
  if (!parsed.ok) return fail(parsed.error)
  if (!(await rateLimitOk('domain_search', auth.spaceId, 30, '1 m', { whenUnconfigured: 'allow' }))) {
    return fail('Too many searches. Try again in a minute.')
  }
  const result = await searchDomain(parsed.domain)
  return result.ok ? ok(result.data) : fail(result.error)
}

/**
 * Start the checkout for `domain`. Returns EITHER an on-page client secret or a hosted Checkout URL
 * (docs/CHECKOUT.md), never both. A caller whose on-page form failed passes `forceHosted`.
 */
export async function startDomainPurchaseCheckout(
  slug: string,
  domain: string,
  shownTotalCents: number,
  contactInput: unknown,
  opts?: { forceHosted?: boolean },
): Promise<ActionResult<{ url?: string; clientSecret?: string; sessionId?: string }>> {
  const auth = await authorizeDomainBuyer(slug)
  if (!auth) return fail('Only the people who run this Space can buy a domain for it.')
  if (!(await domainPurchaseOpen())) return fail(COMING_SOON)
  if (!(await customDomainAllowed(auth.plan))) return fail('Your own domain comes with the Business plan.')
  if (auth.domain) return fail('Remove your current domain first, then buy the new one.')
  const parsed = parseSiteDomain(domain)
  if (!parsed.ok) return fail(parsed.error)
  const contact = parseRegistrantContact(contactInput)
  if (!contact.ok) return fail(contact.error)

  const result = await createDomainPurchaseCheckout({
    spaceId: auth.spaceId,
    domain: parsed.domain,
    shownTotalCents,
    contact: contact.contact,
    ui: opts?.forceHosted ? 'hosted' : onPageCheckoutAvailable() ? 'elements' : 'hosted',
  })
  if (result.clientSecret) return ok({ clientSecret: result.clientSecret, sessionId: result.sessionId })
  if (result.url) return ok({ url: result.url })
  return fail(result.error ?? 'Could not start checkout for this domain. Try again.')
}

/**
 * Settle an on-page domain payment the moment it succeeds, without waiting for the webhook
 * (docs/CHECKOUT.md section 3). Both are safe to run: the settle claims a `pending` row once.
 */
// authz-ok: STRIPE IS THE AUTHORITY. recordDomainPurchaseFromSessionId re-fetches the session from
// Stripe and acts only on a paid `domain_purchase` session, claiming its row once, so the most a caller
// can do with someone else's session id is settle a purchase that was really paid for, which the
// webhook does unprompted seconds later. Nothing is read back but a boolean.
export async function settleDomainPurchaseAction(sessionId: string): Promise<ActionResult<{ settled: boolean }>> {
  if (!sessionId || !sessionId.startsWith('cs_')) return fail('Not a checkout session.')
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!(await rateLimitOk('settle_domain_purchase', ip, 30, '1 m', { whenUnconfigured: 'allow' }))) {
    return fail('Too many attempts. Try again in a minute.')
  }
  try {
    const status = await recordDomainPurchaseFromSessionId(sessionId)
    return ok({ settled: status != null })
  } catch (e) {
    // Never fatal to the buyer: they paid, and the webhook still settles. Loud, so a miss is seen.
    console.error('[domain-purchase] on-page settle failed; the webhook is now the only path', e instanceof Error ? e.message : '')
    return ok({ settled: false })
  }
}
