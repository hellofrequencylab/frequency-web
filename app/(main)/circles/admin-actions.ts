'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getCircleCapabilities } from '@/lib/core/load-capabilities'
import { getMyProfileId } from '@/lib/auth'
import { logAdminAction } from '@/lib/admin/audit'
import { listPublicPractices, getCircleActivePractice } from '@/lib/practices'
import {
  getCircleChallenges,
  listAdoptableChallenges,
  type CircleChallenge,
  type AdoptableChallenge,
} from '@/lib/circles/challenges'
import { slugify, isoDaysAgo } from '@/lib/utils'
import { isValidTimeZone } from '@/lib/time/zone'
import { getCircleEarnedZaps } from '@/lib/circles/earned'
import type { Database } from '@/lib/database.types'

/** A small {id, title, href} entry for one of the circle's adopted Quest items. */
export interface CircleQuestItem {
  id: string
  title: string
  href: string
}

/** The Journeys, Practices, and Challenges this circle has adopted. Journeys and
 *  practices are simple links; challenges carry the circle's collective progress
 *  (the circle adopts a global season challenge to do together). */
export interface CircleQuestAdoptions {
  journeys: CircleQuestItem[]
  practices: CircleQuestItem[]
  challenges: CircleChallenge[]
}

// The journey/practice link tables aren't in the generated Database types (fresh
// migrations), so we read them through an untyped admin handle — the repo convention
// from lib/practices.ts / lib/journey-plans.ts. The capability gate in the caller is
// the authority either way.
function untyped(): SupabaseClient {
  return createAdminClient()
}

/** Load what this circle has adopted, honestly sourced from the real schema:
 *  - PRACTICES: every distinct practice the host has ever set as the circle's
 *    practice (circle_practices → practices). The active one floats to the top.
 *  - JOURNEYS: journeys currently adopted by this circle's active members
 *    (journey_plan_adoptions ∩ memberships) — the only circle-scoped journey signal.
 *  - CHALLENGES: global season challenges the circle has adopted to do together
 *    (circle_challenge_adoptions), each with the circle's collective progress.
 *  Caller gates on circle.editSettings. */
async function getCircleQuestAdoptions(circleId: string): Promise<CircleQuestAdoptions> {
  const db = untyped()

  // Practices this circle has adopted (current + past), newest first; the active one
  // is surfaced first. circle_practices may carry the same practice more than once
  // over time, so de-dupe by practice id.
  const practicesP = db
    .from('circle_practices')
    .select('active, created_at, practice:practices(id, title)')
    .eq('circle_id', circleId)
    .order('active', { ascending: false })
    .order('created_at', { ascending: false })
    .then(({ data }) => {
      const rows =
        (data as unknown as { active: boolean; practice: { id: string; title: string } | null }[] | null) ?? []
      const seen = new Set<string>()
      const out: CircleQuestItem[] = []
      for (const r of rows) {
        const p = r.practice
        if (!p || seen.has(p.id)) continue
        seen.add(p.id)
        out.push({ id: p.id, title: p.title, href: `/practices/${p.id}` })
      }
      return out
    })

  // Journeys this circle is on = journeys its active members have actively adopted.
  const journeysP = (async (): Promise<CircleQuestItem[]> => {
    const { data: memberRows } = await db
      .from('memberships')
      .select('profile_id')
      .eq('circle_id', circleId)
      .eq('status', 'active')
    const memberIds = [...new Set(((memberRows ?? []) as { profile_id: string }[]).map((m) => m.profile_id))]
    if (memberIds.length === 0) return []

    const { data: adoptionRows } = await db
      .from('journey_plan_adoptions')
      .select('plan:journey_plans(id, slug, title)')
      .eq('active', true)
      .in('profile_id', memberIds)
    const seen = new Set<string>()
    const out: CircleQuestItem[] = []
    for (const r of (adoptionRows ?? []) as unknown as { plan: { id: string; slug: string; title: string } | null }[]) {
      const plan = r.plan
      if (!plan || seen.has(plan.id)) continue
      seen.add(plan.id)
      out.push({ id: plan.id, title: plan.title, href: `/journeys/${plan.slug}` })
    }
    return out
  })()

  const [practices, journeys, challenges] = await Promise.all([
    practicesP,
    journeysP,
    getCircleChallenges(circleId),
  ])
  return { journeys, practices, challenges }
}

