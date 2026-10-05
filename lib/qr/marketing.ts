// Crew "marketing funnel" codes. A crew member can own up to 3 codes (qr_codes
// with owner_profile_id = them and purpose IS NULL — distinct from the three
// personal `purpose` codes) that point at a circle or event they're promoting, so
// they can run their own outreach funnel. Server-only.

import { createAdminClient } from '@/lib/supabase/admin'

export const MARKETING_CODE_LIMIT = 3

/**
 * The space arm of "this qr_codes row is one of a member's PERSONAL marketing codes", as a
 * PostgREST `.or(...)` filter. Pair it with `.eq('owner_profile_id', me).is('purpose', null)`.
 *
 * Personal means NOT tenant-scoped to a Space. That used to be spelled `.is('space_id', null)`,
 * but the BEFORE INSERT trigger `qr_codes_default_space_id` (20260714010000_tenancy_hardening)
 * stamps every null space_id with the ROOT Space, so no row has a null space_id any more and a
 * null-only filter matches nothing (SCAN-775: the list read 0 of 3 while the limit count said 3
 * of 3). Root is admitted explicitly, the same rule as lib/people/associations.ts and
 * lib/studio/campaigns.ts. A code stamped with any OTHER Space is a Space code (lib/qr/space-codes.ts
 * stamps owner_profile_id on those too, for scan attribution) and is neither listed here nor
 * counted against the personal quota. Without a root row (pre-migration) this degrades to the
 * null-only arm. PURE, so the list and the limit count cannot drift apart.
 */
export function personalMarketingSpaceFilter(rootSpaceId: string | null): string {
  return rootSpaceId ? `space_id.is.null,space_id.eq.${rootSpaceId}` : 'space_id.is.null'
}

export interface MarketingTarget {
  type: 'circle' | 'event'
  slug: string
  label: string
  /** Root-relative destination the code points at. */
  path: string
}

/** The circles a member belongs to + the upcoming events they host — the things
 *  they'd reasonably advertise. */
export async function listMarketingTargets(profileId: string): Promise<MarketingTarget[]> {
  const db = createAdminClient()

  const { data: mems } = await db.from('memberships').select('circle_id').eq('profile_id', profileId)
  const circleIds = (mems ?? []).map((m) => m.circle_id)

  const [{ data: circles }, { data: events }] = await Promise.all([
    circleIds.length
      ? db.from('circles').select('slug, name').in('id', circleIds).order('name')
      : Promise.resolve({ data: [] as { slug: string; name: string }[] }),
    db
      .from('events')
      .select('slug, title, starts_at')
      .eq('host_id', profileId)
      .gte('starts_at', new Date().toISOString())
      .order('starts_at')
      .limit(50),
  ])

  return [
    ...(circles ?? []).map((c) => ({
      type: 'circle' as const,
      slug: c.slug,
      label: c.name,
      path: `/circles/${c.slug}`,
    })),
    ...(events ?? []).map((e) => ({
      type: 'event' as const,
      slug: e.slug,
      label: e.title,
      path: `/events/${e.slug}`,
    })),
  ]
}

/** A destination is a valid marketing target only if it points at a circle or
 *  event page (root-relative). Keeps these codes on-mission, not arbitrary links. */
export function isValidMarketingPath(path: string): boolean {
  return /^\/circles\/[\w-]+$/.test(path) || /^\/events\/[\w-]+$/.test(path)
}
