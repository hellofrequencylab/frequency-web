// THE LAUNCH STATE (VLS-01). What one person's launch remembers, as PURE functions over the shape of a
// space_launch row, so the save, resume and cancel rules can be tested and probed with no database.
//
// The row (supabase/migrations/20270346026000_vera_launch.sql) holds a cursor (current_step) and a per-step
// record (steps jsonb). Everything here reads and writes that shape and nothing else: the IO lives in
// lib/launch/store.ts, the client-callable seam in lib/launch/actions.ts. Whether a step's real thing exists
// is lib/launch/done-checks.ts; this file only remembers where the person stopped and what they skipped.
//
// CANCEL IS TWO CALLS. The first records cancel_requested_at, the second must carry the typed word STOP and
// arrive inside CANCEL_WINDOW_MS of the first. One call, a wrong word or a stale request leaves the launch
// active. The database holds the other half (cancelled_at needs cancel_requested_at).

import { isLaunchStepId, isSkippable, orderedLaunchSteps, type LaunchStepId } from './steps.ts'

type LaunchStepStatus = 'started' | 'published' | 'skipped'

interface LaunchStepEntry {
  status: LaunchStepStatus
  startedAt?: string
  publishedAt?: string
  skippedAt?: string
  /** An opaque reference to what the step made (a Space slug, an event id). Never a person's own words. */
  ref?: string
}

type LaunchSteps = Partial<Record<LaunchStepId, LaunchStepEntry>>

/** The row as the app reads it, camelCased. */
interface LaunchSnapshot {
  id: string
  ownerId: string
  spaceId: string | null
  niche: string | null
  intents: string[]
  stage: 'found' | 'gather' | 'keep'
  currentStep: LaunchStepId
  steps: LaunchSteps
  minimized: boolean
  startedAt: string
  updatedAt: string
  cancelRequestedAt: string | null
  cancelledAt: string | null
  completedAt: string | null
}

/** The word a person types to confirm a cancel. */
const CANCEL_WORD = 'STOP'
/** How long a cancel request stays open for its confirmation. */
export const CANCEL_WINDOW_MS = 15 * 60 * 1000

const STATUSES: readonly LaunchStepStatus[] = ['started', 'published', 'skipped']
const MAX_REF = 200

const isoOrUndefined = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v)) ? v : undefined

/** The steps record as the database hands it back: anything off the closed list, any junk status, time or
 *  reference is dropped, so a hand-edited row cannot break a screen. Total. */
export function normalizeSteps(raw: unknown): LaunchSteps {
  const out: LaunchSteps = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!isLaunchStepId(id) || !v || typeof v !== 'object' || Array.isArray(v)) continue
    const e = v as Record<string, unknown>
    if (!STATUSES.includes(e.status as LaunchStepStatus)) continue
    const entry: LaunchStepEntry = { status: e.status as LaunchStepStatus }
    const startedAt = isoOrUndefined(e.startedAt)
    const publishedAt = isoOrUndefined(e.publishedAt)
    const skippedAt = isoOrUndefined(e.skippedAt)
    if (startedAt) entry.startedAt = startedAt
    if (publishedAt) entry.publishedAt = publishedAt
    if (skippedAt) entry.skippedAt = skippedAt
    if (typeof e.ref === 'string' && e.ref.length > 0 && e.ref.length <= MAX_REF) entry.ref = e.ref
    out[id] = entry
  }
  return out
}

/** A step is settled once it is published or skipped. */
function isSettled(entry: LaunchStepEntry | undefined): boolean {
  return entry?.status === 'published' || entry?.status === 'skipped'
}

/** The person opened a step. A settled step stays settled (reopening it does not undo it). */
export function startStep(steps: LaunchSteps, id: LaunchStepId, now: Date): LaunchSteps {
  if (isSettled(steps[id])) return steps
  return { ...steps, [id]: { ...steps[id], status: 'started', startedAt: steps[id]?.startedAt ?? now.toISOString() } }
}

/** The step's real thing now exists. Keeps when it started and drops any earlier skip. */
export function publishStep(steps: LaunchSteps, id: LaunchStepId, now: Date, ref?: string): LaunchSteps {
  const prev = steps[id]
  const entry: LaunchStepEntry = { status: 'published', startedAt: prev?.startedAt ?? now.toISOString(), publishedAt: now.toISOString() }
  const keep = ref ?? prev?.ref
  if (keep && keep.length <= MAX_REF) entry.ref = keep
  return { ...steps, [id]: entry }
}