// In-place "Circle settings" admin module (EMBEDDED-ADMIN.md / ADR-133, Phase-2
// pilot). Both the read and the write re-resolve the per-circle capability set via
// getCircleCapabilities — the dock's role-gated visibility is UX only; THIS is the
// authority (capabilities are law, capabilities.ts). The admin client bypasses
// RLS, so the check here — not RLS — is what protects the mutation.

/** Load the editable fields of a circle, but only for a viewer who may edit it.
 *  Returns null when the circle is missing or the caller lacks circle.editSettings
 *  (so the module renders no chrome for someone who can't manage this circle). */
export async function getCircleAdminData(slug: string) {
  const admin = createAdminClient()
  const { data: circle } = await admin
    .from('circles')
    .select('id, slug, name, about, type, member_cap, status, image_url, unlisted')
    .eq('slug', slug)
    .maybeSingle()
  if (!circle) return null

  const caps = await getCircleCapabilities(circle.id)
  if (!caps.has('circle.editSettings')) return null

  // Also load the practice picker data ("This week's practice" lives here now) plus
  // the Circle Quest adoptions (journeys / practices / challenges) the module lists,
  // and the global challenges the host could still adopt for the circle.
  const [practice_library, activePractice, adoptions, adoptableChallenges] = await Promise.all([
    listPublicPractices(),
    getCircleActivePractice(circle.id),
    getCircleQuestAdoptions(circle.id),
    listAdoptableChallenges(circle.id),
  ])

  return {
    id: circle.id,
    slug: circle.slug,
    name: circle.name,
    about: circle.about,
    type: circle.type,
    member_cap: circle.member_cap,
    status: circle.status,
    image_url: circle.image_url,
    unlisted: circle.unlisted ?? false,
    practice_library: practice_library.map((p) => ({ id: p.id, title: p.title })),
    active_practice_id: activePractice?.id ?? null,
    adoptedJourneys: adoptions.journeys,
    adoptedPractices: adoptions.practices,
    adoptedChallenges: adoptions.challenges,
    adoptableChallenges,
  }
}

/** Adopt a global season challenge for this circle to do together. Re-checks
 *  circle.editSettings (capabilities are law; the admin client bypasses RLS, so
 *  THIS gate — not RLS — protects the write). Idempotent via the
 *  (circle_id, challenge_id) unique constraint. */
export async function adoptCircleChallenge(
  circleId: string,
  slug: string,
  challengeId: string,
): Promise<{ ok: true } | { error: string }> {
  const caps = await getCircleCapabilities(circleId)
  if (!caps.has('circle.editSettings')) return { error: 'Unauthorized' }
  if (!challengeId) return { error: 'Pick a challenge.' }

  // Resolve the acting host for attribution (best-effort; column is null-ok).
  const { getMyProfileId } = await import('@/lib/auth')
  const myProfileId = await getMyProfileId().catch(() => null)

  const { error } = await (untyped() as unknown as {
    from: (t: string) => {
      upsert: (
        v: Record<string, unknown>,
        o: { onConflict: string; ignoreDuplicates: boolean },
      ) => Promise<{ error: { message: string } | null }>
    }
  })
    .from('circle_challenge_adoptions')
    .upsert(
      { circle_id: circleId, challenge_id: challengeId, adopted_by: myProfileId ?? null },
      { onConflict: 'circle_id,challenge_id', ignoreDuplicates: true },
    )
  if (error) return { error: error.message }

  revalidatePath(`/circles/${slug}`)
  return { ok: true }
}

/** Drop a circle's adopted challenge. Per-member challenge_progress is untouched —
 *  this only removes the circle framing. Re-checks circle.editSettings. */
export async function dropCircleChallenge(
  circleId: string,
  slug: string,
  challengeId: string,
): Promise<{ ok: true } | { error: string }> {
  const caps = await getCircleCapabilities(circleId)
  if (!caps.has('circle.editSettings')) return { error: 'Unauthorized' }

  const { error } = await untyped()
    .from('circle_challenge_adoptions')
    .delete()
    .eq('circle_id', circleId)
    .eq('challenge_id', challengeId)
  if (error) return { error: error.message }

  revalidatePath(`/circles/${slug}`)
  return { ok: true }
}

