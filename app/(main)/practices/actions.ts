'use server'

import { revalidatePath } from 'next/cache'
import { getMyProfileId, getCallerProfile } from '@/lib/auth'
import { atLeastRole } from '@/lib/core/roles'
import { getCircleCapabilities, canCreate } from '@/lib/core/load-capabilities'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { redirect } from 'next/navigation'
import {
  logPractice,
  unlogPractice,
  adoptPractice,
  dropMemberPractice,
  setCirclePractice,
  createPractice,
  notifyStaffOfPendingPractice,
  getPractice,
  updatePractice,
  forkPractice,
  claimPractice,
  setPracticeTags,
  setPracticeFlags,
  setPracticeReward,
  deletePractice,
  type PracticeEdit,
  type LogPracticeResult,
  type UnlogPracticeResult,
} from '@/lib/practices'
import { rateLimitOk } from '@/lib/rate-limit'
import { personalizePractice, type PracticeSuggestion } from '@/lib/ai/practice-wizard'
import { draftPracticeSpark } from '@/lib/ai/practice-spark'
import { planPracticeEdits } from '@/lib/ai/practice-edit'
import { pillarIdsBySlug } from '@/lib/journeys/compose'
import { awardZapsForAction } from '@/lib/zaps'
import { recordEngagementEvent } from '@/lib/engagement/events'
import { getGlobalCapabilities } from '@/lib/core/load-capabilities'

// Log that you did a practice → practice.verified (WAM) + zaps + streak.
//
// `clientTimezone` is the member's IANA tz from the browser
// (Intl.DateTimeFormat().resolvedOptions().timeZone). It is a FALLBACK only: the
// server prefers the durable, un-spoofable profiles.home_timezone, so the log "day"
// that keys the idempotency row stays server-resolved and can't be backdated.
export async function logPracticeAction(
  practiceId: string,
  circleId?: string | null,
  clientTimezone?: string | null,
  // Completion economy (practice-timer redesign): optional timed-log seconds. Omitted by
  // the one-tap "Log it" callers, which keep the unchanged FULL behavior (no target → full
  // reward, streak tick). A timed caller (e.g. a "Finish Practice" top-up from the practices
  // page) passes both, and logPractice routes partial / full / finish off the ratio.
  timed?: { secondsDone?: number | null; secondsTarget?: number | null } | null,
): Promise<ActionResult<LogPracticeResult>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Not signed in')
  // Anti-cheat (B.2 / D5): rate-limit the log action per member (the per-day total
  // cap + the per-practice-per-day idempotency live in logPractice). Fails open when
  // Upstash isn't configured, so local dev + a preview are never blocked.
  if (!(await rateLimitOk('practice_log', profileId, 10, '1 m'))) {
    return fail('Slow down a moment, then log again.')
  }
  const res = await logPractice({
    profileId,
    practiceId,
    circleId: circleId ?? null,
    clientTimezone: clientTimezone ?? null,
    secondsDone: timed?.secondsDone ?? null,
    secondsTarget: timed?.secondsTarget ?? null,
  })
  // Timer gate: a practice with a set timer can only be logged from inside its session (which
  // carries a target). A one-tap attempt is refused server-side; surface that as a clear fail so
  // the UI sends the member to the timer instead of silently doing nothing.
  if (res.timerRequired) {
    return fail('Use the timer to log this practice.')
  }
  // Re-seed the "your practices" tight rows so an already-logged practice paints in
  // its collapsed state on the next server render (B.4). The client wrapper collapses
  // optimistically too, so this is the durable, refresh-safe path, not the live one.
  revalidatePath('/practices')
  return ok(res)
}

