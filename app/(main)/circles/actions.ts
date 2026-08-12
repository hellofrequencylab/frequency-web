'use server'

import { randomBytes } from 'crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { processGamificationEvent } from '@/lib/achievements'
import { awardGems } from '@/lib/gems'
import { sendInviteEmail } from '@/lib/email'
import { SITE_URL } from '@/lib/site'
import { getCircleCapabilities } from '@/lib/core/load-capabilities'
import { track } from '@/lib/analytics/track'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { suggestCircleDraft, fallbackCircleSuggestion, type CircleSuggestion } from '@/lib/ai/circle-spark'
import { planCircleEdit } from '@/lib/ai/circle-edit'
import { getCircleDraft, saveCircleDraft, type CircleDraft, type CircleDraftPatch } from '@/lib/circles/draft'
import { CIRCLE_MANIFEST } from '@/lib/studio/entities/circle'
import {
  applyLock,
  declaredLockKeys,
  displayRecord,
  redrawBrief,
  settleRedraw,
  type FieldChange,
} from '@/lib/studio/kernel/redraw'
import { saveSteer } from '@/lib/studio/steer-store'
import { recordCircleStarterMilestone } from '@/lib/beta/referral-contest'

// Vera's start-a-circle assist: suggest a name + about from the chosen Interest.
// Live (Haiku) when AI is on; a deterministic draft otherwise — so the modal's
// "Suggest" affordance always returns something the host can edit before creating.
export async function suggestCircle(
  interest: string,
  type: 'in-person' | 'online',
): Promise<CircleSuggestion> {
  const safeType: 'in-person' | 'online' = type === 'online' ? 'online' : 'in-person'
  const profileId = await getMyProfileId()
  const ai = await suggestCircleDraft({ interest, type: safeType, profileId })
  return ai ?? fallbackCircleSuggestion(interest, safeType)
}

export async function joinCircle(circleId: string, circleSlug: string): Promise<ActionResult> {
  const myProfileId = await getMyProfileId()
  if (!myProfileId) return fail('Sign in to join a circle.')

  const admin = createAdminClient()

  // Check circle capacity
  const { data: circle } = await admin
    .from('circles')
    .select('member_count, member_cap, hub_id')
    .eq('id', circleId)
    .maybeSingle()

  if (!circle) return fail('This circle is no longer available.')
  if (circle.member_count >= circle.member_cap) return fail('This circle is full.') // full

  // Nexus capacity only applies when the circle belongs to a hub → nexus. A
  // circle with no hub (a standalone / founding circle) has no nexus cap to
  // enforce, so it falls straight through to the join instead of aborting.
  if (circle.hub_id) {
    const { data: hub } = await admin
      .from('hubs')
      .select('nexus_id')
      .eq('id', circle.hub_id)
      .maybeSingle()

    if (hub?.nexus_id) {
      const { data: nexus } = await admin
        .from('nexuses')
        .select('id, member_cap')
        .eq('id', hub.nexus_id)
        .maybeSingle()

      if (nexus) {
        // Count active memberships across every circle in every hub of this nexus in a
        // SINGLE round-trip via an inner join (memberships → circles → hubs → nexus),
        // instead of the old serial N+1 (fetch hub ids, then circle ids, then count with
        // an unbounded IN(...)). Pre-check only — the F2 trigger is the hard guarantee.
        const { count } = await admin
          .from('memberships')
          .select('id, circles!inner(hubs!inner(nexus_id))', { count: 'exact', head: true })
          .eq('status', 'active')
          .eq('circles.hubs.nexus_id', hub.nexus_id)

        if ((count ?? 0) >= nexus.member_cap) return fail('This region is at capacity right now.') // nexus at capacity
      }
    }
  }

  // Use admin client. RLS only permits crew+ to self-join via policy, but new
  // members (role = 'member') should be able to join circles directly.
  // Authorization is enforced above in code (capacity, auth check).
  const { error } = await admin.from('memberships').insert({
    profile_id: myProfileId,
    circle_id: circleId,
    status: 'active',
  })
  if (error) {
    console.error('[joinCircle]', error.message)
    return fail('Could not join this circle. Please try again.')
  }

  processGamificationEvent({ type: 'circle_join', profileId: myProfileId }).catch(() => {})
  awardGems(myProfileId, 'circle_join').catch(() => {})
  // Activation-funnel step 3 + the engagement funnel's join step (ADR-075). Best-effort.
  await track('circle.joined', { circleId }, myProfileId)

  // Beta referral + Circle-starter contest (phase P3): if this join pushed the Circle
  // to ten active members, credit the founder. No-op unless the contest flag is on;
  // idempotent per Circle. Awaited (best-effort) so it runs before the redirect below.
  await recordCircleStarterMilestone(circleId).catch(() => {})

  revalidatePath('/circles')
  revalidatePath('/feed')
  redirect(`/circles/${circleSlug}`)
}

