// Server-side reads for Spaces (ADR-250 step 6). Resolution is by host (custom domain),
// by slug, or the root space. Reads go through the service-role admin client; the table's
// RLS already restricts public reads to active spaces. Writes (operator-managed Space
// settings) live behind app-code authz like the rest of the admin surface — added with the
// Space management UI, not here.

import { createAdminClient } from '@/lib/supabase/admin'
import type { Space, SpaceStatus, SpaceType } from './types'

// The brand_* columns ship in 20260626000000_space_brand.sql and are not in the generated
// `lib/database.types.ts` yet, so we keep them in this column list and cast each selected row
// to the local `SpaceRow` below (the typed reads stay sound — the cast is localized here, not
// pushed into database.types.ts). Regenerate the types to fold these in canonically.
const COLS =
  'id, slug, name, type, status, entity_id, skin, domain, network_connected, enabled_verticals, owner_profile_id, brand_name, brand_logo_url, brand_accent'

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
  brand_name: string | null
  brand_logo_url: string | null
  brand_accent: string | null
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
    brandName: r.brand_name,
    brandLogoUrl: r.brand_logo_url,
    brandAccent: r.brand_accent,
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
  return data ? mapSpace(data as unknown as SpaceRow) : null
}

/** The Space with this slug, or null. */
export async function getSpaceBySlug(slug: string): Promise<Space | null> {
  const { data } = await createAdminClient()
    .from('spaces')
    .select(COLS)
    .eq('slug', slug.trim().toLowerCase())
    .maybeSingle()
  return data ? mapSpace(data as unknown as SpaceRow) : null
}

/** A single Space by id, or null. Used by the operator admin surface (it reads through the
 *  admin client, which bypasses the active-only RLS, so suspended/archived spaces resolve). */
export async function getSpaceById(id: string): Promise<Space | null> {
  const { data } = await createAdminClient()
    .from('spaces')
    .select(COLS)
    .eq('id', id)
    .maybeSingle()
  return data ? mapSpace(data as unknown as SpaceRow) : null
}

/** Every Space, name-ordered — the operator admin list. Admin-client read (all statuses). */
export async function listSpaces(): Promise<Space[]> {
  const { data } = await createAdminClient()
    .from('spaces')
    .select(COLS)
    .order('name', { ascending: true })
  return ((data ?? []) as unknown as SpaceRow[]).map(mapSpace)
}

/** The canonical root Space (the Frequency app itself). */
export async function getRootSpace(): Promise<Space | null> {
  const { data } = await createAdminClient()
    .from('spaces')
    .select(COLS)
    .eq('type', 'root')
    .eq('status', 'active')
    .maybeSingle()
  return data ? mapSpace(data as unknown as SpaceRow) : null
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
