// Playbook run log writes (Resonance Engine Phase 1 - ADR-382). The IO seam for
// `playbook_runs`: records a run's outcome (the operator ran it, or dismissed it as the
// training signal). PURE/IO split kept minimal; this is the thin write side.
//
// The table is not in the generated DB types until the migration applies, so this reaches
// it through the untyped admin client (ADR-246), FAIL-SAFE: any error returns false and
// never throws (a broken audit write must never break the operator's action).
//
// authz-delegated: this is a system/owner-scoped audit FRONT DOOR (like
// lib/crm/interactions.ts). Every write is stamped with the actor + scope the calling
// server action already authorized; there is no per-caller scope to enforce here. The gate
// lives at the call site (requireAdmin in the Today action).

import { createAdminClient } from '@/lib/supabase/admin'

export type PlaybookRunStatus = 'proposed' | 'done' | 'dismissed' | 'failed'
export type PlaybookSubjectKind = 'contact' | 'network_contact' | 'profile'

const STATUSES: readonly PlaybookRunStatus[] = ['proposed', 'done', 'dismissed', 'failed']
const SUBJECT_KINDS: readonly PlaybookSubjectKind[] = ['contact', 'network_contact', 'profile']

export interface RecordPlaybookRunInput {
  playbookId: string
  subjectKind: PlaybookSubjectKind
  subjectId: string
  actorProfileId: string
  status: PlaybookRunStatus
  outcome?: string | null
  spaceId?: string | null
}

interface PlaybookRunInsert {
  playbook_id: string
  subject_kind: PlaybookSubjectKind
  subject_id: string
  actor_profile_id: string
  status: PlaybookRunStatus
  outcome: string | null
  space_id: string | null
  ended_at: string | null
}

/** Validate + normalize one run row, or null when the input is invalid. Pure. */
export function buildPlaybookRunInsert(input: RecordPlaybookRunInput): PlaybookRunInsert | null {
  const playbookId = typeof input.playbookId === 'string' ? input.playbookId.trim() : ''
  const subjectId = typeof input.subjectId === 'string' ? input.subjectId.trim() : ''
  const actor = typeof input.actorProfileId === 'string' ? input.actorProfileId.trim() : ''
  if (!playbookId || !subjectId || !actor) return null
  if (!SUBJECT_KINDS.includes(input.subjectKind)) return null
  if (!STATUSES.includes(input.status)) return null
  const terminal = input.status === 'done' || input.status === 'dismissed' || input.status === 'failed'
  return {
    playbook_id: playbookId,
    subject_kind: input.subjectKind,
    subject_id: subjectId,
    actor_profile_id: actor,
    status: input.status,
    outcome: typeof input.outcome === 'string' && input.outcome.trim().length ? input.outcome.trim().slice(0, 500) : null,
    space_id: typeof input.spaceId === 'string' && input.spaceId.trim().length ? input.spaceId.trim() : null,
    ended_at: terminal ? new Date().toISOString() : null,
  }
}

/**
 * Record one playbook run outcome. FAIL-SAFE: false on an invalid input or a write error,
 * never throws. The caller has authorized the actor + scope (see the authz note above).
 */
export async function recordPlaybookRun(input: RecordPlaybookRunInput): Promise<boolean> {
  const row = buildPlaybookRunInsert(input)
  if (!row) return false
  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => { insert: (rows: PlaybookRunInsert[]) => Promise<{ error: unknown }> }
    }
    const { error } = await db.from('playbook_runs').insert([row])
    return !error
  } catch {
    return false
  }
}
