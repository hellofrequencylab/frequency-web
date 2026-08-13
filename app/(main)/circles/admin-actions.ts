'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCircleCapabilities } from '@/lib/core/load-capabilities'
import { getMyProfileId } from '@/lib/auth'
import { isLoomPublicImageUrl } from '@/lib/loom/urls'
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
import { setCircleChannel } from '@/lib/channels/programs'
import { writeCircleCoverFocus, writeCircleHeroHeight } from '@/lib/circles/hero'
import {
  accessModeOptions,
  asCircleAccess,
  availableAccessModes,
  CIRCLE_ACCESS_LIMIT_NOTE,
  CIRCLE_ACCESS_MODES,
} from '@/lib/circles/visibility'
import { writeCoverScrimSetting, type CoverScrim } from '@/lib/layout/cover-scrim'
import type { Database, Json } from '@/lib/database.types'

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


/** Load what this circle has adopted, honestly sourced from the real schema:
 *  - PRACTICES: every distinct practice the host has ever set as the circle's
 *    practice (circle_practices → practices). The active one floats to the top.
 *  - JOURNEYS: journeys currently adopted by this circle's active members
 *    (journey_plan_adoptions ∩ memberships) — the only circle-scoped journey signal.
 *  - CHALLENGES: global season challenges the circle has adopted to do together
 *    (circle_challenge_adoptions), each with the circle's collective progress.
 *  Caller gates on circle.editSettings. */