// ── Host invite link ──────────────────────────────────────────────────────────
// Hosts can generate an invite link for their own circle without needing admin access.

export async function createHostInviteLink(circleId: string): Promise<{ token: string }> {
  const myProfileId = await getMyProfileId()
  if (!myProfileId) throw new Error('Not authenticated')

  const admin = createAdminClient()

  // Verify the caller is the host of this circle
  const { data: circle } = await admin
    .from('circles')
    .select('host_id')
    .eq('id', circleId)
    .maybeSingle()

  if (!circle) throw new Error('Circle not found')
  if (circle.host_id !== myProfileId) throw new Error('Only the host can generate invite links')

  const token = randomBytes(12).toString('base64url')

  // Deactivate any previous active link for this circle
  await admin
    .from('invite_links')
    .update({ is_active: false })
    .eq('circle_id', circleId)
    .eq('is_active', true)

  const { error } = await admin.from('invite_links').insert({
    token,
    circle_id:  circleId,
    created_by: myProfileId,
  })
  if (error) throw new Error(error.message)

  revalidatePath(`/circles`)
  return { token }
}

// Invite someone to a circle by email: create a fresh invite link and send it
// through the durable email queue (the spine). Host-only.
export async function inviteByEmail(
  circleId: string,
  email: string,
): Promise<{ ok: boolean; error?: string }> {
  const myProfileId = await getMyProfileId()
  if (!myProfileId) return { ok: false, error: 'Not signed in.' }

  const clean = email.trim().toLowerCase()
  if (!clean || !clean.includes('@')) return { ok: false, error: 'Enter a valid email address.' }

  // Same gate as the Host Tools UI: host + janitors + area guides/mentors.
  const caps = await getCircleCapabilities(circleId)
  if (!caps.has('circle.editSettings')) {
    return { ok: false, error: 'You do not manage this circle.' }
  }

  const admin = createAdminClient()
  const { data: circle } = await admin
    .from('circles')
    .select('name')
    .eq('id', circleId)
    .maybeSingle()
  if (!circle) return { ok: false, error: 'Circle not found.' }

  const { data: me } = await admin
    .from('profiles')
    .select('display_name')
    .eq('id', myProfileId)
    .maybeSingle()

  const token = randomBytes(12).toString('base64url')
  const { error } = await admin
    .from('invite_links')
    .insert({ token, circle_id: circleId, created_by: myProfileId })
  if (error) return { ok: false, error: error.message }

  // Enqueue the invite email best-effort: the link is already created, so a mail hiccup
  // (a queue blip) must never fail the invite. A re-invite mints a fresh link + resends,
  // which is intended. Suppression is enforced at the outbox drain (sendRawEmail).
  try {
    await sendInviteEmail({
      to: clean,
      inviterName: me?.display_name ?? 'A member',
      contextName: circle.name,
      contextKind: 'circle',
      inviteUrl: `${SITE_URL}/join/${token}`,
    })
  } catch (e) {
    console.error('[inviteByEmail] invite email enqueue failed', e)
  }

  return { ok: true }
}

// ── Edit re-entry: the redraw (ADR-450 §2 · ADR-994 · ADR-996) ────────────────────────────────
//
// The Guided section of a Circle's Inspector rail: the same three dials the Spark had (mood ·
// directions · lock), run over the LIVE Circle. Same four steps as every other entity's redraw
// (lib/studio/kernel/redraw.ts): resolve the pins, DELETE them from the patch, diff what is left
// against what is there, write only what moved.
//
// The one thing that is genuinely a Circle's own is the TRANSLATION. Vera's circle editor speaks
// the spark's flat vocabulary (`card`, `meetup` as a plain string) while the manifest and the
// draft speak paths (`about`, `meetup.text`), so the two maps below are what a Practice did not
// need and a Circle cannot do without. Both directions are named once, so the redraw and the
// put-it-back walk the same list.
//
// LOCK here covers `identity` (the name and the About) and `agreements`. The agreements are the
// group's own norms, so pinning them has to actually hold: they are a REPEATED collection, which
// the kernel now resolves to its `agreements` path (ADR-996) and deletes like any other.

/** The lock the Guided rail offers is only as good as the paths it resolves to, so a Circle's
 *  redraw is bounded to exactly these manifest paths. Anything else Vera returns is dropped. */
