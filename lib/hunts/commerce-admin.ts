/**
 * The organizer side of Hunt commerce (FH-036S, FH-038S): bind a published Hunt version to a fixed-price
 * ticket tier of the Hunt's own Space, and approve a Space's store item for a Hunt. Every write goes through
 * the same gates the rest of the money core uses (`validateBinding`, the unique indexes, the database's
 * freeze trigger) and the Hunt gate in lib/hunts/authz.ts. A Hunt owned by a person and not a Space has no
 * seller, so it cannot sell: the screen says so rather than guessing one.
 */
import { versionBenefits, type VersionBenefit } from './benefit-codes'
import { activeBindingForTier, db } from './commerce-store'
import { validateBinding, type CanonicalTier, type PassBinding } from './pass-binding'
import { authorizeHuntAction } from './store'

export type CommerceAdminView = Readonly<{
  huntId: string
  sellerSpaceId: string | null
  versionId: string | null
  published: boolean
  benefits: readonly VersionBenefit[]
  bindings: readonly Readonly<{ id: string; ticketTypeId: string; eventId: string; benefitCodes: readonly string[]; status: string }>[]
  tiers: readonly Readonly<{ id: string; eventId: string; eventTitle: string; name: string; priceCents: number; bound: boolean }>[]
  products: readonly Readonly<{ id: string; name: string }>[]
  offers: readonly Readonly<{ id: string; productId: string; productName: string; benefitCode: string | null; requiresState: string; status: string }>[]
}>

type Result = { ok: true } | { ok: false; error: string }

const MESSAGE: Record<string, string> = {
  tier_not_found: 'That ticket type isn’t available.',
  event_mismatch: 'That ticket type belongs to a different event.',
  seller_mismatch: 'That ticket type belongs to a different Space.',
  tier_not_paid: 'Only a fixed-price paid ticket can carry a pass.',
  no_benefits: 'Pick at least one benefit.',
  too_many_benefits: 'A pass can carry at most ten benefits.',
  bad_benefit_code: 'One of those benefits isn’t valid.',
  duplicate_benefit_code: 'A benefit was picked twice.',
  benefit_not_in_version: 'Pick benefits this published version offers.',
  tier_already_bound: 'That ticket already carries a pass. Retire it first.',
}

/** What the commerce screen shows. Null when the actor may not manage this Hunt (answered as a 404). */
export async function loadCommerceAdmin(huntId: string, profileId: string): Promise<CommerceAdminView | null> {
  const hunt = await authorizeHuntAction(huntId, { profileId }, 'publish')
  if (!hunt) return null
  const seller = hunt.ownerSpaceId
  const { data: v } = hunt.currentVersionId
    ? await db().from('hunt_versions').select('id, status, policy').eq('id', hunt.currentVersionId).eq('hunt_id', huntId).maybeSingle()
    : { data: null }
  const version = v as { id: string; status: string; policy: unknown } | null
  const published = version?.status === 'published'
  const base = { huntId, sellerSpaceId: seller, versionId: version?.id ?? null, published, benefits: published ? versionBenefits(version?.policy) : [] }
  if (!seller) return { ...base, bindings: [], tiers: [], products: [], offers: [] }

  const { data: b } = await db().from('hunt_pass_bindings').select('id, ticket_type_id, event_id, benefit_codes, status').eq('hunt_id', huntId).order('created_at', { ascending: false })
  const bindings = ((b as { id: string; ticket_type_id: string; event_id: string; benefit_codes: string[]; status: string }[] | null) ?? []).map((r) => ({
    id: r.id, ticketTypeId: r.ticket_type_id, eventId: r.event_id, benefitCodes: r.benefit_codes, status: r.status,
  }))
  const boundTiers = new Set(bindings.filter((x) => x.status === 'active').map((x) => x.ticketTypeId))

  const { data: ev } = await db().from('events').select('id, title').or(`host_space_id.eq.${seller},and(host_space_id.is.null,space_id.eq.${seller})`).order('starts_at', { ascending: false }).limit(50)
  const events = (ev as { id: string; title: string }[] | null) ?? []
  const { data: tt } = events.length
    ? await db().from('event_ticket_types').select('id, event_id, name, price_cents').eq('pricing_mode', 'fixed').eq('active', true).gt('price_cents', 0).in('event_id', events.map((e) => e.id))
    : { data: [] }
  const titles = new Map(events.map((e) => [e.id, e.title]))
  const tiers = ((tt as { id: string; event_id: string; name: string; price_cents: number }[] | null) ?? []).map((t) => ({
    id: t.id, eventId: t.event_id, eventTitle: titles.get(t.event_id) ?? 'Event', name: t.name, priceCents: t.price_cents, bound: boundTiers.has(t.id),
  }))

  const { data: pr } = await db().from('commerce_products').select('id, title').eq('owner_space_id', seller).eq('status', 'active').order('title').limit(100)
  const products = ((pr as { id: string; title: string }[] | null) ?? []).map((p) => ({ id: p.id, name: p.title }))
  const names = new Map(products.map((p) => [p.id, p.name]))
  const { data: of } = await db().from('hunt_store_offers').select('id, product_id, benefit_code, requires_state, status').eq('hunt_id', huntId).order('created_at', { ascending: false })
  const offers = ((of as { id: string; product_id: string; benefit_code: string | null; requires_state: string; status: string }[] | null) ?? []).map((o) => ({
    id: o.id, productId: o.product_id, productName: names.get(o.product_id) ?? 'Product', benefitCode: o.benefit_code, requiresState: o.requires_state, status: o.status,
  }))
  return { ...base, bindings, tiers, products, offers }
}

