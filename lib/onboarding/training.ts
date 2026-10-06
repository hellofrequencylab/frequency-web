import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { awardGems } from '@/lib/gems'
import type { CommunityRole } from '@/lib/core/roles'
import { TRAINING, doneStepIds, type TrainingDef } from './training-curriculum'
import { loadCurriculum } from './curriculum-store'

// Role-advancement training — DB layer (ADR-157 §7.2, ADR-224 §7.3–7.5). Every
// promotion assigns a training Journey for the role gained — a curated path through
// the role's help articles that teaches the functions it just unlocked. The
// curriculum itself (the registry + selectors + help-tag resolution) is the pure
// module training-curriculum.ts; this file owns the `training_paths` records
// (assigned → started → completed), the per-step progress (`completed_steps`, LIVE-690)
// and the one-time completion reward. Steps come from the EDITED curriculum
// (curriculum-store.ts); the reward always comes from the code registry.

export type { TrainingStep, TrainingDef } from './training-curriculum'
export { TRAINING } from './training-curriculum'

// `training_paths` is newer than the generated DB types — read/write through a
// loosely-typed client (the same escape hatch the feed RPCs use).
function tdb(): SupabaseClient {
  return createAdminClient()
}

/** Assign the training Journey for a role on promotion (idempotent). */
export async function assignTraining(profileId: string, role: CommunityRole): Promise<void> {
  if (!TRAINING[role]) return
  await tdb()
    .from('training_paths')
    .upsert({ profile_id: profileId, role, status: 'assigned' }, { onConflict: 'profile_id,role', ignoreDuplicates: true })
}

interface ActiveTraining extends TrainingDef {
  status: string
  /** Ids of the steps on the current path this member has marked done. */
  completedSteps: string[]
}

/** The member's most-recent unfinished training, or null. */
export async function getActiveTraining(profileId: string): Promise<ActiveTraining | null> {
  const { data } = await tdb()
    .from('training_paths')
    .select('role, status, completed_steps')
    .eq('profile_id', profileId)
    .neq('status', 'completed')
    .order('assigned_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const row = data as { role: CommunityRole; status: string; completed_steps: string[] | null } | null
  if (!row) return null
  const def = (await loadCurriculum()).defs[row.role]
  return def ? { ...def, status: row.status, completedSteps: doneStepIds(def.steps, row.completed_steps) } : null
}

/**
 * Mark one step of a member's training done or not done (LIVE-690). The step must be on the
 * role's current path; the first step marked moves the path to `started`. Never touches a
 * completed path. Returns false when nothing could be recorded.
 */
export async function setTrainingStep(profileId: string, role: CommunityRole, stepId: string, done: boolean): Promise<boolean> {
  const def = (await loadCurriculum()).defs[role]
  if (!def || !def.steps.some((s) => s.id === stepId)) return false
  const admin = tdb()
  const { data } = await admin
    .from('training_paths')
    .select('status, started_at, completed_steps')
    .eq('profile_id', profileId)
    .eq('role', role)
    .maybeSingle()
  const row = data as { status: string; started_at: string | null; completed_steps: string[] | null } | null
  if (!row || row.status === 'completed') return false

  const kept = (row.completed_steps ?? []).filter((id) => id !== stepId)
  const next = done ? [...kept, stepId] : kept
  const patch: Record<string, unknown> = { completed_steps: next }
  if (row.status === 'assigned' && next.length > 0) patch.status = 'started'
  if (!row.started_at && next.length > 0) patch.started_at = new Date().toISOString()
  const { error } = await admin.from('training_paths').update(patch).eq('profile_id', profileId).eq('role', role)
  return !error
}

/** Mark a role's training complete + pay the one-time reward (idempotent). */
export async function completeTraining(profileId: string, role: CommunityRole): Promise<void> {
  const admin = tdb()
  const { data } = await admin
    .from('training_paths')
    .select('status')
    .eq('profile_id', profileId)
    .eq('role', role)
    .maybeSingle()
  const row = data as { status: string } | null
  if (!row || row.status === 'completed') return // unknown or already done — no double-pay

  await admin
    .from('training_paths')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('profile_id', profileId)
    .eq('role', role)

  const reward = TRAINING[role]?.reward ?? 0
  if (reward > 0) await awardGems(profileId, 'achievement', reward, { reason: 'training_complete', role })
}