const CIRCLE_REDRAW_PATHS = [
  'name',
  'about',
  'pillarsInside.mind',
  'pillarsInside.body',
  'pillarsInside.spirit',
  'pillarsInside.expression',
  'meetup.text',
  'gathering.text',
  'thread',
  'format',
  'sizeLabel',
  'agreements',
  'remixOptions',
] as const

/** A path-keyed snapshot: scalars as strings, the two collections as string arrays. */
type CircleValues = Record<string, unknown>

/** The live Circle, in manifest-path space. */
function circleSnapshot(draft: CircleDraft): CircleValues {
  const pi = draft.pillarsInside ?? {}
  return {
    name: draft.name ?? '',
    about: draft.about ?? '',
    'pillarsInside.mind': pi.mind ?? '',
    'pillarsInside.body': pi.body ?? '',
    'pillarsInside.spirit': pi.spirit ?? '',
    'pillarsInside.expression': pi.expression ?? '',
    'meetup.text': draft.meetup?.text ?? '',
    'gathering.text': draft.gathering?.text ?? '',
    thread: draft.thread ?? '',
    format: draft.format ?? '',
    sizeLabel: draft.sizeLabel ?? '',
    agreements: draft.agreements ?? [],
    remixOptions: draft.remixOptions ?? [],
  }
}

/** Vera's spark-shaped patch, translated into manifest-path space. `card` / `oneLiner` /
 *  `identity` all describe the same thing on a live Circle (its About), so the first one she
 *  returns wins rather than three of them fighting over one column. */
function circleProposal(patch: Awaited<ReturnType<typeof planCircleEdit>>): CircleValues {
  const out: CircleValues = {}
  if (!patch) return out
  if (patch.name !== undefined) out.name = patch.name
  const about = patch.card ?? patch.oneLiner ?? patch.identity
  if (about !== undefined) out.about = about
  for (const p of ['mind', 'body', 'spirit', 'expression'] as const) {
    const line = patch.pillarsInside?.[p]
    if (line !== undefined) out[`pillarsInside.${p}`] = line
  }
  if (patch.meetup !== undefined) out['meetup.text'] = patch.meetup
  if (patch.gathering !== undefined) out['gathering.text'] = patch.gathering
  if (patch.thread !== undefined) out.thread = patch.thread
  if (patch.format !== undefined) out.format = patch.format
  if (patch.sizeLabel !== undefined) out.sizeLabel = patch.sizeLabel
  if (patch.agreements !== undefined) out.agreements = patch.agreements
  if (patch.remixOptions !== undefined) out.remixOptions = patch.remixOptions
  return out
}

/** Manifest-path space back to the draft's own storage shape. The two rhythm beats carry the
 *  length the draft already had, so re-drafting the wording never drops "90 minutes". */
function circleWritePatch(values: CircleValues, draft: CircleDraft, paths: readonly string[]): CircleDraftPatch {
  const out: CircleDraftPatch = {}
  const wanted = new Set(paths)
  const text = (path: string): string | undefined =>
    wanted.has(path) && typeof values[path] === 'string' ? (values[path] as string) : undefined
  const list = (path: string): string[] | undefined =>
    wanted.has(path) && Array.isArray(values[path])
      ? (values[path] as unknown[]).filter((v): v is string => typeof v === 'string')
      : undefined

  const name = text('name')
  if (name !== undefined) out.name = name
  const about = text('about')
  if (about !== undefined) out.about = about

  const pillarsInside = { ...(draft.pillarsInside ?? {}) }
  let touchedPillars = false
  for (const p of ['mind', 'body', 'spirit', 'expression'] as const) {
    const line = text(`pillarsInside.${p}`)
    if (line !== undefined) {
      pillarsInside[p] = line
      touchedPillars = true
    }
  }
  if (touchedPillars) out.pillarsInside = pillarsInside

  const meetup = text('meetup.text')
  if (meetup !== undefined) out.meetup = { text: meetup, length: draft.meetup?.length }
  const gathering = text('gathering.text')
  if (gathering !== undefined) out.gathering = { text: gathering, length: draft.gathering?.length }

  const thread = text('thread')
  if (thread !== undefined) out.thread = thread
  const format = text('format')
  if (format !== undefined) out.format = format
  const sizeLabel = text('sizeLabel')
  if (sizeLabel !== undefined) out.sizeLabel = sizeLabel

  const agreements = list('agreements')
  if (agreements !== undefined) out.agreements = agreements
  const remixOptions = list('remixOptions')
  if (remixOptions !== undefined) out.remixOptions = remixOptions

  return out
}

/** What one Circle redraw did: what moved, what the pins held, and the previous values of
 *  exactly the changed paths (feed straight back to restoreCircleAction to undo). */
export interface CircleRedrawResult {
  changes: FieldChange[]
  kept: string[]
  before: Record<string, unknown>
}