// Un-log today's practice (D4 = today-only undo). Reverses the log, the idempotency
// row, the exact Zap grant, and re-derives the streak. Server-authz: the caller's OWN
// log only — profileId comes from the session, never the client.
export async function unlogPracticeAction(
  practiceId: string,
  clientTimezone?: string | null,
): Promise<ActionResult<UnlogPracticeResult>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Not signed in')
  // Same per-member rate window as logging, so toggling log/un-log can't be spun.
  if (!(await rateLimitOk('practice_log', profileId, 10, '1 m'))) {
    return fail('Slow down a moment, then try again.')
  }
  // Same fallback tz as logging, so the un-log resolves the SAME local day the log
  // was written under (home_timezone still wins; the client tz is a fallback only).
  const res = await unlogPractice({ profileId, practiceId, clientTimezone: clientTimezone ?? null })
  revalidatePath('/practices')
  return ok(res)
}

export async function adoptPracticeAction(practiceId: string): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Not signed in')
  await adoptPractice(profileId, practiceId)
  revalidatePath('/practices')
  return ok()
}

export async function dropPracticeAction(practiceId: string): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Not signed in')
  await dropMemberPractice(profileId, practiceId)
  revalidatePath('/practices')
  return ok()
}

/**
 * Authorize a caller to CREATE a practice and decide its review status (SECURITY-sensitive,
 * ADR-109). Authoring a library practice is a CREW+ act on the community trust ladder — a plain
 * Member may adopt, claim, fork, and log practices, but never author one into the library. The
 * gate is the canonical trust-ladder helper (`atLeastRole(role, 'crew')`), read from the caller's
 * EFFECTIVE community_role (view-as aware via getCallerProfile), so it's the single source of
 * truth — the hidden UI button is only convenience.
 *
 * Returns the caller's id + whether host+ standing (the curation tier) lets the practice
 * auto-approve. A non-host author creates PENDING: the practice stays out of the public pool
 * until a Host+ approves it. Returns an error string when the caller is signed out (or, outside
 * beta, a plain Member without real Crew — see ADR-414).
 */
async function authorizeCreatePractice(): Promise<
  { profileId: string; autoApprove: boolean } | { error: string }
> {
  const caller = await getCallerProfile()
  if (!caller) return { error: 'Not signed in' }
  // Real-Crew create gate (ADR-414) — reads the true tier (pre beta-override) so a free
  // member is sold the one-tap free-beta upgrade rather than silently allowed. Nothing
  // unvetted goes public regardless: a non-host author still creates PENDING (below).
  if (!(await canCreate('practice.create'))) {
    return { error: 'Upgrade to Crew to create a practice. Crew is free during the beta, one tap, no card.' }
  }
  // Host+ (or platform staff, who curate the library) author live; everyone else pending review.
  const autoApprove = atLeastRole(caller.community_role, 'host') || caller.webRole !== 'none'
  return { profileId: caller.id, autoApprove }
}

export async function createPracticeAction(
  title: string,
  description?: string,
): Promise<ActionResult<{ id: string }>> {
  const gate = await authorizeCreatePractice()
  if ('error' in gate) return fail(gate.error)
  const t = title.trim()
  if (!t) return fail('Title is required')
  const p = await createPractice({
    title: t,
    description: description?.trim() || null,
    createdBy: gate.profileId,
    // A Crew proposal lands PENDING + hidden until a Host+ approves it (which publishes it);
    // a host+/staff author goes live at birth (the column default 'approved').
    isPublic: gate.autoApprove,
    status: gate.autoApprove ? 'approved' : 'pending',
  })
  if (!p) return fail('Could not create practice')
  if (!gate.autoApprove) {
    // Best-effort — never blocks creation.
    await notifyStaffOfPendingPractice({ practiceId: p.id, title: t, proposedBy: gate.profileId })
  }
  revalidatePath('/practices')
  return ok({ id: p.id })
}

