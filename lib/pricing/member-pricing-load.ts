import { createAdminClient } from '@/lib/supabase/admin'
import { loadCatalogConfig } from '@/lib/pricing/catalog-config'
import { getPricingValues, billingLive, memberTierSellable } from '@/lib/pricing/settings'
import { resolvedNetworkRate } from '@/lib/billing/fees'
import { spaceLoadoutSellable } from '@/lib/billing/space-plan-checkout'
import { getSpaceVerification } from '@/lib/spaces/nonprofit-verification'
import { asSpacePlan } from '@/lib/pricing/plans'
import {
  buildPricingBox,
  type PricingBoxData,
  type PricingPersonalContext,
  type PricingSpaceContext,
} from '@/lib/pricing/member-pricing'

// THE MEMBER PRICING BOX, its server loader. It resolves the only IO the box needs (the Crew amounts, the
// trial length, the operator's network fee, which plans sell) and hands plain data to the client box, so the
// client never computes a price. Every read fails safe: a failure shows the catalog prices and disables the
// buy buttons rather than quoting a number the checkout would not take.

/** The catalog half of the box: prices, copy, the comparison and the Crew amounts. */
export async function loadPricingBoxData(): Promise<PricingBoxData> {
  const [catalog, values, takeRate] = await Promise.all([loadCatalogConfig(), getPricingValues(), resolvedNetworkRate()])
  return buildPricingBox({ crew: catalog.pwyw, trialDays: values.trial.days, takeRate })
}

/** Which Space plans sell right now. */
export async function loadSellable(): Promise<PricingSpaceContext['sellable']> {
  const [business, collective, network, nonprofit, nonprofit_collective] = await Promise.all([
    spaceLoadoutSellable('business'),
    spaceLoadoutSellable('collective'),
    spaceLoadoutSellable('network'),
    spaceLoadoutSellable('nonprofit'),
    spaceLoadoutSellable('nonprofit_collective'),
  ])
  return { business, collective, network, nonprofit, nonprofit_collective }
}

/** The viewer's personal tier and whether Crew is on sale. */
export async function loadPersonalContext(membershipTier: string | null | undefined): Promise<PricingPersonalContext> {
  const [crewSellable, live] = await Promise.all([memberTierSellable('crew'), billingLive()])
  return {
    tier: (membershipTier ?? 'free') !== 'free' ? 'crew' : 'member',
    crewSellable,
    betaOpen: !live,
  }
}

/** The first Space a member owns, as the box's buying context, or null when they own none. */
export async function loadOwnedSpaceContext(profileId: string): Promise<PricingSpaceContext | null> {
  const db = createAdminClient()
  const { data } = (await db
    .from('spaces')
    .select('id, slug, name, plan')
    .eq('owner_profile_id', profileId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()) as { data: { id: string; slug: string; name: string; plan: string | null } | null }
  if (!data) return null
  const [verification, sellable] = await Promise.all([getSpaceVerification(data.id), loadSellable()])
  const plan = asSpacePlan(data.plan)
  return {
    slug: data.slug,
    name: data.name,
    plan,
    canBuy: true,
    paid: plan !== 'free',
    verified: verification?.status === 'verified',
    inherited: false,
    sellable,
  }
}
