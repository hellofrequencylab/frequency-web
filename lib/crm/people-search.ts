// App-wide people search, lead side. Members are searched as today (profiles); this
// adds the non-member people a viewer is ENTITLED to find — their own captures, and
// (when a steward shares to the network) locality-matched captures — gated by the
// single rule in ./visibility (ADR-127). Service-role read; the viewer scope is
// enforced in code via canViewLead, never by exposing the table.

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
  email: string | null
  city: string | null
  ownerName: string | null
  reason: LeadReason
  /** Where the viewer can open this lead, or null if no viewer-accessible page exists yet. */
  href: string | null
}

/** Captures the viewer may find for `q`. Owner captures link to the steward's own
 *  CRM (/connections/[id]); network-local captures are returned (reason set) but
 *  carry no href until a viewer-facing lead page exists. */
export async function searchVisibleLeads(viewerProfileId: string, q: string, limit = 8): Promise<LeadHit[]> {
  const needle = q.replace(/[(),%]/g, ' ').trim()
  if (needle.length < 2 || !viewerProfileId) return []

  // The viewer's locality, for the network-local rule.
  const { data: me } = await db().from('profiles').select('city').eq('id', viewerProfileId).maybeSingle()
  const viewerCity = ((me as { city?: string } | null)?.city as string) ?? null

  // Only fetch rows that COULD pass the rule: the viewer's own, or network-shared.
  // (Private captures owned by others can never surface — enforced again below.)
  const { data } = await db()
    .from('network_contacts')
    .select('id, owner_id, visibility, city, display_name, email, linked_profile_id, created_at')
    .or(`owner_id.eq.${viewerProfileId},visibility.eq.network`)
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
    if (decision.reason !== 'owner') networkOwnerIds.add(ownerId)
    hits.push({
      id: String(r.id),
      ownerId,
      displayName: (r.display_name as string) ?? 'Unnamed contact',
      email: (r.email as string) ?? null,
      city: (r.city as string) ?? null,
      ownerName: null,
      reason: decision.reason,
      href: decision.reason === 'owner' ? `/connections/${String(r.id)}` : null,
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