/** The gate every Circle authoring action re-checks: circle.editSettings (host + janitors +
 *  scope leaders), the same capability the rail itself is gated on. */
async function authorCircle(
  circleId: string,
): Promise<{ draft: CircleDraft; profileId: string } | { error: string }> {
  const profileId = await getMyProfileId()
  if (!profileId) return { error: 'Not signed in' }
  const caps = await getCircleCapabilities(circleId)
  if (!caps.has('circle.editSettings')) return { error: 'You do not manage this circle.' }
  const draft = await getCircleDraft(circleId)
  if (!draft) return { error: 'Circle not found.' }
  return { draft, profileId }
}

/** Re-steer a Circle that already exists: pick a mood, say how to approach it, pin what to keep,
 *  and draft it again. Every pinned path is deleted from the patch before anything is compared
 *  or written. */
export async function redrawCircleAction(
  circleId: string,
  input: { mood?: string | null; directions?: string | null; locked?: readonly string[] },
): Promise<ActionResult<CircleRedrawResult>> {
  const gate = await authorCircle(circleId)
  if ('error' in gate) return fail(gate.error)
  const { draft, profileId } = gate

  const pins = declaredLockKeys(CIRCLE_MANIFEST, input.locked ?? [])
  await saveSteer('circle', circleId, profileId, {
    mood: input.mood,
    directions: input.directions,
    locked: pins,
  })

  const patch = await planCircleEdit({
    request: redrawBrief({
      manifest: CIRCLE_MANIFEST,
      lead: 'Draft this Circle again, keeping every fact it already states true.',
      mood: input.mood,
      directions: input.directions,
      locked: pins,
    }),
    circle: {
      name: draft.name,
      card: draft.about ?? undefined,
      identity: draft.about ?? undefined,
      pillarsInside: draft.pillarsInside,
      meetup: draft.meetup?.text || undefined,
      gathering: draft.gathering?.text || undefined,
      thread: draft.thread ?? undefined,
      format: draft.format ?? undefined,
      sizeLabel: draft.sizeLabel ?? undefined,
      agreements: draft.agreements,
      remixOptions: draft.remixOptions,
    },
    profileId,
  })
  if (!patch) return fail('Vera is offline right now. Try again in a moment, or edit by hand.')

  // THE GUARANTEE: the pinned paths are deleted from the proposal here, before it is compared
  // or written. `agreements` is a repeated collection and is deleted exactly like a plain field.
  const current = circleSnapshot(draft)
  const safe = applyLock(CIRCLE_MANIFEST, pins, circleProposal(patch)) as CircleValues

  const settled = settleRedraw({
    manifest: CIRCLE_MANIFEST,
    locked: pins,
    current: displayRecord(current),
    proposed: displayRecord(safe),
  })
  const paths = settled.changedPaths.filter((p) => (CIRCLE_REDRAW_PATHS as readonly string[]).includes(p))
  if (paths.length === 0) {
    return fail('Vera kept this one as it is. Give her a direction, or unpin something, and try again.')
  }

  await saveCircleDraft(circleId, circleWritePatch(safe, draft, paths))
  revalidatePath('/circles')
  revalidatePath(`/circles/${draft.slug}`)
  revalidatePath(`/circles/${draft.slug}/edit`)

  const before: Record<string, unknown> = {}
  for (const path of paths) before[path] = current[path]
  return ok({ changes: settled.changes.filter((c) => paths.includes(c.path)), kept: settled.kept, before })
}

/** Put it back: write the pre-redraw values the diff handed the rail. Same gate, same write
 *  mapping, so an undo can only ever restore paths a redraw was allowed to touch. */
export async function restoreCircleAction(
  circleId: string,
  before: Record<string, unknown>,
): Promise<ActionResult> {
  const gate = await authorCircle(circleId)
  if ('error' in gate) return fail(gate.error)
  const { draft } = gate
  const paths = Object.keys(before).filter((p) => (CIRCLE_REDRAW_PATHS as readonly string[]).includes(p))
  if (paths.length === 0) return fail('Nothing to put back.')
  await saveCircleDraft(circleId, circleWritePatch(before, draft, paths))
  revalidatePath('/circles')
  revalidatePath(`/circles/${draft.slug}`)
  revalidatePath(`/circles/${draft.slug}/edit`)
  return ok()
}

export async function leaveCircle(circleId: string) {
  const myProfileId = await getMyProfileId()
  if (!myProfileId) return

  const admin = createAdminClient()
  await admin
    .from('memberships')
    .delete()
    .eq('profile_id', myProfileId)
    .eq('circle_id', circleId)

  revalidatePath('/circles')
  revalidatePath('/feed')
  redirect('/circles')
}
