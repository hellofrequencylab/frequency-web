// Beta Command Center: typed reads/writes for beta_phases (the P0..P4 plan).
//
// Reads are ungated (the /admin/beta layout gates entry). Writes self-gate on
// the CONTENT WRITER gate (writerGate) — editing a phase's content or status is
// not a send, so it does not need the approver. Server-only; untyped-admin
// handle until the generated types regenerate.

import { revalidatePath } from 'next/cache'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import { betaDb } from './db'
import { writerGate } from './guard'

export const PHASE_STATUSES = ['not_started', 'in_progress', 'done'] as const
export type PhaseStatus = (typeof PHASE_STATUSES)[number]

export interface BetaPhase {
  id: string
  key: string
  title: string
  goal: string
  summary: string
  status: PhaseStatus
  position: number
  startsOn: string | null
  endsOn: string | null
}

const PHASE_COLS = 'id, key, title, goal, summary, status, position, starts_on, ends_on'

function mapPhase(r: Record<string, unknown>): BetaPhase {
  return {
    id: String(r.id),
    key: String(r.key),
    title: String(r.title ?? ''),
    goal: String(r.goal ?? ''),
    summary: String(r.summary ?? ''),
    status: (r.status as PhaseStatus) ?? 'not_started',
    position: Number(r.position ?? 0),
    startsOn: (r.starts_on as string) ?? null,
    endsOn: (r.ends_on as string) ?? null,
  }
}

/** All phases in plan order. FAIL-SAFE to []. */
export async function listPhases(): Promise<BetaPhase[]> {
  try {
    const { data } = await betaDb()
      .from('beta_phases')
      .select(PHASE_COLS)
      .order('position', { ascending: true })
    return (data ?? []).map(mapPhase)
  } catch (err) {
    console.error('[beta] listPhases failed:', err)
    return []
  }
}

/** One phase by id, or null. */
export async function getPhase(id: string): Promise<BetaPhase | null> {
  try {
    const { data } = await betaDb().from('beta_phases').select(PHASE_COLS).eq('id', id).maybeSingle()
    return data ? mapPhase(data) : null
  } catch (err) {
    console.error('[beta] getPhase failed:', err)
    return null
  }
}

/** Set a phase's lifecycle status. Content-writer gated. */
export async function updatePhaseStatus(id: string, status: PhaseStatus): Promise<ActionResult> {
  const gate = await writerGate()
  if (!gate.ok) return fail(gate.error)
  if (!PHASE_STATUSES.includes(status)) return fail('Unknown phase status.')
  const { error } = await betaDb()
    .from('beta_phases')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return fail('Could not update the phase.')
  revalidatePath('/admin/beta')
  return ok()
}

/** Persist a new phase order (ids in the desired order). Content-writer gated. */
export async function reorderPhases(orderedIds: string[]): Promise<ActionResult> {
  const gate = await writerGate()
  if (!gate.ok) return fail(gate.error)
  const db = betaDb()
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await db
      .from('beta_phases')
      .update({ position: i, updated_at: new Date().toISOString() })
      .eq('id', orderedIds[i])
    if (error) return fail('Could not reorder the phases.')
  }
  revalidatePath('/admin/beta')
  return ok()
}