/** Patch the day-to-day circle settings in place. Re-checks circle.editSettings
 *  before writing; leaves host_id / hub_id untouched (host/hub reassignment stays
 *  in the full admin editor). */
export async function updateCircleSettings(id: string, slug: string, fd: FormData) {
  const caps = await getCircleCapabilities(id)
  if (!caps.has('circle.editSettings')) throw new Error('Unauthorized')

  const admin = createAdminClient()
  const { error } = await admin
    .from('circles')
    .update({
      name: (fd.get('name') as string).trim(),
      about: ((fd.get('about') as string) ?? '').trim() || null,
      type: fd.get('type') as Database['public']['Enums']['circle_type'],
      member_cap: parseInt(fd.get('member_cap') as string, 10) || 12,
      status: fd.get('status') as Database['public']['Enums']['group_status'],
      // Unlisted keeps the circle off discovery (index/map/directory/sitemap) while it stays reachable
      // by direct link and visible to members. Only written when the rail form includes the field.
      ...(fd.has('unlisted') ? { unlisted: fd.get('unlisted') === 'on' } : {}),
    })
    .eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath(`/circles/${slug}`)
  revalidatePath('/circles')
}

// Cover image: upload to the public `site-media` bucket and persist image_url, or
// clear it. Both re-check circle.editSettings (capabilities are law). Mirrors the
// Puck uploader (lib/page-editor/upload-action.ts) but gated per-circle, not staff.
export async function uploadCircleCover(
  id: string,
  slug: string,
  formData: FormData,
): Promise<{ url: string } | { error: string }> {
  const caps = await getCircleCapabilities(id)
  if (!caps.has('circle.editSettings')) return { error: 'Unauthorized' }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: 'No file selected.' }
  if (file.size > 8 * 1024 * 1024) return { error: 'Image must be under 8MB.' }
  // Safe raster types only. The public site-media bucket has no MIME constraint, so an arbitrary
  // content-type (text/html, image/svg+xml) would serve EXECUTABLE from the stored CDN URL (stored
  // XSS). SVG is excluded deliberately (it can carry script).
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'].includes(file.type)) {
    return { error: 'Use a JPEG, PNG, WebP, GIF, or AVIF image.' }
  }

  const admin = createAdminClient()
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
  const path = `circles/${id}/${Date.now()}-${Math.round(Math.random() * 1e6).toString(36)}.${ext}`
  const bytes = new Uint8Array(await file.arrayBuffer())

  const { error: upErr } = await admin.storage
    .from('site-media')
    .upload(path, bytes, { contentType: file.type || 'image/jpeg', upsert: false })
  if (upErr) return { error: upErr.message }

  const { data } = admin.storage.from('site-media').getPublicUrl(path)
  const { error: dbErr } = await admin.from('circles').update({ image_url: data.publicUrl }).eq('id', id)
  if (dbErr) return { error: dbErr.message }

  revalidatePath(`/circles/${slug}`)
  revalidatePath('/circles')
  return { url: data.publicUrl }
}

export async function removeCircleCover(id: string, slug: string) {
  const caps = await getCircleCapabilities(id)
  if (!caps.has('circle.editSettings')) throw new Error('Unauthorized')

  const admin = createAdminClient()
  const { error } = await admin.from('circles').update({ image_url: null }).eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath(`/circles/${slug}`)
  revalidatePath('/circles')
}

// The admin client's generated types don't cover every write surface used below; cast to an
// untyped update surface for those, with the capability gate above as the real authority.
type UntypedUpdate = {
  from: (t: string) => {
    update: (v: Record<string, unknown>) => {
      eq: (c: string, val: string) => Promise<{ error: { message: string } | null }>
    }
  }
}

/** Rename a circle's permalink. Slugifies the input, rejects empty, and ensures the
 *  new slug is unique across circles before writing. Returns the new slug so the
 *  client can redirect the page. Re-checks circle.editSettings. */