// Create a blank DRAFT practice (non-public) and return its id, so the caller can open the full
// PracticeBuilder popup straight away — no separate "name it" step or full page. The draft stays
// out of the public library until it's published. Crew+ only (Members cannot author practices); a
// Crew draft carries 'pending' so when it is published it goes through Host+ review, while a
// host+/staff author's draft is auto-approved on publish.
export async function createPracticeDraftAction(): Promise<ActionResult<{ id: string }>> {
  const gate = await authorizeCreatePractice()
  if ('error' in gate) return fail(gate.error)
  const p = await createPractice({
    title: 'Untitled practice',
    createdBy: gate.profileId,
    isPublic: false,
    status: gate.autoApprove ? 'approved' : 'pending',
  })
  if (!p) return fail('Could not create practice')
  if (!gate.autoApprove) {
    // Best-effort — never blocks creation. The pending draft is hidden until published + approved.
    await notifyStaffOfPendingPractice({
      practiceId: p.id,
      title: 'Untitled practice',
      proposedBy: gate.profileId,
    })
  }
  revalidatePath('/practices')
  return ok({ id: p.id })
}

// Edit a practice you created. Partial flexibility: members shape content + cadence
// on their OWN practices (ownership enforced); rewards stay admin-governed.
export async function updatePracticeAction(id: string, patch: PracticeEdit): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Not signed in')
  const existing = await getPractice(id)
  if (!existing) return fail('Practice not found')
  if (existing.created_by !== profileId && !(await getGlobalCapabilities()).has('admin.access'))
    return fail('You can only edit practices you created')
  const saved = await updatePractice(id, patch)
  if (!saved) return fail('Could not save')
  revalidatePath('/practices')
  revalidatePath(`/practices/${id}/edit`)
  return ok()
}

// ── Vera Practice composer (ADR-358) ──────────────────────────────────────────────────────────
//
// The Practice builder's "Build with Vera" / "Edit with Vera" box, the atom-level twin of the
// Journey composer. A Practice is one act (no block tree), so Vera drafts (or rewrites) its FIELDS
// in place: name, hook, one-line description, full guide, cadence, and the Pillar it fits. Both
// actions are owner-gated like every edit, route through the shared Vera infra (voice primer +
// usage ledger + budget cap), and degrade cleanly when Vera is off so the author can type by hand.

/** Guard: the caller owns this practice (or is an operator). Returns the practice + the caller's id,
 *  or an error string. Mirrors the gate in updatePracticeAction. */
async function authorPractice(
  id: string,
): Promise<{ practice: Awaited<ReturnType<typeof getPractice>>; profileId: string } | { error: string }> {
  const profileId = await getMyProfileId()
  if (!profileId) return { error: 'Not signed in' }
  const practice = await getPractice(id)
  if (!practice) return { error: 'Practice not found' }
  if (practice.created_by !== profileId && !(await getGlobalCapabilities()).has('admin.access'))
    return { error: 'You can only edit practices you created' }
  return { practice, profileId }
}

/** Build with Vera (empty practice): from a one-line description, Vera drafts the whole Practice
 *  (name, hook, description, full guide, Pillar, cadence, time) and writes it in place. Returns
 *  whether AI was used so the UI can say "Vera is offline" when it falls back. */
export async function buildPracticeWithVeraAction(
  id: string,
  description: string,
): Promise<ActionResult<{ aiUsed: boolean }>> {
  const gate = await authorPractice(id)
  if ('error' in gate) return fail(gate.error)
  const { practice, profileId } = gate
  const desc = description.trim().slice(0, 1000)
  if (!desc) return fail('Tell Vera what you want to build first.')

  const spark = await draftPracticeSpark({
    who: '',
    act: desc,
    outcome: '',
    cadence: 'daily',
    pace: 'light',
    profileId,
  })
  if (!spark) return ok({ aiUsed: false })

  const patch: PracticeEdit = {
    summary: spark.summary || undefined,
    description: spark.description || undefined,
    body: spark.body || undefined,
    cadence: spark.cadence || undefined,
  }
  if (spark.durationMin != null) patch.duration_min = spark.durationMin
  // Only rename an untitled practice from Vera's suggestion; never clobber a name the author chose.
  const current = (practice?.title ?? '').trim().toLowerCase()
  if (spark.title && (!current || current === 'untitled practice')) patch.title = spark.title
  if (spark.pillar) {
    const ids = await pillarIdsBySlug()
    const pid = ids[spark.pillar]
    if (pid) patch.focus_details = { [pid]: { instructions: '', timing: '' } }
  }
  const saved = await updatePractice(id, patch)
  if (!saved) return fail('Could not save what Vera drafted.')
  revalidatePath('/practices')
  revalidatePath(`/practices/${id}/edit`)
  return ok({ aiUsed: true })
}

