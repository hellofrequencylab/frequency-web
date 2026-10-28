// THE LAUNCH STORE (VLS-01). Reads and writes the person's own space_launch row under their session (RLS:
// owner only), so this file holds no authorization of its own beyond naming the owner it acts for. The rules
// (when a cancel may finish) are lib/launch/state.ts. Server-only.

import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/lib/database.types'
import { canConfirmCancel, publishStep, resumeStep, stageOf, toSnapshot, type CancelDecision, type LaunchSnapshot } from './state'
import { expireSources } from './shelf-io'
import type { LaunchStepId } from './steps'

const COLUMNS =
  'id, owner_id, space_id, niche, intents, stage, current_step, steps, minimized, started_at, updated_at, cancel_requested_at, cancelled_at, completed_at'

/** The launch this person can still resume, or null. At most one exists (the table's unique index). */
export async function getActiveLaunch(ownerId: string): Promise<LaunchSnapshot | null> {
  const db = await createClient()
  const { data } = await db.from('space_launch').select(COLUMNS).eq('owner_id', ownerId).is('cancelled_at', null).is('completed_at', null).maybeSingle()
  return toSnapshot(data as Record<string, unknown> | null)
}

/** One of this person's launches, active or not: the one named by `launchId`, or their most recent. Null for a
 *  launch that is not theirs (the owner policy returns no row), so a stranger's link finds nothing. */
export async function getLaunchForOwner(ownerId: string, launchId?: string): Promise<LaunchSnapshot | null> {
  const db = await createClient()
  let q = db.from('space_launch').select(COLUMNS).eq('owner_id', ownerId)
  q = launchId ? q.eq('id', launchId) : q.order('started_at', { ascending: false }).limit(1)
  const { data } = await q.maybeSingle()
  return toSnapshot(data as Record<string, unknown> | null)
}

/** Start a launch, or hand back the one already running: a second tap never makes a second launch. */
export async function startLaunch(ownerId: string, input: { niche: string | null; intents: string[] }): Promise<LaunchSnapshot | null> {
  const existing = await getActiveLaunch(ownerId)
  if (existing) return existing
  const db = await createClient()
  const { data, error } = await db.from('space_launch').insert({ owner_id: ownerId, niche: input.niche, intents: input.intents }).select(COLUMNS).single()
  if (error) return getActiveLaunch(ownerId) // lost a race with another tap: the unique index kept it to one
  return toSnapshot(data as Record<string, unknown>)
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

async function writeSteps(l: LaunchSnapshot, steps: LaunchSnapshot['steps'], now: Date): Promise<LaunchSnapshot | null> {
  const next = resumeStep(l.niche, l.intents, steps) ?? l.currentStep
  const db = await createClient()
  const { data, error } = await db
    .from('space_launch')
    .update({ steps: steps as unknown as Json, current_step: next, stage: stageOf(next), updated_at: now.toISOString() })
    .eq('id', l.id)
    .eq('owner_id', l.ownerId)
    .is('cancelled_at', null)
    .is('completed_at', null)
    .select(COLUMNS)
    .maybeSingle()
  return error ? null : toSnapshot(data as Record<string, unknown> | null)
}

/** A step's real thing now exists. Called by the step's own server code, never from the client. */
export function markStepPublished(l: LaunchSnapshot, id: LaunchStepId, ref?: string, now = new Date()) {
  return writeSteps(l, publishStep(l.steps, id, now, ref), now)
}

/** Remember which Space belongs to this launch, once the Spotlight step has made it. */
export async function attachSpace(l: LaunchSnapshot, spaceId: string): Promise<boolean> {
  const db = await createClient()
  const { error } = await db.from('space_launch').update({ space_id: spaceId, updated_at: new Date().toISOString() }).eq('id', l.id).eq('owner_id', l.ownerId)
  return !error
}