/** Skip a step. Null when the step is required, so the caller cannot skip past a step that counts as launched. */
export function skipStep(steps: LaunchSteps, id: LaunchStepId, now: Date): LaunchSteps | null {
  if (!isSkippable(id)) return null
  if (steps[id]?.status === 'published') return steps
  return { ...steps, [id]: { status: 'skipped', startedAt: steps[id]?.startedAt, skippedAt: now.toISOString() } }
}

/** Where a person resumes: the first step, in their own order, that is neither published nor skipped.
 *  Null when every step is settled. Total: junk niche or intents read as the default order. */
export function resumeStep(
  niche: string | null | undefined,
  intents: readonly unknown[] | null | undefined,
  steps: LaunchSteps,
): LaunchStepId | null {
  return orderedLaunchSteps(niche, intents).find((s) => !isSettled(steps[s.id]))?.id ?? null
}

/** The stage a step belongs to, for the row's stage column. */
export function stageOf(id: LaunchStepId): LaunchSnapshot['stage'] {
  return orderedLaunchSteps(null, null).find((s) => s.id === id)!.stage
}

type LaunchPhase = 'active' | 'cancel_requested' | 'cancelled' | 'completed'

export function launchPhase(l: Pick<LaunchSnapshot, 'cancelRequestedAt' | 'cancelledAt' | 'completedAt'>, now: Date): LaunchPhase {
  if (l.completedAt) return 'completed'
  if (l.cancelledAt) return 'cancelled'
  if (l.cancelRequestedAt && now.getTime() - Date.parse(l.cancelRequestedAt) <= CANCEL_WINDOW_MS) return 'cancel_requested'
  return 'active'
}

/** An active launch is one a person can still resume: neither completed nor cancelled. */
export function isActive(l: Pick<LaunchSnapshot, 'cancelledAt' | 'completedAt'>): boolean {
  return !l.cancelledAt && !l.completedAt
}

type CancelDecision = { ok: true } | { ok: false; reason: 'not_requested' | 'expired' | 'wrong_word' | 'not_active' }

/** May this confirmation finish the cancel? Only a request made inside the window, with the typed word. */
export function canConfirmCancel(
  l: Pick<LaunchSnapshot, 'cancelRequestedAt' | 'cancelledAt' | 'completedAt'>,
  typed: unknown,
  now: Date,
): CancelDecision {
  if (!isActive(l)) return { ok: false, reason: 'not_active' }
  if (!l.cancelRequestedAt) return { ok: false, reason: 'not_requested' }
  if (now.getTime() - Date.parse(l.cancelRequestedAt) > CANCEL_WINDOW_MS) return { ok: false, reason: 'expired' }
  if (typeof typed !== 'string' || typed.trim().toUpperCase() !== CANCEL_WORD) return { ok: false, reason: 'wrong_word' }
  return { ok: true }
}

/** A row from space_launch, defensively read. Null when the fields the app leans on are missing. */
export function toSnapshot(row: Record<string, unknown> | null | undefined): LaunchSnapshot | null {
  if (!row) return null
  const str = (k: string): string | null => (typeof row[k] === 'string' ? (row[k] as string) : null)
  const id = str('id'), ownerId = str('owner_id'), startedAt = str('started_at'), updatedAt = str('updated_at')
  if (!id || !ownerId || !startedAt || !updatedAt) return null
  const steps = normalizeSteps(row.steps)
  const intents = Array.isArray(row.intents) ? row.intents.filter((v): v is string => typeof v === 'string') : []
  const niche = str('niche')
  const stored = str('current_step')
  const currentStep = stored && isLaunchStepId(stored) ? stored : (resumeStep(niche, intents, steps) ?? 'spotlight')
  const stage = row.stage === 'gather' || row.stage === 'keep' ? row.stage : 'found'
  return {
    id, ownerId, spaceId: str('space_id'), niche, intents, stage, currentStep, steps,
    minimized: row.minimized === true, startedAt, updatedAt,
    cancelRequestedAt: str('cancel_requested_at'), cancelledAt: str('cancelled_at'), completedAt: str('completed_at'),
  }
}
