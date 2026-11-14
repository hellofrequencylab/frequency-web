// THE LAUNCH STORE (VLS-01). Reads and writes the person's own space_launch row under their session (RLS:
// owner only), so this file holds no authorization of its own beyond naming the owner it acts for. The rules
// (when a cancel may finish) are lib/launch/state.ts. Server-only.

import { randomUUID } from 'node:crypto'
import { parseWizardResume, type WizardResume } from './wizard-resume'
import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/lib/database.types'
import { canConfirmCancel, publishStep, resumeStep, skipPhoto, stageOf, stepsWithSkips, toSnapshot, type CancelDecision, type LaunchSnapshot } from './state'
import { readStoredBuildout, type StoredBuildout } from './buildout'
import { expireSources } from './shelf-io'
import type { LaunchStepId } from './steps'

const COLUMNS =
  'id, owner_id, space_id, niche, intents, stage, current_step, steps, minimized, started_at, updated_at, cancel_requested_at, cancelled_at, completed_at'

/** Private drafts enter owner reads only after the full preview/builder decoder accepts them. */
function ownerSnapshot(row: Record<string, unknown> | null | undefined): LaunchSnapshot | null {
  const snapshot = toSnapshot(row)
  if (!snapshot || !row) return null
  const metadata = row.steps && typeof row.steps === 'object' ? row.steps as Record<string, unknown> : {}
  const resume = parseWizardResume(metadata.wizardResume)
  if (resume) snapshot.resume = resume
  else delete snapshot.resume
  return snapshot
}

/** The launch this person can still resume, or null. At most one exists (the table's unique index). */
export async function getActiveLaunch(ownerId: string): Promise<LaunchSnapshot | null> {
  const db = await createClient()
  const { data } = await db.from('space_launch').select(COLUMNS).eq('owner_id', ownerId).is('cancelled_at', null).is('completed_at', null).maybeSingle()
  return ownerSnapshot(data as Record<string, unknown> | null)
}

/** One of this person's launches, active or not: the one named by `launchId`, or their most recent. Null for a
 *  launch that is not theirs (the owner policy returns no row), so a stranger's link finds nothing. */
export async function getLaunchForOwner(ownerId: string, launchId?: string): Promise<LaunchSnapshot | null> {
  const db = await createClient()
  let q = db.from('space_launch').select(COLUMNS).eq('owner_id', ownerId)
  q = launchId ? q.eq('id', launchId) : q.order('started_at', { ascending: false }).limit(1)
  const { data } = await q.maybeSingle()
  return ownerSnapshot(data as Record<string, unknown> | null)
}

/** Everything on the list is ticked: the launch is finished. Idempotent and owner-only; once set, the launch box, the clock
 *  and the come-back emails all stand down, and /launch reads "done". */
export async function completeLaunch(l: LaunchSnapshot, now = new Date()): Promise<boolean> {
  const db = await createClient()
  const { error } = await db.from('space_launch').update({ completed_at: now.toISOString(), updated_at: now.toISOString() }).eq('id', l.id).eq('owner_id', l.ownerId).is('cancelled_at', null).is('completed_at', null)
  return !error
}

/** Start a launch, or hand back the one already running: a second tap never makes a second launch. */
export async function startLaunch(ownerId: string, input: { niche: string | null; intents: string[] }): Promise<LaunchSnapshot | null> {
  const existing = await getActiveLaunch(ownerId)
  if (existing) return existing
  const db = await createClient()
  const { data, error } = await db.from('space_launch').insert({ owner_id: ownerId, niche: input.niche, intents: input.intents }).select(COLUMNS).single()
  if (error) return getActiveLaunch(ownerId) // lost a race with another tap: the unique index kept it to one
  return ownerSnapshot(data as Record<string, unknown>)
}

export async function setMinimized(l: LaunchSnapshot, minimized: boolean): Promise<boolean> {
  const db = await createClient()
  const { error } = await db.from('space_launch').update({ minimized, updated_at: new Date().toISOString() }).eq('id', l.id).eq('owner_id', l.ownerId).is('cancelled_at', null).is('completed_at', null)
  return !error
}

/** Cancel, call one: record the request. The launch stays active. */
export async function requestCancel(l: LaunchSnapshot, now = new Date()): Promise<boolean> {
  const db = await createClient()
  const { error } = await db.from('space_launch').update({ cancel_requested_at: now.toISOString(), updated_at: now.toISOString() }).eq('id', l.id).eq('owner_id', l.ownerId).is('cancelled_at', null).is('completed_at', null)
  return !error
}

/** Cancel, call two: needs the request from call one (inside the window) and the typed word. */
export async function confirmCancel(l: LaunchSnapshot, typed: unknown, now = new Date()): Promise<CancelDecision> {
  const decision = canConfirmCancel(l, typed, now)
  if (!decision.ok) return decision
  const db = await createClient()
  const { error } = await db.from('space_launch').update({ cancelled_at: now.toISOString(), updated_at: now.toISOString() }).eq('id', l.id).eq('owner_id', l.ownerId).is('cancelled_at', null).is('completed_at', null).not('cancel_requested_at', 'is', null)
  if (error) return { ok: false, reason: 'not_active' }
  await expireSources(l.id, now) // the sources are kept thirty days, then swept
  return decision
}

/** Serialize the fresh photo state through the established seam, then add validated owner-only metadata. */
function storedSteps(steps: LaunchSnapshot['steps'], l: LaunchSnapshot, resume: WizardResume | undefined, revision: string): Record<string, unknown> {
  return { ...stepsWithSkips(steps, l.skippedPhotos), ...(resume ? { wizardResume: resume } : {}), stepsRevision: revision }
}

