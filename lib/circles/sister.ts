// Sister Circles (LIVE-665): a Circle that fills up seeds a new one instead of turning people away.
// The offer is pure (sisterCircleOffer); the seed copies the Circle's shape into a private DRAFT the
// starter hosts, exactly as a Starter Circle remix does (lib/circles/remix.ts), and stamps
// circles.seeded_from_circle_id (20270346001800) so the lineage can be read back. Publishing the
// draft goes through publishCircle, so the hosting allowance is checked there and not twice.
// Server-only for the seed (admin client; the action gates the caller).

import { createAdminClient } from '@/lib/supabase/admin'
import { slugify } from '@/lib/utils'
import { ensureHostOnOwnership } from './remix'

/** A Circle counts as nearly full at nine tenths of its cap: the same line the Circle header's
 *  seat bar uses. */
const NEARLY_FULL = 0.9

/** Who is offered a sister Circle, and why. PURE.
 *  - the HOST, once the Circle is nearly full, so they can split before anyone is turned away;
 *  - a signed-in NON-MEMBER who finds it full, so "Full" is not the end of the road.
 *  Never on a Circle that is not live, and never to a signed-out visitor. */
export function sisterCircleOffer(input: {
  memberCount: number
  memberCap: number
  isLive: boolean
  signedIn: boolean
  isHost: boolean
  isMember: boolean
}): 'host' | 'full' | null {
  if (!input.isLive || !input.signedIn || input.memberCap <= 0) return null
  if (input.isHost) return input.memberCount >= input.memberCap * NEARLY_FULL ? 'host' : null
  if (!input.isMember && input.memberCount >= input.memberCap) return 'full'
  return null
}

/** The sister's name: the original's, marked as its sister, within the name length a Circle takes. */
export function sisterCircleName(name: string): string {
  const base = name.trim() || 'Circle'
  return `${base.slice(0, 100)} (Sister Circle)`
}

type CircleShape = {
  id: string
  name: string
  about: string | null
  type: string
  access: string | null
  member_cap: number
  primary_pillar: string | null
  origin_template_id: string | null
  space_id: string | null
  hub_id: string | null
  topical_channel_id: string | null
  city: string | null
  neighborhood: string | null
  timezone: string | null
  latitude: number | null
  longitude: number | null
  status: string
}

const SHAPE_COLUMNS =
  'id, name, about, type, access, member_cap, primary_pillar, origin_template_id, space_id, hub_id, topical_channel_id, city, neighborhood, timezone, latitude, longitude, status'

/** Seed a sister Circle from `circleId` as a private draft `profileId` hosts. Returns its slug. */
export async function seedSisterCircle(input: { circleId: string; profileId: string }): Promise<{ circleId: string; slug: string }> {
  const admin = createAdminClient()
  const { data, error: readErr } = await admin.from('circles').select(SHAPE_COLUMNS).eq('id', input.circleId).maybeSingle()
  if (readErr || !data) throw new Error('That Circle is not available.')
  const src = data as unknown as CircleShape
  if (src.status !== 'forming' && src.status !== 'active') throw new Error('Only a live Circle can seed a sister Circle.')

  const name = sisterCircleName(src.name)
  let slug = slugify(name) || 'circle'
  const { data: taken } = await admin.from('circles').select('id').eq('slug', slug).maybeSingle()
  if (taken) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`

  // seeded_from_circle_id is newer than the generated types, so the payload is cast (ADR-246), as
  // remixTemplate does for status 'draft'.
  const { data: created, error } = await admin
    .from('circles')
    .insert({
      name,
      about: src.about,
      type: src.type,
      ...(src.access ? { access: src.access } : {}),
      member_cap: src.member_cap,
      status: 'draft',
      slug,
      host_id: input.profileId,
      member_count: 0,
      primary_pillar: src.primary_pillar,
      origin_template_id: src.origin_template_id,
      space_id: src.space_id,
      hub_id: src.hub_id,
      topical_channel_id: src.topical_channel_id,
      city: src.city,
      neighborhood: src.neighborhood,
      timezone: src.timezone,
      latitude: src.latitude,
      longitude: src.longitude,
      seeded_from_circle_id: src.id,
    } as never)
    .select('id')
    .single()
  if (error || !created) throw new Error(error?.message ?? 'Could not start the sister Circle.')
  const circleId = String((created as { id: string }).id)

  // The original's written shape travels too (meetup, agreements, format), best-effort: the draft
  // is still a Circle without it, and the host edits it before publishing.
  try {
    const { data: profile } = await admin
      .from('circle_profiles')
      .select('pillars_inside, meetup, gathering, thread, format, size_label, agreements, recommended_journey_pillar, remix_options')
      .eq('circle_id', src.id)
      .maybeSingle()
    if (profile) await admin.from('circle_profiles').insert({ ...(profile as object), circle_id: circleId } as never)
  } catch {
    /* the profile copy is best-effort */
  }

  await admin
    .from('memberships')
    .upsert(
      { profile_id: input.profileId, circle_id: circleId, status: 'active', volunteer_role: 'host' },
      { onConflict: 'profile_id,circle_id' },
    )
  await ensureHostOnOwnership(input.profileId)
  return { circleId, slug }
}
