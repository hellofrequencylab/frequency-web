// Server-side reads for Spaces (ADR-250 step 6). Resolution is by host (custom domain),
// by slug, or the root space. Reads go through the service-role admin client; the table's
// RLS already restricts public reads to active spaces. Writes (operator-managed Space
// settings) live behind app-code authz like the rest of the admin surface — added with the
// Space management UI, not here.

import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Space, SpaceStatus, SpaceType } from './types'

// The columns the Space reads project, including the brand_* fields (20260626000000_space_brand.sql),
// the plan ENTITLEMENTS (20260711000000_*), and the per-function role overrides
// (20260725000000_spaces_feature_roles.sql). Projecting `entitlements` is the corrective fix for the
// latent CRM gate: it was never selected onto the Space, so spaceHasEntitlement(space,'crm') always
// read undefined and the per-Space CRM board was locked for everyone. `feature_roles` is not in the
// generated DB types yet, so it rides the untyped select tail (the ADR-246 pattern, like `visibility`).
const COLS =
  'id, slug, name, type, status, entity_id, skin, domain, network_connected, enabled_verticals, owner_profile_id, brand_name, brand_logo_url, brand_accent, entitlements, plan'

// `feature_roles` is appended to every select via this tail so a single change covers all readers; it
// is reached untyped (ADR-246) because the column is not in the generated types yet. `mode_variant` +
// `preferences` (Space Modes M2, ADR-461/464) ride the same untyped tail: the Focus sub-mode and the
// operator's Mode-preset overrides, both FRAMING only (never a gate), defaulting safe when absent.
// `cover_image_url` (20260918000000) + `tagline` ride the untyped tail too (ADR-246, not in the
// generated types yet). Both are FREE content framing, never a gate: the SpaceIdentityHeader block
// (Phase 4) reads them to paint the shared cover + subtitle. Default-safe (null) when absent.
const COLS_FULL = `${COLS}, feature_roles, mode_variant, preferences, cover_image_url, tagline`

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
  entitlements: unknown
  feature_roles?: unknown
  plan?: string | null
  mode_variant?: string | null
  preferences?: unknown
  cover_image_url?: string | null
  tagline?: string | null
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
    // Projected for the entitlement + per-function gates (lib/spaces/entitlements.ts + functions.ts).
    // Both arrive as raw jsonb and are normalized in those pure readers, so the Space carries them
    // loosely (`unknown`). `feature_roles` defaults to {} when the column is absent (pre-migration).
    entitlements: r.entitlements ?? {},
    featureRoles: r.feature_roles ?? {},
    // The billing plan label feeds the live plan-ladder gate (lib/spaces/function-access.ts). Null
    // pre-write reads as 'free' there; while billing is OFF it never gates anything.
    plan: r.plan ?? null,
    // Space Modes (ADR-461/464): the Focus sub-mode + the operator's Mode-preset overrides. Both are
    // FRAMING only (never a gate); the Mode reader (lib/spaces/modes.ts) normalizes them. Default safe
    // when the columns are absent pre-migration (null variant -> the type's default Focus; {} = no
    // overrides).
    modeVariant: r.mode_variant ?? null,
    preferences: r.preferences ?? {},
    // Phase 4 shared identity: the cover banner + tagline. FREE framing, never a gate; null-safe when
    // the column is absent (pre-migration) so every existing read behaves identically.
    coverImageUrl: r.cover_image_url ?? null,
    tagline: r.tagline ?? null,
  }
}

/** The Space serving a host (custom domain/subdomain), or null if none matches. */
export async function getSpaceByDomain(domain: string): Promise<Space | null> {
  const host = domain.trim().toLowerCase()
  if (!host) return null
  // COLS_FULL carries `feature_roles` (not in the generated types yet, ADR-246) so the cast handles it.
  const { data } = (await createAdminClient()
    .from('spaces')
    .select(COLS_FULL)
    .eq('domain', host)
    .eq('status', 'active')
    .maybeSingle()) as { data: SpaceRow | null }
  return data ? mapSpace(data) : null
}

/** The Space with this slug, or null. REQUEST-CACHED (React.cache) keyed on the normalized slug so
 *  the profile layout + each tab page resolve it at most once per request. The brand/visibility
 *  columns the profile needs ride the typed COLS plus the untyped `visibility` field below. */
export const getSpaceBySlug = cache(async (slug: string): Promise<Space | null> => {
  const norm = slug.trim().toLowerCase()
  if (!norm) return null
  // `visibility` + `feature_roles` aren't in the generated DB types yet (ADR-246) — reach them via an
  // untyped select so the profile can fail closed on Private spaces and the function gates read the
  // per-Space role overrides. brand_*/entitlements/type ride COLS_FULL.
  const { data } = (await createAdminClient()
    .from('spaces')
    .select(`${COLS_FULL}, visibility`)
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
    // Fail CLOSED on a read error: treat the Space as private so the gate 404s for non-members
    // rather than briefly exposing a Private Space (matches the empty-slug branch above).
    return 'private'
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
  // COLS_FULL carries `feature_roles` (untyped, ADR-246) so the cast handles it.
  const { data } = (await createAdminClient()
    .from('spaces')
    .select(COLS_FULL)
    .eq('id', id)
    .maybeSingle()) as { data: SpaceRow | null }
  return data ? mapSpace(data) : null
}

/** Every Space, name-ordered — the operator admin list. Admin-client read (all statuses). */
export async function listSpaces(): Promise<Space[]> {
  const { data } = (await createAdminClient()
    .from('spaces')
    .select(COLS_FULL)
    .order('name', { ascending: true })) as { data: SpaceRow[] | null }
  return (data ?? []).map(mapSpace)
}

/** The canonical root Space (the Frequency app itself). */
export async function getRootSpace(): Promise<Space | null> {
  // COLS_FULL carries `feature_roles` (untyped, ADR-246) so the cast handles it.
  const { data } = (await createAdminClient()
    .from('spaces')
    .select(COLS_FULL)
    .eq('type', 'root')
    .eq('status', 'active')
    .maybeSingle()) as { data: SpaceRow | null }
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