/** Every steps writer reads fresh and compares an opaque revision. No private draft text enters a filter URL.
 * Legacy rows compare the absent revision; the first successful write installs one, even in the same millisecond. */
async function mutateSteps(l: LaunchSnapshot, mutate: (fresh: LaunchSnapshot) => { steps?: LaunchSnapshot['steps']; skipped?: string[]; resume?: WizardResume; requireUnattached?: true } | null, now: Date, claim?: { heldSavedAt: string }): Promise<LaunchSnapshot | null> {
  const heldAt = claim ? Date.parse(claim.heldSavedAt) : null
  if (claim && !Number.isFinite(heldAt)) return null
  for (let attempt = 0; attempt < 4; attempt++) {
    const fresh = await getLaunchForOwner(l.ownerId, l.id)
    if (!fresh || fresh.cancelledAt || fresh.completedAt) return null
    // Claiming is a transfer from a prior browser hold, unlike ordinary live progress writes.
    // Recheck freshness and attachment after every CAS collision, not just at the route read.
    if (claim && (fresh.spaceId || (fresh.resume && !(Number(heldAt) > Date.parse(fresh.updatedAt))))) return null
    const change = mutate(fresh)
    if (!change) return null
    const steps = change.steps ?? fresh.steps
    const next = resumeStep(fresh.niche, fresh.intents, steps) ?? fresh.currentStep
    const db = await createClient()
    let query = db.from('space_launch').update({
      steps: storedSteps(steps, { ...fresh, skippedPhotos: change.skipped ?? fresh.skippedPhotos }, change.resume ?? fresh.resume, randomUUID()) as unknown as Json,
      current_step: next, stage: stageOf(next), updated_at: now.toISOString(),
    }).eq('id', fresh.id).eq('owner_id', fresh.ownerId).is('cancelled_at', null).is('completed_at', null)
    query = fresh.stepsRevision ? query.eq('steps->>stepsRevision', fresh.stepsRevision) : query.is('steps->>stepsRevision', null)
    // Attachment and other non-steps writers do not advance stepsRevision. These scalar
    // predicates prevent a claim from racing them without exposing private JSON in URLs.
    if (claim) query = query.eq('updated_at', fresh.updatedAt)
    if (claim || change.requireUnattached) query = query.is('space_id', null)
    const { data, error } = await query.select(COLUMNS).maybeSingle()
    if (error) return null
    if (data) return ownerSnapshot(data as Record<string, unknown>)
  }
  return null
}

/** Save only this launch owner's bounded shared cursor. It never rewrites the published step record. */
export async function saveWizardResume(l: LaunchSnapshot, input: unknown, now = new Date(), options?: { heldSavedAt?: string; requireUnattached?: boolean }): Promise<LaunchSnapshot | null> {
  const resume = parseWizardResume(input)
  const claim = options?.heldSavedAt === undefined ? undefined : { heldSavedAt: options.heldSavedAt }
  return resume ? mutateSteps(l, (fresh) => {
    // An in-flight builder autosave must not rewind a completed hand-over or a Space
    // attachment after the action's initial read. This runs again after every collision.
    if (resume.phase === 'builder' && (fresh.spaceId || fresh.resume?.phase === 'launch')) return null
    if (options?.requireUnattached && fresh.spaceId) return null
    return { resume, ...(resume.phase === 'builder' || options?.requireUnattached ? { requireUnattached: true as const } : {}) }
  }, now, claim) : null
}

/** A step's real thing now exists. Called by the step's own server code, never from the client. */
export function markStepPublished(l: LaunchSnapshot, id: LaunchStepId, ref?: string, now = new Date()) {
  return mutateSteps(l, (fresh) => ({ steps: publishStep(fresh.steps, id, now, ref) }), now)
}

/** Remember which Space belongs to this launch, once the Spotlight step has made it. */
export async function attachSpace(l: LaunchSnapshot, spaceId: string): Promise<boolean> {
  const db = await createClient()
  const { error } = await db.from('space_launch').update({ space_id: spaceId, updated_at: new Date().toISOString() }).eq('id', l.id).eq('owner_id', l.ownerId)
  return !error
}

/** The draft Vera built from this launch's words, or null if none yet (the column is null until the first build). */
export async function getBuildout(l: LaunchSnapshot): Promise<StoredBuildout | null> {
  const db = await createClient()
  const { data } = await db.from('space_launch').select('buildout').eq('id', l.id).eq('owner_id', l.ownerId).maybeSingle()
  return readStoredBuildout(data?.buildout)
}

export async function setBuildout(l: LaunchSnapshot, stored: StoredBuildout): Promise<boolean> {
  const db = await createClient()
  const { error } = await db.from('space_launch').update({ buildout: stored as unknown as Json, updated_at: new Date().toISOString() }).eq('id', l.id).eq('owner_id', l.ownerId).is('cancelled_at', null).is('completed_at', null)
  return !error
}

/** "Skip for now" on a photo item. Kept in the launch row's steps column, so it survives a reload. Nothing is
 *  published or lost: the item stays on the list. */
export async function skipPhotoItem(l: LaunchSnapshot, itemId: string, now = new Date()): Promise<boolean> {
  return !!(await mutateSteps(l, (fresh) => {
    const skipped = skipPhoto(fresh.skippedPhotos, itemId)
    return skipped ? { skipped } : null
  }, now))
}
