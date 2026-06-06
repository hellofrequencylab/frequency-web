import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { awardGems } from '@/lib/gems'
import type { CommunityRole } from '@/lib/core/roles'

// `training_paths` is newer than the generated DB types — read/write through a
// loosely-typed client (the same escape hatch the feed RPCs use).
function tdb(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient
}

// Role-advancement training (ADR-157, build §7). Every promotion assigns a training
// Journey for the role gained — a curated path through the role's help articles that
// teaches the functions it just unlocked. The curriculum is a registry for now
// (7.5 makes it owner-editable); records live in `training_paths` (7.2).

export interface TrainingStep {
  label: string
  href: string
}

export interface TrainingDef {
  role: CommunityRole
  title: string
  blurb: string
  steps: TrainingStep[]
  /** Gems paid once on completion (online training → gems, ADR-139). */
  reward: number
}

// The member rung already exists (the induction + activation funnel), so training
// starts at the first paid/earned step. Extend as roles gain surfaces.
export const TRAINING: Partial<Record<CommunityRole, TrainingDef>> = {
  crew: {
    role: 'crew',
    title: 'Welcome to Crew',
    blurb: 'You’re in. Here’s how to get the most out of the community — find your circles and start a practice.',
    steps: [
      { label: 'Join a local circle', href: '/help/getting-started/join-a-circle' },
      { label: 'Adopt a practice', href: '/help/getting-started/practices' },
      { label: 'Follow a Journey', href: '/help/the-game/your-journey' },
      { label: 'Earn zaps & gems', href: '/help/the-game/zaps-and-gems' },
    ],
    reward: 15,
  },
  host: {
    role: 'host',
    title: 'Host Training',
    blurb: 'You can host now. This walks you through running a circle and the admin tools you just unlocked.',
    steps: [
      { label: 'Run events', href: '/help/groups/events' },
      { label: 'Use channels', href: '/help/groups/channels' },
      { label: 'Send a broadcast', href: '/help/sharing/broadcasts' },
      { label: 'Hubs & scope', href: '/help/groups/hubs' },
    ],
    reward: 25,
  },
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
