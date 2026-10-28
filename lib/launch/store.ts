// THE LAUNCH STORE (VLS-01). Reads and writes the person's own space_launch row under their session (RLS:
// owner only), so this file holds no authorization of its own beyond naming the owner it acts for. The rules
// (when a cancel may finish) are lib/launch/state.ts. Server-only.

import { createClient } from '@/lib/supabase/server'
import { canConfirmCancel, toSnapshot, type CancelDecision, type LaunchSnapshot } from './state'

const COLUMNS =
  'id, owner_id, space_id, niche, intents, stage, current_step, steps, minimized, started_at, updated_at, cancel_requested_at, cancelled_at, completed_at'

/** The launch this person can still resume, or null. At most one exists (the table's unique index). */
export async function getActiveLaunch(ownerId: string): Promise<LaunchSnapshot | null> {
  const db = await createClient()
  const { data } = await db.from('space_launch').select(COLUMNS).eq('owner_id', ownerId).is('cancelled_at', null).is('completed_at', null).maybeSingle()
  return toSnapshot(data as Record<string, unknown> | null)
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
  return error ? { ok: false, reason: 'not_active' } : decision
}
