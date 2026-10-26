'use server'

import { revalidatePath } from 'next/cache'
import { getMyProfileId, getCallerProfile } from '@/lib/auth'
import { atLeastRole } from '@/lib/core/roles'
import { getCircleCapabilities, canCreate } from '@/lib/core/load-capabilities'
import { type ActionResult, ok, fail, isError } from '@/lib/action-result'
import { proposeAndConfirmCreate } from '@/lib/ai/vera/create-entity'
import { checkPersonalPracticeMeter } from '@/lib/spaces/counted-meters'
import { loadRootSpaceId } from '@/lib/spaces/store'
import type { EntitlementTier } from '@/lib/core/entitlement'
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
import { draftPracticeSpark, personalizePractice, type PracticeSuggestion } from '@/lib/ai/practice-spark'
import { planPracticeEdits } from '@/lib/ai/practice-edit'
import { suggestRemixDirections } from '@/lib/ai/practice-remix'
import { WRITING_COACHING_FALLBACK } from '@/lib/ai/writing-coaching'
import { awardZapsForAction } from '@/lib/zaps'
import { recordEngagementEvent } from '@/lib/engagement/events'
import { getGlobalCapabilities } from '@/lib/core/load-capabilities'
import { log } from '@/lib/log'

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
): Promise<ActionResult<LogPracticeResult>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Not signed in')
  // Anti-cheat (B.2 / D5): rate-limit the log action per member (the per-day total
  // cap + the per-practice-per-day idempotency live in logPractice). Fails open when
  // Upstash isn't configured, so local dev + a preview are never blocked.
  if (!(await rateLimitOk('practice_log', profileId, 10, '1 m'))) {
    return fail('Slow down a moment, then log again.')
  }
  // Timed (action.practice.log): the practice-log write is a documented hot path
  // (perf-baseline.mjs · practice-log-write) — insert + idempotent ledger award +
  // streak re-derive. Wrap it in log.time so duration_ms + ok are queryable by the
  // same `action.practice.log` event vocabulary as the crons, without changing the
  // result or control flow (log.time re-throws on error).
  const res = await log.time('action.practice.log', () =>
    logPractice({
      profileId,
      practiceId,
      circleId: circleId ?? null,
      clientTimezone: clientTimezone ?? null,
      // ALWAYS a one-tap log (SCAN-723). This action used to accept client-supplied
      // { secondsDone, secondsTarget } and forward them, which let any member claim a full
      // Heavy-tier timed sit with secondsTarget: 1 and the timer never running. No caller ever
      // passed them. Timed logs and "Finish Practice" top-ups go only through the On Air
      // completeSession path, which derives elapsed time from the server-side session row.
      secondsDone: null,
      secondsTarget: null,
    }),
  )
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
  // Timed (action.practice.unlog): the inverse of the hot log write — reverses the
  // log row, idempotency row, exact Zap grant, and re-derives the streak. Wrap it in
  // log.time so the un-log's duration_ms + ok are queryable alongside the log path.
  const res = await log.time('action.practice.unlog', () =>
    unlogPractice({ profileId, practiceId, clientTimezone: clientTimezone ?? null }),
  )
  revalidatePath('/practices')
  return ok(res)
}

/** What adopting returned: adopted, or AT THE CAP with the currently-held five so the member
 *  can swap one out (ADR-920 Phase 4: the cap is a swap prompt, never a data-losing wall). */
export interface AdoptOutcome {
  adopted: boolean
  atCap?: boolean
  held?: { id: string; title: string }[]
}

/** Adopt with a commitment shape (ADR-920): preset weeks (2/4/8), null = ongoing, plus an
 *  optional cue. Both are re-validated in adoptPractice (coerceTermWeeks / cleanCue), so a
 *  hostile payload can only ever produce a preset term and a capped cue. At the 5-active
 *  cap (self adoptions only; journey rows ride outside it) nothing is written — the caller
 *  gets the held list back and offers a swap. */
