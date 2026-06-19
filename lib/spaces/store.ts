// Server-side reads for Spaces (ADR-250 step 6). Resolution is by host (custom domain),
// by slug, or the root space. Reads go through the service-role admin client; the table's
// RLS already restricts public reads to active spaces. Writes (operator-managed Space
// settings) live behind app-code authz like the rest of the admin surface — added with the
// Space management UI, not here.

import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Space, SpaceStatus, SpaceType } from './types'

// The columns the Space reads project, including the brand_* fields (20260626000000_space_brand.sql).
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
  return data ? mapSpace(data) : null
}

/** The Space with this slug, or null. REQUEST-CACHED (React.cache) keyed on the normalized slug so
 *  the profile layout + each tab page resolve it at most once per request. The brand/visibility
 *  columns the profile needs ride the typed COLS plus the untyped `visibility` field below. */
export const getSpaceBySlug = cache(async (slug: string): Promise<Space | null> => {
  const norm = slug.trim().toLowerCase()
  if (!norm) return null
  // `visibility` isn't in the generated DB types yet (ADR-246) — reach it via an untyped select so
  // the profile can fail closed on Private spaces. brand_*/type ride the typed COLS.
  const { data } = (await createAdminClient()
    .from('spaces')
    .select(`${COLS}, visibility`)
    .eq('slug', norm)
    .maybeSingle()) as { data: (SpaceRow & { visibility?: string | null }) | null }
  if (!data) return null
  return mapSpace(data)
})

/** A Space's `visibility` ('network' | 'private'), defaulting to 'network' when the column is
 *  absent (pre-migration) or unset. Read alongside getSpaceBySlug so the profile can fail closed on
 *  Private spaces a viewer may not see. */
export async function getSpaceVisibility(slug: string): Promise<'network' | 'private'> {
  const norm = slug.trim().toLowerCase()
  if (!norm) return 'private'
  try {
    const { data } = (await createAdminClient()
      .from('spaces')
      .select('visibility')
      .eq('slug', norm)
      .maybeSingle()) as { data: { visibility?: string | null } | null }
    return data?.visibility === 'private' ? 'private' : 'network'
  } catch {
    return 'network'
  }
}

/**
 * The Space with this slug, but ONLY if the viewer may see it (ENTITY-SPACES-BUILD §1 / item 1).
 * A `network` (or unset) Space is visible to any viewer; a `private` Space resolves only for its
 * OWNER or an active member (server-authoritative visibility, P5). Returns null when the Space is
 * missing OR walled off from this viewer, so the route 404s identically in both cases (no
 * existence leak). REQUEST-CACHED transitively via getSpaceBySlug.
 */
export async function getVisibleSpaceBySlug(
  slug: string,
  viewerProfileId: string | null,
): Promise<Space | null> {
  const space = await getSpaceBySlug(slug)
  if (!space || space.status !== 'active') return null
  const visibility = await getSpaceVisibility(slug)
  if (visibility !== 'private') return space
  // Private: only the owner or an active member sees it. Resolve membership without importing the
  // entitlements seam (kept dependency-light): owner check + an active-member lookup.
  if (!viewerProfileId) return null
  if (space.ownerProfileId && space.ownerProfileId === viewerProfileId) return space
  const { getSpaceMembership } = await import('./membership')
  const membership = await getSpaceMembership(space.id, viewerProfileId)
  return membership && membership.status === 'active' ? space : null
}

/** A single Space by id, or null. Used by the operator admin surface (it reads through the
 *  admin client, which bypasses the active-only RLS, so suspended/archived spaces resolve). */
export async function getSpaceById(id: string): Promise<Space | null> {
  const { data } = await createAdminClient()
    .from('spaces')
    .select(COLS)
    .eq('id', id)
    .maybeSingle()
  return data ? mapSpace(data) : null
}

/** Every Space, name-ordered — the operator admin list. Admin-client read (all statuses). */
export async function listSpaces(): Promise<Space[]> {
  const { data } = await createAdminClient()
    .from('spaces')
    .select(COLS)
    .order('name', { ascending: true })
  return (data ?? []).map(mapSpace)
}

/** The canonical root Space (the Frequency app itself). */
export async function getRootSpace(): Promise<Space | null> {
  const { data } = await createAdminClient()
    .from('spaces')
    .select(COLS)
    .eq('type', 'root')
    .eq('status', 'active')
    .maybeSingle()
  return data ? mapSpace(data) : null
}

/**
 * The root Space's id, request-cached. The DEFAULT tenant for any space-scoped read whose
 * caller hasn't resolved its own space yet — so single-tenant callers keep reading the root
 * space's rows (the canary: root behaves exactly as today). FAIL-SAFE: null if the root row
 * is missing, in which case the page-settings readers degrade to their code defaults.
 */
export const loadRootSpaceId = cache(async (): Promise<string | null> => {
  try {
    const root = await getRootSpace()
    return root?.id ?? null
  } catch {
    return null
  }
})

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
