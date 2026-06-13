// Server-side reads for Spaces (ADR-250 step 6). Resolution is by host (custom domain),
// by slug, or the root space. Reads go through the service-role admin client; the table's
// RLS already restricts public reads to active spaces. Writes (operator-managed Space
// settings) live behind app-code authz like the rest of the admin surface — added with the
// Space management UI, not here.

import { createAdminClient } from '@/lib/supabase/admin'
import type { Space, SpaceStatus, SpaceType } from './types'

const COLS =
  'id, slug, name, type, status, entity_id, skin, domain, network_connected, enabled_verticals, owner_profile_id'

type SpaceRow = {
  id: string
  slug: string
  name: string
  type: string
  status: string
  entity_id: string
  skin: string
  domain: string | null
  network_connected: boolean
  enabled_verticals: string[] | null
  owner_profile_id: string | null
}

function mapSpace(r: SpaceRow): Space {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    type: r.type as SpaceType,
    status: r.status as SpaceStatus,
    entityId: r.entity_id,
    skin: r.skin,
    domain: r.domain,
    networkConnected: r.network_connected,
    enabledVerticals: r.enabled_verticals ?? [],
    ownerProfileId: r.owner_profile_id,
  }
}

/** The Space serving a host (custom domain/subdomain), or null if none matches. */
export async function getSpaceByDomain(domain: string): Promise<Space | null> {
  const host = domain.trim().toLowerCase()
  if (!host) return null
  const { data } = await createAdminClient()
    .from('spaces')
    .select(COLS)
    .eq('domain', host)
    .eq('status', 'active')
    .maybeSingle()
  return data ? mapSpace(data as SpaceRow) : null
}

/** The Space with this slug, or null. */
export async function getSpaceBySlug(slug: string): Promise<Space | null> {
  const { data } = await createAdminClient()
    .from('spaces')
    .select(COLS)
    .eq('slug', slug.trim().toLowerCase())
    .maybeSingle()
  return data ? mapSpace(data as SpaceRow) : null
}

/** The canonical root Space (the Frequency app itself). */
export async function getRootSpace(): Promise<Space | null> {
  const { data } = await createAdminClient()
    .from('spaces')
    .select(COLS)
    .eq('type', 'root')
    .eq('status', 'active')
    .maybeSingle()
  return data ? mapSpace(data as SpaceRow) : null
}

/**
 * Resolve the active Space for a request host: a custom-domain match wins, otherwise the
 * root space. The single entry point the shell/middleware calls to know "which Space is
 * this". Returns null only if even the root space is missing (pre-migration).
 */
export async function resolveSpaceForHost(host: string | null): Promise<Space | null> {
  if (host) {
    const byDomain = await getSpaceByDomain(host)
    if (byDomain) return byDomain
  }
  return getRootSpace()
}
