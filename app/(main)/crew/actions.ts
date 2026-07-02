'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { processGamificationEvent, recordStreakActivity } from '@/lib/achievements'

export async function logCompletion(taskId: string) {
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in')

  const admin = createAdminClient()

  // Load task to check repeatability and zaps value
  const { data: task } = await admin
    .from('crew_tasks')
    .select('id, zaps_value, is_repeatable, requires_verification, task_type')
    .eq('id', taskId)
    .maybeSingle()

  if (!task) return

  // Atomic completion (P0 — final-scan patch list): serialize concurrent completions of the same
  // (member, task) and insert at most once for a non-repeatable task, so trg_after_crew_completion
  // can never double-credit Zaps/rank on a replayed action (the client useTransition guard only
  // stops single-client double-clicks). Returns null when a non-repeatable task was already done.
  // Untyped RPC handle (ADR-246): log_crew_completion_atomic is new (migration 20261008000000) and
  // not yet in the generated Database types, so we widen to the un-parametrised SupabaseClient.
  const rpc: SupabaseClient = createAdminClient()
  const { data: newId, error } = await rpc.rpc('log_crew_completion_atomic', {
    _profile: profileId,
    _task: taskId,
    _zaps: task.zaps_value ?? 0,
    _repeatable: !!task.is_repeatable,
  })

  if (error) {
    console.error('[logCompletion]', error.message)
    return
  }
  if (!newId) return // non-repeatable task already completed — skip the reward side effects

  // Fire gamification events (non-blocking)
  processGamificationEvent({ type: 'task_complete', profileId }).catch(() => {})
  if (task.task_type === 'attendance') {
    recordStreakActivity(profileId, 'attendance').catch(() => {})
  } else if (task.task_type === 'hosting') {
    recordStreakActivity(profileId, 'hosting').catch(() => {})
  }

  revalidatePath('/crew')
  revalidatePath('/crew/store')
  revalidatePath('/crew/leaderboard')
}