export async function updateCirclePermalink(
  id: string,
  slug: string,
  newSlug: string,
): Promise<{ slug: string } | { error: string }> {
  const caps = await getCircleCapabilities(id)
  if (!caps.has('circle.editSettings')) return { error: 'Unauthorized' }

  const next = slugify(newSlug ?? '')
  if (!next) return { error: 'Permalink cannot be empty.' }

  const admin = createAdminClient()

  if (next !== slug) {
    const { data: clash } = await admin
      .from('circles')
      .select('id')
      .eq('slug', next)
      .neq('id', id)
      .maybeSingle()
    if (clash) return { error: 'That permalink is already taken.' }
  }

  const { error } = await (admin as unknown as UntypedUpdate)
    .from('circles')
    .update({ slug: next })
    .eq('id', id)
  if (error) return { error: error.message }

  revalidatePath(`/circles/${slug}`)
  revalidatePath(`/circles/${next}`)
  revalidatePath('/circles')
  return { slug: next }
}

/**
 * Permanently delete a circle. Gated on circle.editSettings (its host, a managing
 * guide/mentor of the parent, or staff) — the same gate as editing it. The capability
 * re-check is the FIRST statement (the authz scan is file-level, not a per-function
 * prover). FK cascades clear memberships, invites, circle_practices, tasks, awards;
 * the polymorphic refs (posts/events scope, stewardship edges) carry no FK, so they
 * are unlinked here in the same call. Irreversible — the UI requires a typed confirm.
 */
export async function deleteCircle(id: string, slug: string): Promise<{ error?: string }> {
  const caps = await getCircleCapabilities(id)
  if (!caps.has('circle.editSettings')) throw new Error('Unauthorized')

  const admin = createAdminClient()
  const { data: circle } = await admin.from('circles').select('name').eq('id', id).maybeSingle()

  // Unlink polymorphic references first (no FK to cascade them). Posts scoped to the
  // circle are unlinked to the public feed; circle-scoped events keep their (now-dead)
  // scope_id — harmless, they just resolve no circle context — since events.scope_id
  // is non-nullable and force-deleting them would cascade their RSVPs.
  await admin.from('posts').update({ scope_id: null }).eq('scope_id', id)
  await admin.from('stewardships').delete().eq('scope_type', 'circle').eq('scope_id', id)

  const { error } = await admin.from('circles').delete().eq('id', id)
  if (error) return { error: error.message }

  const actorId = await getMyProfileId().catch(() => null)
  await logAdminAction({
    actorId,
    action: 'circle.delete',
    targetType: 'circle',
    targetId: id,
    detail: { slug, name: (circle as { name?: string } | null)?.name ?? null },
  })

  revalidatePath('/circles')
  revalidatePath(`/circles/${slug}`)
  revalidatePath('/admin/circles')
  return {}
}

// ─── This week's practice (the 'engage' spine module — ADR-515 Phase 4) ─────────
// The host-assigned "This week's practice" picker, extracted out of Circle Quest into its own rail
// module (circle.practice). The read re-checks circle.assignTask (the engage authority + the SAME
// capability the module declares); it returns null for anyone else, so the module renders nothing.
// Setting the practice reuses setCirclePracticeAction (gated circle.editSettings, co-granted to a
// circle leader — so the write gate is never weaker than the read gate).

export interface CirclePracticeAssignData {
  circleId: string
  slug: string
  library: { id: string; title: string }[]
  activePracticeId: string | null
}

export async function getCirclePracticeAssignData(slug: string): Promise<CirclePracticeAssignData | null> {
  const admin = createAdminClient()
  const { data: circle } = await admin.from('circles').select('id, slug').eq('slug', slug).maybeSingle()
  if (!circle) return null

  const caps = await getCircleCapabilities(circle.id)
  if (!caps.has('circle.assignTask')) return null

  const [library, activePractice] = await Promise.all([
    listPublicPractices(),
    getCircleActivePractice(circle.id),
  ])
  return {
    circleId: circle.id,
    slug: circle.slug,
    library: library.map((p) => ({ id: p.id, title: p.title })),
    activePracticeId: activePractice?.id ?? null,
  }
}

