// The crew verification queue: every HELD completion (verification-gated Zaps, ADR-418).
//
// The held marker is verified_at (null = held; see 20261009000000_verification_gated_zaps.sql).
// verified_by is NOT a held marker: an ordinary completion never gets it, and the auto-methods
// (timer / location / code) stamp verified_at only. SCAN-752: the queue used to select by
// verified_by null, limit to 50, and only THEN drop rows whose task does not require verification
// in JS, so once fifty ordinary completions existed the page read fifty ordinary rows, filtered
// every one of them out, and rendered an empty queue forever while the held Zaps never released.
// Both filters now run in SQL before the limit, through an inner join on the task.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

export const VERIFICATION_QUEUE_LIMIT = 50

export interface HeldCompletion {
  id: string
  completed_at: string
  zaps_earned: number
  /** circle_id is null for a global-catalogue task; set for a circle-scoped one. */
  task: { id: string; name: string; zaps_value: number; circle_id: string | null } | null
  member: { id: string; display_name: string; handle: string; avatar_url: string | null } | null
}

/** Oldest-first list of held completions whose task requires verification: global and circle-scoped alike. */
export async function listHeldCompletions(admin: SupabaseClient = createAdminClient()): Promise<HeldCompletion[]> {
  const { data, error } = await admin
    .from('crew_completions')
    .select(`
      id, completed_at, zaps_earned,
      task:crew_tasks!task_id!inner ( id, name, zaps_value, circle_id ),
      member:profiles!profile_id ( id, display_name, handle, avatar_url )
    `)
    .is('verified_at', null)
    .eq('task.requires_verification', true)
    .order('completed_at', { ascending: true })
    .limit(VERIFICATION_QUEUE_LIMIT)
  if (error) throw new Error(error.message)
  return ((data ?? []) as unknown as HeldCompletion[]).map((c) => ({ ...c, zaps_earned: c.zaps_earned ?? 0 }))
}