/** Apply with Vera (built practice): the author types a plain-language change; Vera reads the whole
 *  Practice and returns the changed fields, which we bound + write in place. Mirrors the Journey
 *  builder's applyVeraChangeAction. */
export async function applyVeraPracticeChangeAction(
  id: string,
  request: string,
): Promise<ActionResult<{ applied: number }>> {
  const gate = await authorPractice(id)
  if ('error' in gate) return fail(gate.error)
  const { practice, profileId } = gate
  const req = request.trim().slice(0, 1000)
  if (!req) return fail('Tell Vera what to change first.')
  if (!practice) return fail('Practice not found')

  const edits = await planPracticeEdits({
    request: req,
    practice: {
      title: practice.title ?? '',
      summary: practice.summary ?? '',
      description: practice.description ?? '',
      body: practice.body ?? '',
      cadence: practice.cadence ?? '',
    },
    profileId,
  })
  if (!edits) return fail('Vera is offline right now. Try again in a moment, or edit by hand.')

  const patch: PracticeEdit = {}
  if (edits.title !== undefined) patch.title = edits.title
  if (edits.summary !== undefined) patch.summary = edits.summary
  if (edits.description !== undefined) patch.description = edits.description
  if (edits.body !== undefined) patch.body = edits.body
  if (edits.cadence !== undefined) patch.cadence = edits.cadence
  const applied = Object.keys(patch).length
  if (applied === 0) return fail('Vera could not make that change. Try rephrasing it.')

  const saved = await updatePractice(id, patch)
  if (!saved) return fail('Could not save the change.')
  revalidatePath('/practices')
  revalidatePath(`/practices/${id}/edit`)
  return ok({ applied })
}

// Set the author tags on a practice you created (hybrid model: new labels become
// folksonomy tags). Ownership enforced; Vera/other-member tags are left untouched.
export async function setPracticeTagsAction(id: string, labels: string[]): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Not signed in')
  const existing = await getPractice(id)
  if (!existing) return fail('Practice not found')
  if (existing.created_by !== profileId && !(await getGlobalCapabilities()).has('admin.access'))
    return fail('You can only edit practices you created')
  await setPracticeTags(id, labels, { source: 'author', assignedBy: profileId })
  revalidatePath('/practices')
  revalidatePath(`/practices/${id}/edit`)
  return ok()
}

// Remix a library practice you don't own: fork a PRIVATE copy you own, adopt it
// into your program, and open the editor on the copy.
export async function forkPracticeAction(practiceId: string) {
  const profileId = await getMyProfileId()
  if (!profileId) return
  const copy = await forkPractice(profileId, practiceId)
  if (!copy) return
  await adoptPractice(profileId, copy.id)
  redirect(`/practices/${copy.id}/edit`)
}

// Vera assist for the claim wizard: personalize a template to the member's goal +
// schedule. Returns null when AI is off or the call fails (the wizard falls back to
// the template's own content), so claiming never depends on the model being up.
export async function suggestPracticeAction(
  templateId: string,
  goal: string,
  schedule: string,
): Promise<ActionResult<{ suggestion: PracticeSuggestion | null }>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Not signed in')
  const template = await getPractice(templateId)
  if (!template) return fail('Practice not found')
  const suggestion = await personalizePractice({
    template: {
      title: template.title,
      summary: template.summary,
      body: template.body,
      cadence: template.cadence,
    },
    goal,
    schedule,
    profileId,
  })
  return ok({ suggestion })
}

