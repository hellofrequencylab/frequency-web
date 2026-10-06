'use server'

import { randomBytes } from 'crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { joinCircleAsMember } from '@/lib/circles/join'
import { rateLimitOk } from '@/lib/rate-limit'
import { sendInviteEmail } from '@/lib/email'
import { SITE_URL } from '@/lib/site'
import { getCircleCapabilities } from '@/lib/core/load-capabilities'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { suggestCircleDraft, fallbackCircleSuggestion, type CircleSuggestion } from '@/lib/ai/circle-spark'
import { planCircleEdit } from '@/lib/ai/circle-edit'
import {
  getCircleDraft,
  saveCircleDraft,
  CIRCLE_DRAFT_SAVE_ERROR,
  type CircleDraft,
  type CircleDraftPatch,
} from '@/lib/circles/draft'
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

// One address, nothing else: no spaces, exactly one at sign, a dotted domain.
const SINGLE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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

/**
 * Join a circle. The member-facing Server Action: the caller is the session, and the body lives in
 * joinCircleAsMember (lib/circles/join.ts). It takes NO `invited` flag (SCAN-774): a Server Action
 * is a public POST endpoint, and an argument any client can pass is not an invite. The one caller
 * that holds an invite (the /q resolver) calls the helper directly, after checking the code's minter.
 */
export async function joinCircle(circleId: string, circleSlug: string): Promise<ActionResult> {
  const myProfileId = await getMyProfileId()
  if (!myProfileId) return fail('Sign in to join a circle.')

  const res = await joinCircleAsMember(myProfileId, circleId, { invited: false })
  if ('error' in res) return res

  revalidatePath('/circles')
  revalidatePath('/feed')
  redirect(`/circles/${circleSlug}`)
}

// ── Host invite link ──────────────────────────────────────────────────────────
// Whoever manages the circle can generate an invite link for it.
//
// THE GATE IS `circle.editSettings`, NOT `circles.host_id`. This control and inviteByEmail below
// are the two halves of one card ("Invite a friend"), rendered behind the same capability, so they
// have to answer the same question. Checking the host FK here meant a circle-scoped Admin
// (ADR-1014), a janitor, or the guide/mentor who leads the parent hub could email an invite but
// not copy a link — the same person, the same card, two different answers.
//
// It RETURNS a result instead of throwing: a thrown server-action error reaches the client as an
// opaque digest, which is how the old host-only refusal became invisible to the person it refused.

export async function createHostInviteLink(
  circleId: string,
): Promise<ActionResult<{ token: string }>> {
  const myProfileId = await getMyProfileId()
  if (!myProfileId) return fail('Sign in to create an invite link.')

  // Same gate as the Host Tools UI and as inviteByEmail: host + circle admins + janitors +
  // area guides/mentors.
  const caps = await getCircleCapabilities(circleId)
  if (!caps.has('circle.editSettings')) return fail('You do not manage this circle.')

  const admin = createAdminClient()

  const { data: circle } = await admin
    .from('circles')
    .select('id')
    .eq('id', circleId)
    .maybeSingle()
  if (!circle) return fail('Circle not found.')

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
  if (error) {
    console.error('[createHostInviteLink]', error.message)
    return fail('Could not create an invite link. Try again in a moment.')
  }

  revalidatePath(`/circles`)
  return ok({ token })
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
  // SCAN-693: one real address, not any string with an at sign in it.
  if (!clean || clean.length > 254 || !SINGLE_EMAIL_RE.test(clean)) {
    return { ok: false, error: 'Enter a valid email address.' }
  }

  // Same gate as the Host Tools UI: host + janitors + area guides/mentors.
  const caps = await getCircleCapabilities(circleId)
  if (!caps.has('circle.editSettings')) {
    return { ok: false, error: 'You do not manage this circle.' }
  }

  // SCAN-693: the invite goes out on the transactional lane, which welcome mail shares, and the
  // only gate was the host capability any self-made host holds. Twenty a day per host, then a
  // sentence; the second budget keys on the circle so one host cannot spend it across circles.
  if (
    !(await rateLimitOk('circle:invite-email', myProfileId, 20, '1 d')) ||
    !(await rateLimitOk('circle:invite-email:circle', circleId, 40, '1 d'))
  ) {
    return { ok: false, error: 'You have sent today’s invites. Share the invite link instead, or try again tomorrow.' }
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

  // SCAN-693: reuse the circle's live invite link; every email used to mint a fresh row that was
  // never deactivated, so invite_links grew with every send.
  const { data: existing } = await admin
    .from('invite_links')
    .select('token')
    .eq('circle_id', circleId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  let token = existing?.token ?? null
  if (!token) {
    token = randomBytes(12).toString('base64url')
    const { error } = await admin
      .from('invite_links')
      .insert({ token, circle_id: circleId, created_by: myProfileId })
    if (error) {
      // The detail belongs in the log, where it can be acted on. The host gets a sentence they can
      // read (matching createHostInviteLink above), not a PostgREST string about a table they have
      // never heard of.
      console.error('[inviteByEmail] invite link insert failed', {
        code: error.code, message: error.message, circleId, profileId: myProfileId,
      })
      return { ok: false, error: 'Could not send that invite. Try again in a moment.' }
    }
  }

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

  // A failed write is a refusal, not a diff: saveCircleDraft throws on it (SCAN-694).
  try {
    await saveCircleDraft(circleId, circleWritePatch(safe, draft, paths))
  } catch (e) {
    return fail(e instanceof Error ? e.message : CIRCLE_DRAFT_SAVE_ERROR)
  }
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
  try {
    await saveCircleDraft(circleId, circleWritePatch(before, draft, paths))
  } catch (e) {
    return fail(e instanceof Error ? e.message : CIRCLE_DRAFT_SAVE_ERROR)
  }
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
