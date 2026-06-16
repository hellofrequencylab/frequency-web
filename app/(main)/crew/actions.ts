'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
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

  // Non-repeatable gate. If already completed, no-op
  if (!task.is_repeatable) {
    const { data: existing } = await admin
      .from('crew_completions')
      .select('id')
      .eq('task_id', taskId)
      .eq('profile_id', profileId)
      .maybeSingle()
    if (existing) return
  }

  const { error } = await admin.from('crew_completions').insert({
    task_id:       taskId,
    profile_id:    profileId,
    zaps_earned:   task.zaps_value ?? 0,
    completed_at:  new Date().toISOString(),
  })

  if (error) {
    console.error('[logCompletion]', error.message)
    return
  }

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