export async function adoptPracticeAction(
  practiceId: string,
  opts?: { termWeeks?: number | null; cue?: string | null },
): Promise<ActionResult<AdoptOutcome>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Not signed in')
  const { countActiveSelfAdoptions, getMemberAdoptions } = await import('@/lib/practices')
  const { withinActiveCap } = await import('@/lib/practices/adoption')
  const activeSelf = await countActiveSelfAdoptions(profileId)
  if (!withinActiveCap(activeSelf)) {
    // Re-adopting something already held is not a cap event (the upsert re-commits in place).
    const adoptions = await getMemberAdoptions(profileId)
    const alreadyHeld = adoptions.some((a) => a.source === 'self' && a.practice.id === practiceId)
    if (!alreadyHeld) {
      return ok({
        adopted: false,
        atCap: true,
        held: adoptions
          .filter((a) => a.source === 'self')
          .map((a) => ({ id: a.practice.id, title: a.practice.title })),
      })
    }
  }
  await adoptPractice(profileId, practiceId, {
    termWeeks: opts?.termWeeks ?? null,
    ...(opts && 'cue' in opts ? { cue: opts.cue } : {}),
  })
  revalidatePath('/practices')
  return ok({ adopted: true })
}

/** The swap at the cap: retire one held practice (reason 'swapped') and adopt the new one in
 *  its place. Hardened after review: the DROP TARGET must be the caller's own ACTIVE SELF
 *  adoption (a journey row's lifecycle belongs to its journey, and an unheld id must not
 *  count as making room), and a failed adopt ROLLS the drop back so the member never silently
 *  loses a practice to a half-completed swap. The cap itself is enforced inside adoptPractice
 *  (the one chokepoint), so this action cannot be used to exceed it. */
export async function swapPracticeAction(
  dropPracticeId: string,
  adoptPracticeId: string,
  opts?: { termWeeks?: number | null; cue?: string | null },
): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Not signed in')
  if (!dropPracticeId || !adoptPracticeId || dropPracticeId === adoptPracticeId) {
    return fail('Pick a practice to make room for.')
  }
  const { getMemberAdoptions } = await import('@/lib/practices')
  const adoptions = await getMemberAdoptions(profileId)
  const dropRow = adoptions.find((a) => a.practice.id === dropPracticeId)
  if (!dropRow || dropRow.source !== 'self') {
    return fail('Pick one of your own practices to set down.')
  }
  await dropMemberPractice(profileId, dropPracticeId, 'swapped')
  await adoptPractice(profileId, adoptPracticeId, {
    termWeeks: opts?.termWeeks ?? null,
    ...(opts && 'cue' in opts ? { cue: opts.cue } : {}),
  })
  // Verify the adopt actually landed; if not, restore the dropped practice with the shape it
  // had, so a failed swap leaves the list exactly as it was.
  const after = await getMemberAdoptions(profileId)
  if (!after.some((a) => a.practice.id === adoptPracticeId)) {
    await adoptPractice(profileId, dropPracticeId, {
      termWeeks: dropRow.termWeeks,
      ...(dropRow.cue != null ? { cue: dropRow.cue } : {}),
    })
    return fail('That swap did not go through. Your list is unchanged.')
  }
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

/** "Keep it" (ADR-920): convert a RETIRED journey-sourced practice into the member's own, at
 *  the journey's completion moment. Default ongoing; a preset term may be chosen. Self-scoped,
 *  and the lib guard converts ONLY a retired journey row — a live journey row or a self row
 *  (with its own chosen term) can never be overwritten through this public action. */
export async function keepPracticeAction(
  practiceId: string,
  termWeeks: number | null = null,
): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Not signed in')
  const { convertJourneyRowToSelf } = await import('@/lib/practices')
  const converted = await convertJourneyRowToSelf(profileId, practiceId, termWeeks)
  if (!converted)
    return fail('Nothing kept. Either it is not a finished journey practice of yours, or your list is full at five. Set one down first.')
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
  { profileId: string; autoApprove: boolean; tier: EntitlementTier } | { error: string }
