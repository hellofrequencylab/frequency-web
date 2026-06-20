// Partner directory read layer (Phase 3, ENGAGEMENT-ARCHITECTURE §4) — the read
// side of the partners module: active businesses for the geolocated directory and
// a single partner with its live offers. The shapes are presentation-neutral
// (web + mobile consume the same), mirroring lib/contract/views. Server-only.
//
// partners/* aren't in the generated Database types until the migration
// (20240218000000) is applied + regenerated; untyped client view for now.

import { createAdminClient } from '@/lib/supabase/admin'

export interface PartnerSummary {
  id: string
  slug: string
  name: string
  category: string | null
  city: string | null
  description: string | null
}

export interface PartnerOffer {
  id: string
  title: string
  description: string | null
  memberTerms: string | null
  validUntil: string | null
}

export interface PartnerDetail extends PartnerSummary {
  address: string | null
  website: string | null
  offers: PartnerOffer[]
}

function db() {
  return createAdminClient()
}

export async function listActivePartners(
  opts?: { category?: string; limit?: number },
): Promise<PartnerSummary[]> {
  let q = db()
    .from('partners')
    .select('id, slug, name, category, city, description')
    .eq('status', 'active')
    .order('name', { ascending: true })
  if (opts?.category) q = q.eq('category', opts.category)
  if (opts?.limit) q = q.limit(opts.limit)

  const { data } = await q
  return (data ?? []).map((p: PartnerSummary) => ({
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

  const { data: offers } = await client
    .from('partner_offers')
    .select('id, title, description, member_terms, valid_until')
    .eq('partner_id', p.id)
    .eq('active', true)

  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    category: p.category,
    city: p.city,
    description: p.description,
    address: p.address,
    website: p.website,
    offers: (offers ?? []).map((o: { id: string; title: string; description: string | null; member_terms: string | null; valid_until: string | null }) => ({
      id: o.id,
      title: o.title,
      description: o.description,
      memberTerms: o.member_terms,
      validUntil: o.valid_until,
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
  const { data: offers } = await client
    .from('partner_offers')
    .select('id, title, description, member_terms, valid_until, partner_id, partners!partner_id ( slug, name, city, status )')
    .eq('active', true)
    .order('created_at', { ascending: false })

  type Row = {
    id: string
    title: string
    description: string | null
    member_terms: string | null
    valid_until: string | null
    partner_id: string
    partners: { slug: string; name: string; city: string | null; status: string } | null
  }
  const live = ((offers ?? []) as Row[]).filter(
    (o) =>
      o.partners?.status === 'active' &&
      (!o.valid_until || o.valid_until >= nowIso),
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
    redeemedAt: mineByOffer.get(o.id) ?? mineByPartner.get(o.partner_id) ?? null,
  }))
}
