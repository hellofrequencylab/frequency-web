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
} from '@/lib/circles/challenges'
import { slugify } from '@/lib/utils'
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
    .select('id, slug, name, about, type, member_cap, status, image_url')
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
