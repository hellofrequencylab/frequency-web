import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { awardGems } from '@/lib/gems'
import type { CommunityRole } from '@/lib/core/roles'
import { TRAINING, type TrainingDef } from './training-curriculum'

// Role-advancement training — DB layer (ADR-157 §7.2, ADR-224 §7.3–7.5). Every
// promotion assigns a training Journey for the role gained — a curated path through
// the role's help articles that teaches the functions it just unlocked. The
// curriculum itself (the registry + selectors + help-tag resolution) is the pure
// module training-curriculum.ts; this file owns the `training_paths` records
// (assigned → started → completed) and the one-time completion reward.

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

export interface ActiveTraining extends TrainingDef {
  status: string
}

/** The member's most-recent unfinished training, or null. */
export async function getActiveTraining(profileId: string): Promise<ActiveTraining | null> {
  const { data } = await tdb()
    .from('training_paths')
    .select('role, status')
    .eq('profile_id', profileId)
    .neq('status', 'completed')
    .order('assigned_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const row = data as { role: CommunityRole; status: string } | null
  if (!row) return null
  const def = TRAINING[row.role]
  return def ? { ...def, status: row.status } : null
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