/** Bind the Hunt's published version to one ticket tier. Everything but the tier and the codes is read here. */
export async function bindPass(huntId: string, profileId: string, ticketTypeId: string, benefitCodes: readonly string[]): Promise<Result> {
  const hunt = await authorizeHuntAction(huntId, { profileId }, 'publish')
  if (!hunt?.ownerSpaceId || !hunt.currentVersionId) return { ok: false, error: 'This Hunt can’t sell a pass yet.' }
  const { data: v } = await db().from('hunt_versions').select('id, status, policy').eq('id', hunt.currentVersionId).eq('hunt_id', huntId).maybeSingle()
  const version = v as { id: string; status: string; policy: unknown } | null
  if (!version || version.status !== 'published') return { ok: false, error: 'Publish the Hunt before binding a pass.' }
  const { data: t } = await db().from('event_ticket_types').select('id, event_id, pricing_mode, price_cents, quantity, sold').eq('id', ticketTypeId).maybeSingle()
  const row = t as { id: string; event_id: string; pricing_mode: CanonicalTier['pricingMode']; price_cents: number | null; quantity: number | null; sold: number } | null
  const { data: ev } = row ? await db().from('events').select('space_id, host_space_id').eq('id', row.event_id).maybeSingle() : { data: null }
  const evRow = ev as { space_id: string | null; host_space_id: string | null } | null
  const tier: CanonicalTier | null = row
    ? { id: row.id, eventId: row.event_id, sellerSpaceId: evRow?.host_space_id || evRow?.space_id || '', pricingMode: row.pricing_mode, priceCents: row.price_cents, currency: 'USD', quantity: row.quantity, sold: row.sold, salesOpen: true }
    : null
  const existing: PassBinding | null = await activeBindingForTier(ticketTypeId)
  const verdict = validateBinding(
    { huntId, versionId: version.id, eventId: tier?.eventId ?? '', ticketTypeId, sellerSpaceId: hunt.ownerSpaceId, benefitCodes },
    tier,
    versionBenefits(version.policy).map((b) => b.code),
    existing,
  )
  if (!verdict.ok) return { ok: false, error: MESSAGE[verdict.reason] ?? 'That pass can’t be bound.' }
  const { error } = await db().from('hunt_pass_bindings').insert({
    hunt_id: huntId, version_id: version.id, event_id: tier!.eventId, ticket_type_id: ticketTypeId,
    seller_space_id: hunt.ownerSpaceId, benefit_codes: verdict.benefitCodes, created_by: profileId,
  })
  if (error) return { ok: false, error: error.code === '23505' ? MESSAGE.tier_already_bound : 'Couldn’t save that pass. Try again.' }
  return { ok: true }
}

/** Approve one of the Space's products for this Hunt, optionally carrying a benefit the published version offers. */
export async function approveOffer(huntId: string, profileId: string, productId: string, benefitCode: string | null, requiresState: 'paid' | 'fulfilled'): Promise<Result> {
  const hunt = await authorizeHuntAction(huntId, { profileId }, 'publish')
  if (!hunt?.ownerSpaceId) return { ok: false, error: 'This Hunt can’t link store items yet.' }
  const { data: p } = await db().from('commerce_products').select('id, owner_space_id').eq('id', productId).maybeSingle()
  if ((p as { owner_space_id: string | null } | null)?.owner_space_id !== hunt.ownerSpaceId) return { ok: false, error: 'That item isn’t sold by this Space.' }
  if (benefitCode !== null) {
    const { data: v } = hunt.currentVersionId ? await db().from('hunt_versions').select('status, policy').eq('id', hunt.currentVersionId).maybeSingle() : { data: null }
    const version = v as { status: string; policy: unknown } | null
    if (version?.status !== 'published' || !versionBenefits(version.policy).some((b) => b.code === benefitCode)) {
      return { ok: false, error: 'Pick a benefit this published version offers.' }
    }
  }
  const { error } = await db().from('hunt_store_offers').insert({
    hunt_id: huntId, seller_space_id: hunt.ownerSpaceId, product_id: productId, benefit_code: benefitCode, requires_state: requiresState, approved_by: profileId,
  })
  if (error) return { ok: false, error: error.code === '23505' ? 'That item is already approved for this Hunt.' : 'Couldn’t save that item. Try again.' }
  return { ok: true }
}

/** Withdraw an offer. Benefits already projected stay; a withdrawn offer projects nothing new. */
export async function withdrawOffer(huntId: string, profileId: string, offerId: string): Promise<Result> {
  const hunt = await authorizeHuntAction(huntId, { profileId }, 'publish')
  if (!hunt) return { ok: false, error: 'Not available.' }
  const { error } = await db().from('hunt_store_offers').update({ status: 'withdrawn', withdrawn_at: new Date().toISOString() }).eq('id', offerId).eq('hunt_id', huntId).eq('status', 'approved')
  return error ? { ok: false, error: 'Couldn’t withdraw that item. Try again.' } : { ok: true }
}