async function getCircleQuestAdoptions(circleId: string): Promise<CircleQuestAdoptions> {
  const db = createAdminClient()

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

/** One Pillar's worth of Channel choices for the circle-settings picker
 *  (Pillar > Channel > Circle, NAMING.md). */
export interface ChannelOptionGroup {
  pillar: string
  channels: { id: string; name: string; paused: boolean }[]
}

/** The Channel picker's choices: active topical_channels grouped by Pillar
 *  (topical_channels.pillar_id → pillars), in display order. The circle's
 *  CURRENT channel stays in the list even when paused, so the select tells the
 *  truth about where the circle practices today — the write action refuses a
 *  paused target either way. Channels without a pillar land in a trailing
 *  group so nothing curated silently disappears. */
async function listChannelOptionGroups(currentChannelId: string | null): Promise<ChannelOptionGroup[]> {
  const db = createAdminClient()
  const [pillarsRes, channelsRes] = await Promise.all([
    db.from('pillars').select('id, name, display_order').eq('is_active', true).order('display_order'),
    db
      .from('topical_channels')
      .select('id, name, pillar_id, is_active, display_order')
      .eq('is_active', true)
      .order('display_order'),
  ])
  const pillars = (pillarsRes.data ?? []) as { id: string; name: string }[]
  const channels = (channelsRes.data ?? []) as {
    id: string
    name: string
    pillar_id: string | null
    is_active: boolean
  }[]

  if (currentChannelId && !channels.some((c) => c.id === currentChannelId)) {
    const { data } = await db
      .from('topical_channels')
      .select('id, name, pillar_id, is_active')
      .eq('id', currentChannelId)
      .maybeSingle()
    if (data) channels.push(data as (typeof channels)[number])
  }

  const toOption = (c: (typeof channels)[number]) => ({
    id: c.id,
    name: c.name,
    paused: c.is_active === false,
  })
  const groups: ChannelOptionGroup[] = pillars
    .map((p) => ({
      pillar: p.name,
      channels: channels.filter((c) => c.pillar_id === p.id).map(toOption),
    }))
    .filter((g) => g.channels.length > 0)
  const loose = channels.filter((c) => !pillars.some((p) => p.id === c.pillar_id))
  if (loose.length > 0) groups.push({ pillar: 'More Channels', channels: loose.map(toOption) })
  return groups
}

/** The two facts `availableAccessModes` decides over: is this a REAL Space (a personal Circle sits
 *  on the root sentinel), and is it on a plan that may sell. Returned as null for a Circle with no
 *  `space_id` at all, which `availableAccessModes` already reads as personal. */
async function readOwningSpaceFacts(
  spaceId: string | null,
): Promise<{ type: string | null; plan: string | null } | null> {
  if (!spaceId) return null
  const { data } = await createAdminClient()
    .from('spaces')
    .select('type, plan')
    .eq('id', spaceId)
    .maybeSingle()
  return (data as { type: string | null; plan: string | null } | null) ?? null
}

/** Load the editable fields of a circle, but only for a viewer who may edit it.
 *  Returns null when the circle is missing or the caller lacks circle.editSettings
 *  (so the module renders no chrome for someone who can't manage this circle). */
export async function getCircleAdminData(slug: string) {
  const admin = createAdminClient()
  const { data: circle } = await admin
    .from('circles')
    .select(
      'id, slug, name, about, type, member_cap, status, image_url, unlisted, access, space_id, topical_channel_id',
    )
    .eq('slug', slug)
    .maybeSingle()
  if (!circle) return null

  const caps = await getCircleCapabilities(circle.id)
  if (!caps.has('circle.editSettings')) return null

  // Also load the practice picker data ("This week's practice" lives here now) plus
  // the Circle Quest adoptions (journeys / practices / challenges) the module lists,
  // the global challenges the host could still adopt for the circle, the Channel
  // picker's Pillar-grouped choices (ADR-871), and the header presentation bag
  // (circles.theme — read through its own tolerant helper, NOT this function's main
  // select, so a not-yet-applied theme migration can never null out the whole module).
  const [practice_library, activePractice, adoptions, adoptableChallenges, channelGroups, theme, space] =
    await Promise.all([
      listPublicPractices(),
      getCircleActivePractice(circle.id),
      getCircleQuestAdoptions(circle.id),
      listAdoptableChallenges(circle.id),
      listChannelOptionGroups(circle.topical_channel_id ?? null),
      readCircleTheme(circle.id),
      readOwningSpaceFacts(circle.space_id ?? null),
    ])

  // AXIS 2 (ADR-1015). The modes to OFFER are narrowed by the owning Space, because
  // `trg_circles_access_shape` refuses the two Space modes on a personal Circle and refuses `tier`
  // below a selling plan — and a mode the trigger refuses reads to a host as a broken save button.
  const access = asCircleAccess(circle.access)

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
    access,
    access_modes: accessModeOptions(space, access),
    /** True when the Space narrows the list, so the control can show the one note that says why. */
    access_limited: availableAccessModes(space).length < CIRCLE_ACCESS_MODES.length,
    theme,
    topical_channel_id: circle.topical_channel_id ?? null,
    channel_groups: channelGroups,
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

  const { error } = await createAdminClient()
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

  const { error } = await createAdminClient()
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

/** Turn a database refusal into something a host can act on. `trg_circles_access_shape` raises its
 *  two rules as bare codes (`circle_access_needs_space`, `circle_access_plan_floor`), which is the
 *  right thing for a trigger and the wrong thing for a rail. Anything else stays generic on
 *  purpose: a raw Postgres message is not member-facing copy. */
function readableAccessError(message: string): string {
  if (message.includes('circle_access_needs_space') || message.includes('circle_access_plan_floor')) {
    return CIRCLE_ACCESS_LIMIT_NOTE
  }
  return 'Could not save that. Try again.'
}

/** AXIS 2 (ADR-1015): set WHO MAY ENTER this circle. Its own action rather than a field on the
 *  autosave form, for the same reason the Channel select has one: the save can be REFUSED, and an
 *  expected refusal is a return value, not a throw (a thrown server-action message is redacted in
 *  production, so the host would see nothing they could act on).
 *
 *  Three gates, narrowest first. `circle.editSettings` (capabilities are law, and the admin client
 *  bypasses RLS so THIS is what protects the write); then the same `availableAccessModes` the
 *  control narrows its list with, re-run here because a client can post whatever it likes; then the
 *  database trigger, which is the real enforcement and fires on the service role too. */
export async function setCircleAccessAction(
  circleId: string,
  slug: string,
  access: string,
): Promise<{ ok: true } | { error: string }> {
  const caps = await getCircleCapabilities(circleId)
  if (!caps.has('circle.editSettings')) return { error: 'Unauthorized' }

  // Strict, not `asCircleAccess`: that helper resolves an unknown value to the closed default,
  // which is the right read of a stored row and the wrong read of a submitted one. A mode nobody
  // picked must not be saved as some other mode.
  const next = CIRCLE_ACCESS_MODES.find((mode) => mode === access)
  if (!next) return { error: 'Pick who can join.' }

  const admin = createAdminClient()
  const { data: circle } = await admin
    .from('circles')
    .select('space_id')
    .eq('id', circleId)
    .maybeSingle()
  if (!circle) return { error: 'That circle could not be found.' }

  const space = await readOwningSpaceFacts(circle.space_id ?? null)
  if (!availableAccessModes(space).includes(next)) return { error: CIRCLE_ACCESS_LIMIT_NOTE }

  const { error } = await admin
    .from('circles')
    .update({ access: next })
    .eq('id', circleId)
  if (error) return { error: readableAccessError(error.message) }

  revalidatePath(`/circles/${slug}`)
  revalidatePath('/circles')
  return { ok: true }
}

/** Declare (or clear) the Channel this circle practices in (ADR-871). Re-checks
 *  circle.editSettings, the module's own gate, exactly like the sibling field
 *  saves; the data layer (setCircleChannel) refuses a paused Program with
 *  member-facing copy, which this returns for the module to show inline. */
export async function setCircleChannelAction(
  circleId: string,
  slug: string,
  channelId: string | null,
): Promise<{ ok: true } | { error: string }> {
  const caps = await getCircleCapabilities(circleId)
  if (!caps.has('circle.editSettings')) return { error: 'Unauthorized' }

  try {
    await setCircleChannel({ circleId, channelId: channelId || null })
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not save. Try again.' }
  }

  revalidatePath(`/circles/${slug}`)
  revalidatePath('/circles')
  return { ok: true }
}

// Cover image: upload to the public `site-media` bucket and persist image_url, or
// clear it. Both re-check circle.editSettings (capabilities are law).
// (This used to cite lib/page-editor/upload-action.ts as the model. That uploader was
// deleted 2026-08-11: the Puck image fields moved to the Loom picker and stopped calling
// it, leaving it with zero callers. This is now the reference implementation, not a copy.)
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

/** Persist a Loom-picked cover URL (the URL-only sibling of uploadCircleCover). Same
 *  circle.editSettings gate; the URL must be a Supabase public object URL. */
export async function setCircleCoverUrl(
  id: string,
  slug: string,
  url: string,
): Promise<{ error: string } | void> {
  const caps = await getCircleCapabilities(id)
  if (!caps.has('circle.editSettings')) return { error: 'Unauthorized' }
  if (!isLoomPublicImageUrl(url)) return { error: 'That image could not be used.' }
  const admin = createAdminClient()
  const { error } = await admin.from('circles').update({ image_url: url }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(`/circles/${slug}`)
  revalidatePath('/circles')
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

/** Read circles.theme on its OWN select, swallowing any error into `{}`. Deliberate: folding an
 *  error into an empty bag keeps every read total (the lib/circles/hero helpers all resolve `{}`
 *  to today's defaults), so a transient failure can never 500 or blank the settings module — it
 *  just renders the default hero. It also keeps `theme` OUT of getCircleAdminData's main select,
 *  which would otherwise fail wholesale and hide the entire module. */
async function readCircleTheme(id: string): Promise<unknown> {
  const { data, error } = await createAdminClient().from('circles').select('theme').eq('id', id).maybeSingle()
  if (error) return {}
  return data?.theme ?? {}
}

/**
 * Set the Circle hero's cover FOCAL POINT (a CSS object-position). Gated circle.editSettings —
 * the circle authority (its host, a managing guide/mentor of the parent, or staff), NOT a staff
 * check: circles have hosts, unlike the platform-curated Channels this mirrors (ADR-886).
 *
 * The Event/Channel twins are `updateEventCoverFocus` / `updateChannelCoverFocus`, and this works
 * the same way: the value is merged into the `theme` jsonb bag rather than given a column of its
 * own, and a CENTERED focus is dropped rather than stored, so a Circle nobody has repositioned
 * keeps an empty bag and renders exactly as it does today. The read-modify-write is why this reads
 * `theme` first: a blind write would clobber `heroHeight` sitting in the same bag.
 */
export async function updateCircleCoverFocus(
  id: string,
  slug: string,
  focus: string,
): Promise<{ error: string } | void> {
  const caps = await getCircleCapabilities(id)
  if (!caps.has('circle.editSettings')) return { error: 'Unauthorized' }

  const next = writeCircleCoverFocus(await readCircleTheme(id), focus)
  // A DB failure comes back as a PostgREST error VALUE (never a throw), which surfaces as this
  // action's inline `{ error }` — a sentence in the rail, not a 500.
  const { error } = await createAdminClient()
    .from('circles')
    .update({ theme: next as Json })
    .eq('id', id)
  if (error) return { error: error.message }

  revalidatePath(`/circles/${slug}`)
  revalidatePath('/circles')
}

/**
 * Set the Circle hero's HEIGHT from the shared Short / Standard / Tall ladder. Same
 * circle.editSettings gate, same bag, same read-modify-write — and the CHANNEL divergence, NOT the
 * Event drop-the-default rule: an explicitly chosen 'standard' is STORED, because the Circle page
 * resolves its hero through the header ELEMENT config (resolveHeaderElement, ADR-793) which also
 * has an opinion about height, and a dropped key would silently hand the decision back to it.
 */
export async function updateCircleHeroHeight(
  id: string,
  slug: string,
  height: string,
): Promise<{ error: string } | void> {
  const caps = await getCircleCapabilities(id)
  if (!caps.has('circle.editSettings')) return { error: 'Unauthorized' }

  const next = writeCircleHeroHeight(await readCircleTheme(id), height)
  const { error } = await createAdminClient()
    .from('circles')
    .update({ theme: next as Json })
    .eq('id', id)
  if (error) return { error: error.message }

  revalidatePath(`/circles/${slug}`)
  revalidatePath('/circles')
}

/**
 * Set the Circle hero's OVERLAY (None / Shade / Blend) — the third header setting beside the focal
 * point and the height, and the same shape as both: the SAME circle.editSettings gate, the SAME
 * `theme` jsonb bag, the same read-modify-write so a blind write can never clobber `coverFocus` or
 * `heroHeight` sitting beside it.
 *
 * The value, its key (`coverScrim`), its validation and its non-destructive merge are the ones
 * Space profiles already ship (lib/layout/cover-scrim.ts re-exports the pure helpers), so a Circle
 * and a Space store the same word for the same choice. An unrecognized value is refused here rather
 * than written and quietly ignored at render.
 */
export async function updateCircleCoverScrim(
  id: string,
  slug: string,
  scrim: CoverScrim,
): Promise<{ error: string } | void> {
  const caps = await getCircleCapabilities(id)
  if (!caps.has('circle.editSettings')) return { error: 'Unauthorized' }
  if (scrim !== 'none' && scrim !== 'shade' && scrim !== 'blend') return { error: 'Pick an overlay.' }

  const theme = await readCircleTheme(id)
  const base = theme && typeof theme === 'object' && !Array.isArray(theme) ? (theme as Record<string, unknown>) : {}
  const next = writeCoverScrimSetting(base, scrim)
  const { error } = await createAdminClient()
    .from('circles')
    .update({ theme: next as Json })
    .eq('id', id)
  if (error) return { error: error.message }

  revalidatePath(`/circles/${slug}`)
  revalidatePath('/circles')
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

  const { error } = await admin
    .from('circles')
    .update({ slug: next })
    .eq('id', id)
  if (error) return { error: error.message }

  revalidatePath(`/circles/${slug}`)
  revalidatePath(`/circles/${next}`)
  revalidatePath('/circles')
  // A permalink rename MOVES the page, and the circle's link is embedded far beyond its own
  // routes: the Channel page and Manage hub list it, a Space's surfaces can, the circles browse
  // cards do. Revalidating only the circle's own paths left all of those serving cached HTML
  // pointing at the DEAD slug, so clicking the circle from its Channel cycled 404 -> back ->
  // same cached link, indefinitely (reported live on /circles/meld after a rename to
  // meld-royal-temple). A rename is rare, so LAYOUT-wide revalidation of the two embedding
  // sections is the right price for killing the whole class rather than chasing each surface.
  revalidatePath('/channels', 'layout')
  revalidatePath('/spaces', 'layout')
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

  const update: Database['public']['Tables']['circles']['Update'] = { type }
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

  const { error } = await admin.from('circles').update(update).eq('id', id)
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
