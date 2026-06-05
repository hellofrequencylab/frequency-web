// App-wide people search, lead side. Members are searched as today (profiles); this
// adds the non-member people a viewer is ENTITLED to find — their own captures, and
// (when a steward shares to the network) locality-matched captures — gated by the
// single rule in ./visibility (ADR-130). Service-role read; the viewer scope is
// enforced in code via canViewLead, never by exposing the table.
//
// `includeNetwork` is the cross-steward tier: only stewards (host+) / staff pass it
// (captures are "readable by signed-in stewards" — docs/NETWORK-CRM.md), and even
// then a network capture only surfaces to a viewer in the same locality. Email is
// withheld from network hits — discovery routes through the capturing steward.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { canViewLead, type LeadReason } from './visibility'

function db() {
  return createAdminClient() as unknown as SupabaseClient
}

export type LeadHit = {
  /** network_contacts id. */
  id: string
  displayName: string
  /** Only populated for the viewer's OWN captures — withheld for network hits. */
  email: string | null
  city: string | null
  /** The capturing steward, for network-local hits (so the viewer can ask for an intro). */
  ownerName: string | null
  reason: LeadReason
  /** Where the viewer opens this lead. */
  href: string | null
}

export type SearchLeadsOptions = {
  /** Include network-shared captures from OTHER stewards (locality-gated). Stewards/staff only. */
  includeNetwork?: boolean
  limit?: number
}

/** Captures the viewer may find for `q`. Owner captures link to the steward's own
 *  CRM (/connections/[id]); network-local captures link to the read-only shared
 *  view (/connections/shared/[id]). */
export async function searchVisibleLeads(
  viewerProfileId: string,
  q: string,
  { includeNetwork = false, limit = 8 }: SearchLeadsOptions = {},
): Promise<LeadHit[]> {
  const needle = q.replace(/[(),%]/g, ' ').trim()
  if (needle.length < 2 || !viewerProfileId) return []

  // The viewer's locality, for the network-local rule (only needed when scanning the network).
  let viewerCity: string | null = null
  if (includeNetwork) {
    const { data: me } = await db().from('profiles').select('city').eq('id', viewerProfileId).maybeSingle()
    viewerCity = ((me as { city?: string } | null)?.city as string) ?? null
  }

  // Only fetch rows that COULD pass the rule: the viewer's own, plus (when allowed)
  // network-shared rows. Private captures owned by others are never fetched, and the
  // canViewLead check below is the authoritative backstop.
  let query = db()
    .from('network_contacts')
    .select('id, owner_id, visibility, city, display_name, email, linked_profile_id, created_at')
  query = includeNetwork
    ? query.or(`owner_id.eq.${viewerProfileId},visibility.eq.network`)
    : query.eq('owner_id', viewerProfileId)
  const { data } = await query
    .or(`display_name.ilike.%${needle}%,email.ilike.%${needle}%`)
    .order('created_at', { ascending: false })
    .limit(limit * 3)

  const rows = (data ?? []) as Record<string, unknown>[]
  const hits: (LeadHit & { ownerId: string })[] = []
  const networkOwnerIds = new Set<string>()

  for (const r of rows) {
    const ownerId = String(r.owner_id)
    const decision = canViewLead(
      { profileId: viewerProfileId, city: viewerCity },
      {
        ownerId,
        visibility: (r.visibility as string) ?? 'private',
        city: (r.city as string) ?? null,
        linkedProfileId: (r.linked_profile_id as string) ?? null,
      },
    )
    if (!decision.visible) continue
    const isOwner = decision.reason === 'owner'
    if (!isOwner) networkOwnerIds.add(ownerId)
    hits.push({
      id: String(r.id),
      ownerId,
      displayName: (r.display_name as string) ?? 'Unnamed contact',
      // Withhold a network contact's email from a non-owner — intro goes via the steward.
      email: isOwner ? ((r.email as string) ?? null) : null,
      city: (r.city as string) ?? null,
      ownerName: null,
      reason: decision.reason,
      href: isOwner ? `/connections/${String(r.id)}` : `/connections/shared/${String(r.id)}`,
    })
    if (hits.length >= limit) break
  }

  // Resolve steward names for network-local hits (owner hits are the viewer).
  if (networkOwnerIds.size > 0) {
    const { data: owners } = await db().from('profiles').select('id, display_name').in('id', [...networkOwnerIds])
    const nameMap = new Map<string, string>()
    for (const o of (owners ?? []) as Record<string, unknown>[]) nameMap.set(String(o.id), (o.display_name as string) ?? '')
    for (const h of hits) if (h.reason !== 'owner') h.ownerName = nameMap.get(h.ownerId) ?? null
  }

  return hits.map((h) => ({
    id: h.id,
    displayName: h.displayName,
    email: h.email,
    city: h.city,
    ownerName: h.ownerName,
    reason: h.reason,
    href: h.href,
  }))
}
