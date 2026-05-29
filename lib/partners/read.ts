// Partner directory read layer (Phase 3, ENGAGEMENT-ARCHITECTURE §4) — the read
// side of the partners module: active businesses for the geolocated directory and
// a single partner with its live offers. The shapes are presentation-neutral
// (web + mobile consume the same), mirroring lib/contract/views. Server-only.
//
// partners/* aren't in the generated Database types until the migration
// (20240218000000) is applied + regenerated; untyped client view for now.

import type { SupabaseClient } from '@supabase/supabase-js'
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

function db(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient
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