// Claim a template → your own private, adopted copy with the personalized content.
// First claim rewards zaps (member-keyed idempotency, so it fires once — no farming).
export async function claimPracticeAction(
  templateId: string,
  fields: { title: string; summary?: string | null; body?: string | null; cadence?: string | null },
): Promise<ActionResult<{ id: string }>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Not signed in')
  if (!fields.title?.trim()) return fail('Give your practice a name')
  const copy = await claimPractice(profileId, templateId, fields)
  if (!copy) return fail('Could not claim this practice')
  try {
    const { recorded } = await recordEngagementEvent({
      idempotencyKey: `practice_claimed:${profileId}`,
      source: 'web',
      eventType: 'practice.claimed',
      actorProfileId: profileId,
      context: { practiceId: copy.id, templateId },
    })
    if (recorded) await awardZapsForAction(profileId, 'practice_claim')
  } catch {
    // a reward failure must never block the claim
  }
  revalidatePath('/practices')
  return ok({ id: copy.id })
}

// --- Admin curation of the library (gated on admin.access; host+) ----------

async function requirePracticeAdmin(): Promise<boolean> {
  return (await getGlobalCapabilities()).has('admin.access')
}

function revalidatePractice(id: string) {
  revalidatePath('/practices')
  revalidatePath(`/practices/${id}`)
}

// Promote/demote a practice as a claimable starter template.
export async function setPracticeTemplateAction(id: string, value: boolean): Promise<ActionResult> {
  if (!(await requirePracticeAdmin())) return fail('Not allowed')
  await setPracticeFlags(id, { is_template: value })
  revalidatePractice(id)
  return ok()
}

// Show/hide a practice in the public library (is_public).
export async function setPracticeVisibilityAction(id: string, value: boolean): Promise<ActionResult> {
  if (!(await requirePracticeAdmin())) return fail('Not allowed')
  await setPracticeFlags(id, { is_public: value })
  revalidatePractice(id)
  return ok()
}

// Remove a practice from the library entirely.
export async function deletePracticeAction(id: string): Promise<ActionResult> {
  if (!(await requirePracticeAdmin())) return fail('Not allowed')
  await deletePractice(id)
  revalidatePath('/practices')
  return ok()
}

// Delete a practice you created (or any practice as an operator). Owner-or-admin — mirrors the
// editor's edit gate, so an author can remove their own practice straight from the builder.
export async function deleteOwnPracticeAction(id: string): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Not signed in')
  const existing = await getPractice(id)
  if (!existing) return fail('Practice not found')
  if (existing.created_by !== profileId && !(await getGlobalCapabilities()).has('admin.access'))
    return fail('You can only delete practices you created')
  await deletePractice(id)
  revalidatePath('/practices')
  return ok()
}

// Override a practice's per-log Zap reward + the card's reward note (admin-only: members
// must not set their own payout, so this is gated apart from the author-editable builder fields).
export async function setPracticeRewardAction(
  id: string,
  patch: { rewardZaps?: number | null; rewardNote?: string | null },
): Promise<ActionResult> {
  if (!(await requirePracticeAdmin())) return fail('Not allowed')
  const clean: { reward_zaps?: number | null; reward_note?: string | null } = {}
  if (patch.rewardZaps !== undefined) {
    clean.reward_zaps =
      patch.rewardZaps == null ? null : Math.max(0, Math.min(1000, Math.floor(patch.rewardZaps)))
  }
  if (patch.rewardNote !== undefined) {
    const n = patch.rewardNote?.trim()
    clean.reward_note = n ? n.slice(0, 120) : null
  }
  await setPracticeReward(id, clean)
  revalidatePractice(id)
  revalidatePath(`/practices/${id}/edit`)
  return ok()
}

// Host sets the circle's current practice (one active per circle). Authz: the
// caller must hold circle.editSettings (host + janitors + scope leaders).
export async function setCirclePracticeAction(
  circleId: string,
  practiceId: string,
): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Not signed in')
  const caps = await getCircleCapabilities(circleId)
  if (!caps.has('circle.editSettings')) return fail('Not allowed')
  await setCirclePractice(circleId, practiceId, profileId)
  revalidatePath('/circles/[slug]', 'page')
  return ok()
}
