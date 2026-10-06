// Partner directory read layer (Phase 3, ENGAGEMENT-ARCHITECTURE §4) — the read
// side of the partners module: active businesses for the geolocated directory and
// a single partner with its live offers. The shapes are presentation-neutral
// (web + mobile consume the same), mirroring lib/contract/views. Server-only.
//
// partners/* aren't in the generated Database types until the migration
// (20240218000000) is applied + regenerated; untyped client view for now.

import { createAdminClient } from '@/lib/supabase/admin'
import { listReadFailClosed } from '@/lib/discover'
import { isOfferLive, loyaltyProgress, type LoyaltyProgress } from './offers'

export interface PartnerSummary {
  id: string
  slug: string
  name: string
  category: string | null
  city: string | null
  description: string | null
}

interface PartnerOffer {
  id: string
  title: string
  description: string | null
  memberTerms: string | null
  validUntil: string | null
  /** LIVE-673: the Quest this offer rewards, when it is a sponsor reward. */
  quest?: { id: string; name: string } | null
  /** LIVE-710: visits that earn this offer when it is a loyalty card. */
  visitsRequired?: number | null
}

interface PartnerDetail extends PartnerSummary {
  address: string | null
  website: string | null
  offers: PartnerOffer[]
}

function db() {
  return createAdminClient()
}

/** Active partners for the directory, the public index and app/sitemap.ts. A failed read is
 *  REPORTED as failed (LIVE-331): a database answer logs and resolves `[]`, a transport failure
 *  throws `TransientReadError` after the retry ladder, so the sitemap abandons that regeneration
 *  and an ISR page keeps its last good copy instead of caching an empty directory. The thunk
 *  builds a fresh query per attempt, which is what makes the retry a retry. */
export async function listActivePartners(
  opts?: { category?: string; limit?: number },
): Promise<PartnerSummary[]> {
  const build = () => {
    let q = db()
      .from('partners')
      .select('id, slug, name, category, city, description')
      .eq('status', 'active')
      .order('name', { ascending: true })
    if (opts?.category) q = q.eq('category', opts.category)
    if (opts?.limit) q = q.limit(opts.limit)
    return q
  }

  const data = await listReadFailClosed<PartnerSummary>('partners', build)
  return data.map((p: PartnerSummary) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    category: p.category,
    city: p.city,
    description: p.description,
  }))
}

export async function getPartnerView(slug: string): Promise<PartnerDetail | null> {
  const client = db()
  const { data: p } = await client
    .from('partners')
    .select('id, slug, name, category, city, description, address, website')
    .eq('slug', slug)
    .eq('status', 'active')
    .maybeSingle()
  if (!p) return null

  const { data: offers, error: offersError } = await client
    .from('partner_offers')
    .select('id, title, description, member_terms, valid_until, active, visits_required, quests!quest_id ( id, name )')
    .eq('partner_id', p.id)
    .eq('active', true)
  if (offersError) console.error('[partners] offers read failed', { message: offersError.message, partnerId: p.id })

  // 2026-09-05 (scan2 L9-04): an expired offer is not a member offer. Same rule listLiveOffers
  // and the capture path apply (lib/partners/offers.ts), so the three never disagree.
  const nowIso = new Date().toISOString()
  const liveOffers = ((offers ?? []) as unknown as { id: string; title: string; description: string | null; member_terms: string | null; valid_until: string | null; active: boolean; visits_required: number | null; quests: { id: string; name: string } | null }[])
    .filter((o) => isOfferLive(o, nowIso))

  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    category: p.category,
    city: p.city,
    description: p.description,
    address: p.address,
    website: p.website,
    offers: liveOffers.map((o) => ({
      id: o.id,
      title: o.title,
      description: o.description,
      memberTerms: o.member_terms,
      validUntil: o.valid_until,
      quest: o.quests ? { id: o.quests.id, name: o.quests.name } : null,
      visitsRequired: o.visits_required,
    })),
  }
}

export interface LiveOffer extends PartnerOffer {
  partner: { slug: string; name: string; city: string | null }
  /** ISO timestamp of the viewer's redemption, when they've unlocked it. */
  redeemedAt: string | null
}

/** Every live offer across active partners, offers-first (the Zap menu's
 *  Partners surface, ADR-236), with the viewer's unlocked state merged in.
 *  A redemption with a null offer_id (plaque tapped before offers existed)
 *  counts for the partner's current offer. */