// ─── Insights (the 'insights' spine module — ADR-515 Phase 4) ───────────────────
// The circle's honest, circle-scoped health: Zaps earned THROUGH this circle (its practice logs +
// Expression-at-Circle, via getCircleEarnedZaps), active member streaks, and members who joined this
// week. Mirrors the page body's health reads (components/widgets/circles/circle-health). The read
// re-checks circle.editSettings and returns null for anyone else (fail-safe).

export interface CircleInsightsData {
  circleId: string
  zapsEarned: number
  activeStreaks: number
  newThisWeek: number
}

export async function getCircleInsightsData(slug: string): Promise<CircleInsightsData | null> {
  const admin = createAdminClient()
  const { data: circle } = await admin.from('circles').select('id').eq('slug', slug).maybeSingle()
  if (!circle) return null

  const caps = await getCircleCapabilities(circle.id)
  if (!caps.has('circle.editSettings')) return null

  const { data: memberRows } = await admin
    .from('memberships')
    .select('profile_id')
    .eq('circle_id', circle.id)
    .eq('status', 'active')
  const memberIds = [...new Set(((memberRows ?? []) as { profile_id: string }[]).map((m) => m.profile_id))]

  const weekAgo = isoDaysAgo(7)
  const [zapsEarned, { data: streakRows }, { data: recentJoins }] = await Promise.all([
    getCircleEarnedZaps(circle.id),
    memberIds.length > 0
      ? admin.from('profiles').select('current_streak').in('id', memberIds)
      : Promise.resolve({ data: [] as { current_streak: number | null }[] }),
    admin
      .from('memberships')
      .select('id')
      .eq('circle_id', circle.id)
      .eq('status', 'active')
      .gte('joined_at', weekAgo),
  ])

  const activeStreaks = ((streakRows ?? []) as { current_streak: number | null }[]).filter(
    (p) => (p.current_streak ?? 0) > 0,
  ).length

  return {
    circleId: circle.id,
    zapsEarned,
    activeStreaks,
    newThisWeek: recentJoins?.length ?? 0,
  }
}

// ─── Place & Time (the 'place' spine module) ───────────────────────────────────
// Where + when the circle meets: in person or online, the neighborhood/city, the map pin, and the
// time zone. Read + write both re-resolve circle.editSettings server-side (the admin client bypasses
// RLS, so THIS gate — not RLS — is the authority). circles.geog is a GENERATED column derived from
// latitude/longitude, so writing the lat/lng columns keeps the map + the near-me RPC in sync.

/** The meeting fields the Place & Time module edits. Returns null unless the caller holds
 *  circle.editSettings (visibility is enforced here, not in the client). */
export async function getCirclePlaceTimeData(slug: string) {
  const admin = createAdminClient()
  const { data: circle } = await admin
    .from('circles')
    .select('id, slug, type, timezone, neighborhood, city, latitude, longitude')
    .eq('slug', slug)
    .maybeSingle()
  if (!circle) return null

  const caps = await getCircleCapabilities(circle.id)
  if (!caps.has('circle.editSettings')) return null

  return circle
}

export async function updateCirclePlaceTime(id: string, slug: string, fd: FormData) {
  const caps = await getCircleCapabilities(id)
  if (!caps.has('circle.editSettings')) throw new Error('Unauthorized')

  const admin = createAdminClient()

  const typeRaw = ((fd.get('type') as string) ?? '').trim()
  const type = typeRaw === 'online' ? 'online' : 'in-person'

  // Time zone: only a valid IANA zone is written, else the column is left unchanged.
  const zoneRaw = ((fd.get('timezone') as string) ?? '').trim()
  const timezone = isValidTimeZone(zoneRaw) ? zoneRaw : undefined

  const update: Record<string, unknown> = { type }
  if (timezone !== undefined) update.timezone = timezone

  if (type === 'online') {
    // Going online clears the physical meeting place (the map + near-me RPC then skip it).
    update.neighborhood = null
    update.city = null
    update.latitude = null
    update.longitude = null
  } else {
    update.neighborhood = ((fd.get('neighborhood') as string) ?? '').trim() || null
    update.city = ((fd.get('city') as string) ?? '').trim() || null
    // Manual map pin: a valid lat/lng pair persists the meeting spot; empty/NaN clears it.
    const latRaw = ((fd.get('lat') as string) ?? '').trim()
    const lngRaw = ((fd.get('lng') as string) ?? '').trim()
    const latNum = latRaw ? Number(latRaw) : NaN
    const lngNum = lngRaw ? Number(lngRaw) : NaN
    const valid =
      Number.isFinite(latNum) && Number.isFinite(lngNum) && Math.abs(latNum) <= 90 && Math.abs(lngNum) <= 180
    update.latitude = valid ? latNum : null
    update.longitude = valid ? lngNum : null
  }

  const { error } = await (admin as unknown as UntypedUpdate).from('circles').update(update).eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath(`/circles/${slug}`)
  revalidatePath('/circles')
}

