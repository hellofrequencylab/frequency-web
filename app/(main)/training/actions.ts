'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getActiveTraining, completeTraining } from '@/lib/onboarding/training'

// Mark the caller's active training complete (ADR-157 §7). Resolves the active
// training server-side so the client can't complete one that isn't theirs.
export async function markTrainingComplete(): Promise<{ ok: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false }
  const { data: p } = await supabase.from('profiles').select('id').eq('auth_user_id', user.id).maybeSingle()
  if (!p) return { ok: false }

  const active = await getActiveTraining(p.id)
  if (!active) return { ok: false }

  await completeTraining(p.id, active.role)
  revalidatePath('/training')
  revalidatePath('/feed')
  return { ok: true }
}