export async function listLiveOffers(profileId: string | null): Promise<LiveOffer[]> {
  const client = db()
  const nowIso = new Date().toISOString()
  const { data: offers, error } = await client
    .from('partner_offers')
    .select('id, title, description, member_terms, valid_until, active, partner_id, quest_id, visits_required, partners!partner_id ( slug, name, city, status )')
    .eq('active', true)
    .order('created_at', { ascending: false })
  if (error) console.error('[partners] live offers read failed', { message: error.message })

  type Row = {
    id: string
    title: string
    description: string | null
    member_terms: string | null
    valid_until: string | null
    active: boolean
    partner_id: string
    quest_id: string | null
    visits_required: number | null
    partners: { slug: string; name: string; city: string | null; status: string } | null
  }
  const live = ((offers ?? []) as Row[]).filter(
    (o) => o.partners?.status === 'active' && isOfferLive(o, nowIso),
  )

  const mineByOffer = new Map<string, string>()
  const mineByPartner = new Map<string, string>()
  if (profileId && live.length > 0) {
    const { data: mine } = await client
      .from('partner_redemptions')
      .select('offer_id, partner_id, redeemed_at')
      .eq('profile_id', profileId)
    for (const r of (mine ?? []) as { offer_id: string | null; partner_id: string; redeemed_at: string }[]) {
      if (r.offer_id) mineByOffer.set(r.offer_id, r.redeemed_at)
      else mineByPartner.set(r.partner_id, r.redeemed_at)
    }
  }

  return live.map((o) => ({
    id: o.id,
    title: o.title,
    description: o.description,
    memberTerms: o.member_terms,
    validUntil: o.valid_until,
    partner: { slug: o.partners!.slug, name: o.partners!.name, city: o.partners!.city },
    // A null-offer tap never unlocks a Quest sponsor reward (LIVE-673): that one is earned first.
    redeemedAt: mineByOffer.get(o.id) ?? (o.quest_id || o.visits_required ? null : mineByPartner.get(o.partner_id)) ?? null,
  }))
}

export interface OwnedOffer extends PartnerOffer {
  active: boolean
  /** LIVE-673: the Quest this offer rewards, or null. */
  questId: string | null
  /** LIVE-710: visits that earn it, when it is a loyalty card. */
  visitsRequired: number | null
}

/** Every offer a partner owns, live or not, newest first: the listing form's Offers section
 *  (scan2 L9-04). Callers authorise; this only reads. */
export async function listOffersOfPartner(partnerId: string): Promise<OwnedOffer[]> {
  const { data, error } = await db()
    .from('partner_offers')
    .select('id, title, description, member_terms, valid_until, active, quest_id, visits_required')
    .eq('partner_id', partnerId)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('[partners] owned offers read failed', { message: error.message, partnerId })
    return []
  }
  return (data ?? []).map((o) => ({
    id: o.id,
    title: o.title,
    description: o.description,
    memberTerms: o.member_terms,
    validUntil: o.valid_until,
    active: o.active,
    questId: o.quest_id,
    visitsRequired: o.visits_required,
  }))
}

export interface QuestSponsorReward {
  offerId: string
  title: string
  description: string | null
  memberTerms: string | null
  partner: { slug: string; name: string; city: string | null }
}

/** The live partner rewards sponsoring a Quest (LIVE-673), for that Quest's Journey pages. Goods or
 *  a discount redeemed in person, never cash. FAIL-SAFE: [] on any read error. */
export async function listQuestSponsorRewards(questId: string): Promise<QuestSponsorReward[]> {
  const { data, error } = await db()
    .from('partner_offers')
    .select('id, title, description, member_terms, valid_until, active, partners!partner_id ( slug, name, city, status )')
    .eq('quest_id', questId)
    .eq('active', true)
    .order('created_at', { ascending: true })
  if (error) {
    console.error('[partners] quest sponsor rewards read failed', { message: error.message, questId })
    return []
  }
  const nowIso = new Date().toISOString()
  type Row = {
    id: string
    title: string
    description: string | null
    member_terms: string | null
    valid_until: string | null
    active: boolean
    partners: { slug: string; name: string; city: string | null; status: string } | null
  }
  return ((data ?? []) as unknown as Row[])
    .filter((o) => o.partners?.status === 'active' && isOfferLive(o, nowIso))
    .map((o) => ({
      offerId: o.id,
      title: o.title,
      description: o.description,
      memberTerms: o.member_terms,
      partner: { slug: o.partners!.slug, name: o.partners!.name, city: o.partners!.city },
    }))
}

/** Whether the member has finished an official Journey of this Quest, which is what earns its
 *  sponsor rewards (LIVE-673). FAIL-SAFE: false. */
export async function hasFinishedQuest(profileId: string, questId: string): Promise<boolean> {
  const { data, error } = await db()
    .from('journey_completions')
    .select('id, journey_plans!inner(quest_id)')
    .eq('profile_id', profileId)
    .eq('journey_plans.quest_id', questId)
    .limit(1)
  if (error) return false
  return (data ?? []).length > 0
}

/** The member's standing on each loyalty card a partner runs (LIVE-710), keyed by offer id. Reads
 *  only this member's taps at this partner. FAIL-SAFE: an empty map. */
export async function getMyLoyalty(
  profileId: string,
  partnerId: string,
  cards: readonly { id: string; visitsRequired?: number | null }[],
): Promise<Map<string, LoyaltyProgress>> {
  const out = new Map<string, LoyaltyProgress>()
  const live = cards.filter((c) => c.visitsRequired)
  if (live.length === 0) return out
  const { data, error } = await db()
    .from('partner_redemptions')
    .select('offer_id, source, redeemed_at')
    .eq('partner_id', partnerId)
    .eq('profile_id', profileId)
    .order('redeemed_at', { ascending: false })
    .limit(500)
  if (error) return out
  const rows = (data ?? []) as { offer_id: string | null; source: string | null; redeemed_at: string }[]
  for (const c of live) out.set(c.id, loyaltyProgress(rows, c.id, c.visitsRequired as number))
  return out
}