// ─── People (the 'people' spine module) ────────────────────────────────────────
// The active roster, each member's crew role, how full the circle is, and the host invite tools.
// Gated on circle.moderate (the same principals who moderate the circle); the read returns null for
// anyone else so the module renders nothing. Invites reuse the existing circle actions
// (createHostInviteLink / inviteByEmail), each with its own server-side gate.

export interface CirclePeopleMember {
  profileId: string
  displayName: string
  handle: string | null
  avatarUrl: string | null
  role: string | null
  isHost: boolean
}

export interface CirclePeopleData {
  circleId: string
  slug: string
  memberCount: number
  memberCap: number
  crewCount: number
  members: CirclePeopleMember[]
}

export async function getCirclePeopleData(slug: string): Promise<CirclePeopleData | null> {
  const admin = createAdminClient()
  const { data: circle } = await admin
    .from('circles')
    .select('id, slug, member_count, member_cap, host_id')
    .eq('slug', slug)
    .maybeSingle()
  if (!circle) return null

  const caps = await getCircleCapabilities(circle.id)
  if (!caps.has('circle.moderate')) return null

  const { data: rows } = await admin
    .from('memberships')
    .select('profile_id, volunteer_role, joined_at, profile:profiles(id, display_name, handle, avatar_url)')
    .eq('circle_id', circle.id)
    .eq('status', 'active')
    .order('joined_at', { ascending: true })

  type PeopleRow = {
    profile_id: string
    volunteer_role: string | null
    profile: { id: string; display_name: string | null; handle: string | null; avatar_url: string | null } | null
  }
  const list: CirclePeopleMember[] = ((rows ?? []) as unknown as PeopleRow[]).map((r) => ({
    profileId: r.profile_id,
    displayName: r.profile?.display_name ?? 'Member',
    handle: r.profile?.handle ?? null,
    avatarUrl: r.profile?.avatar_url ?? null,
    role: r.volunteer_role,
    isHost: r.profile_id === circle.host_id,
  }))
  // Crew = anyone carrying a volunteer role above plain member.
  const crewCount = list.filter((m) => m.role && m.role !== 'member').length
  // Host floats to the top; the rest keep join order.
  list.sort((a, b) => (a.isHost === b.isHost ? 0 : a.isHost ? -1 : 1))

  return {
    circleId: circle.id,
    slug: circle.slug,
    memberCount: circle.member_count,
    memberCap: circle.member_cap,
    crewCount,
    members: list.slice(0, 8),
  }
}

// ─── Engage (the 'engage' spine module) ────────────────────────────────────────
// The shared season challenges the circle has taken on together, each with collective member
// progress, plus the ones it could still adopt. Reads the existing challenge layer (getCircleChallenges
// / listAdoptableChallenges); adopting + dropping reuse adoptCircleChallenge / dropCircleChallenge
// above. The read re-checks circle.assignTask (the gate for the Engage cell per Appendix A).

export interface CircleEngageData {
  circleId: string
  slug: string
  adopted: CircleChallenge[]
  adoptable: AdoptableChallenge[]
}

export async function getCircleEngageData(slug: string): Promise<CircleEngageData | null> {
  const admin = createAdminClient()
  const { data: circle } = await admin.from('circles').select('id, slug').eq('slug', slug).maybeSingle()
  if (!circle) return null

  const caps = await getCircleCapabilities(circle.id)
  if (!caps.has('circle.assignTask')) return null

  const [adopted, adoptable] = await Promise.all([
    getCircleChallenges(circle.id),
    listAdoptableChallenges(circle.id),
  ])
  return { circleId: circle.id, slug: circle.slug, adopted, adoptable }
}