> {
  const caller = await getCallerProfile()
  if (!caller) return { error: 'Not signed in' }
  // The capability check stays as this module's own gate (the server owns its authorization,
  // never the hidden button), but it is no longer a TIER check: `practice.create` opened to any
  // signed-in member in LIVE-222, so the only way to fail it is to have no session. The Crew
  // upsell copy that used to live here is deleted rather than reworded, for the same reason as
  // its twin in create-actions.ts: it told a signed-in member to buy a rung that would not change
  // this answer. Nothing unvetted goes public regardless: a non-host author still creates PENDING.
  if (!(await canCreate('practice.create'))) {
    return { error: 'Not signed in' }
  }
  // Host+ (or platform staff, who curate the library) author live; everyone else pending review.
  const autoApprove = atLeastRole(caller.community_role, 'host') || caller.webRole !== 'none'
  return { profileId: caller.id, autoApprove, tier: caller.realMembershipTier }
}

export async function createPracticeAction(
  title: string,
  description?: string,
): Promise<ActionResult<{ id: string }>> {
  const gate = await authorizeCreatePractice()
  if ('error' in gate) return fail(gate.error)
  const t = title.trim()
  if (!t) return fail('Title is required')
  // This road publishes at birth (live for Host+, pending review for everyone else), so it asks the
  // practice_publish meter first (LIVE-752): free 3, Crew unlimited. Off during the beta.
  const meter = await checkPersonalPracticeMeter(gate.profileId, gate.tier, await loadRootSpaceId())
  if (!meter.ok) return fail(meter.error)
  // THE GOVERNED WRITE (ADR-988, ADR-1249): the author named the Practice and tapped Create, so
  // one call proposes, claims and commits through the same writer, and the audit row is written.
  // The review-status policy stays here (ADR-998); a writer failure keeps its generic line.
  const cleanDescription = description?.trim() || null
  const governed = await proposeAndConfirmCreate({
    entity: 'practice',
    draft: { title: t, description: cleanDescription ?? '' },
    rationale: 'Practice library, title road: the author named the Practice and tapped Create.',
    commit: async () => {
      const created = await createPractice({
        title: t,
        description: cleanDescription,
        createdBy: gate.profileId,
        // A Crew proposal lands PENDING + hidden until a Host+ approves it (which publishes it);
        // a host+/staff author goes live at birth (the column default 'approved').
        isPublic: gate.autoApprove,
        status: gate.autoApprove ? 'approved' : 'pending',
      })
      if (!created) throw new Error('Could not create practice')
      return created
    },
  })
  if ('error' in governed) return fail(governed.error)
  const p = governed.data
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
  // DRAFT-UNTIL-SUBMIT (ADR-920 Phase 5): born a private draft, never 'pending' — the review
  // queue used to receive a literal "Untitled practice" the moment this button was pressed.
  // The author submits from the builder's Library section when it is actually ready.
  // is_public stays FALSE for EVERYONE here (review defect: a Host's blank draft was briefly
  // born public, listing an "Untitled practice" in the library instantly). A Host+/staff
  // author's row is 'approved' (live to them, publishable without review) but enters the
  // public library only when they choose.
  //
  // THE GOVERNED WRITE (ADR-988, ADR-1249): the blank draft is still a member's create, so it
  // proposes, claims and commits through the same writer and lands in the audit log.
  const governed = await proposeAndConfirmCreate({
    entity: 'practice',
    draft: { title: 'Untitled practice' },
    rationale: 'Practice library, blank road: the author opened a fresh draft in the builder.',
    commit: async () => {
      const created = await createPractice({
        title: 'Untitled practice',
        createdBy: gate.profileId,
        isPublic: false,
        status: gate.autoApprove ? 'approved' : 'draft',
      })
      if (!created) throw new Error('Could not create practice')
      return created
    },
  })
  if ('error' in governed) return fail(governed.error)
  revalidatePath('/practices')
  return ok({ id: governed.data.id })
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

/** Coaching reads the current owner-gated draft and returns questions. It never saves. */
export async function buildPracticeWithVeraAction(id: string, description: string): Promise<ActionResult<{ aiUsed: boolean; questions: string[] }>> {
  const gate = await authorPractice(id)
  if ('error' in gate) return fail(gate.error)
  if (!description.trim()) return fail('Tell Vera what you want to work on first.')
  const coaching = await draftPracticeSpark({ who: '', act: description, outcome: '', cadence: 'daily', pace: 'light', sourceText: gate.practice?.body, profileId: gate.profileId })
  return ok({ aiUsed: !!coaching, questions: coaching?.questions ?? [...WRITING_COACHING_FALLBACK] })
}

/** Historical action name; zero fields are applied, even if a model returns replacements. */
export async function applyVeraPracticeChangeAction(id: string, request: string): Promise<ActionResult<{ applied: number; questions: string[] }>> {
  const gate = await authorPractice(id)
  if ('error' in gate) return fail(gate.error)
  if (!gate.practice) return fail('Practice not found')
  if (!request.trim()) return fail('Tell Vera what you want to work on first.')
  const p = gate.practice
  const coaching = await planPracticeEdits({ request, practice: { title: p.title ?? '', summary: p.summary ?? '', description: p.description ?? '', body: p.body ?? '', cadence: p.cadence ?? '' }, profileId: gate.profileId })
  return ok({ applied: 0, questions: coaching?.questions ?? [...WRITING_COACHING_FALLBACK] })
}

export interface PracticeRedrawResult { changes: []; kept: string[]; before: PracticeEdit; questions: string[] }
/** Legacy callers receive coaching without a content or steer-preference write. */
export async function redrawPracticeAction(id: string, input: { mood?: string | null; directions?: string | null; locked?: readonly string[] }): Promise<ActionResult<PracticeRedrawResult>> {
  const result = await applyVeraPracticeChangeAction(id, input.directions?.trim() || 'Help me review this practice in my own words.')
  if (isError(result)) return result
  return ok({ changes: [], kept: [], before: {}, questions: result.data.questions })
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
//
// `direction` (LIVE-645) is one of Vera's "Remix it" directions the member picked in the dialog.
// The fork is unchanged (lineage intact); the direction is then applied to the COPY through the
// same Vera edit path the builder uses (applyVeraPracticeChangeAction), so no second editor exists.
// If that edit fails or AI is off, the member still lands on their copy, exactly as a plain copy.
export async function forkPracticeAction(practiceId: string, direction?: string | null) {
  const profileId = await getMyProfileId()
  if (!profileId) return
  const copy = await forkPractice(profileId, practiceId)
  if (!copy) return
  await adoptPractice(profileId, copy.id)
  // A selected coaching direction is never an instruction to rewrite the copied template.
  void direction
  redirect(`/practices/${copy.id}/edit`)
}

// Vera's "Remix it" directions for the Remix dialog (LIVE-645): three short ways to take a
// practice, generated on open and never stored. An empty list (AI off, over budget, throttled) is
// not an error; the dialog simply stays the plain copy it always was. Only a practice the member
// could already read (public, or their own) is sent to the model.
export async function remixDirectionsAction(
  practiceId: string,
): Promise<ActionResult<{ directions: string[] }>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Not signed in')
  const practice = await getPractice(practiceId)
  if (!practice || (!practice.is_public && practice.created_by !== profileId)) return fail('Practice not found')
  const directions = await suggestRemixDirections({
    practice: {
      title: practice.title ?? '',
      summary: practice.summary,
      cadence: practice.cadence,
      durationMin: practice.duration_min,
      body: practice.body,
    },
    profileId,
  })
  return ok({ directions: directions ?? [] })
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
  // Public or own only (SCAN-726): this sends the body to the model, so it is a read of the guide.
  if (!template || (!template.is_public && template.created_by !== profileId)) return fail('Practice not found')
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
  // claimPractice refuses a private or non-template source (SCAN-726), so the claim Zaps below
  // only pay for a real template.
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
