'use server'

import { revalidatePath } from 'next/cache'
import { getMyProfileId } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

// The onboarding guide can't be dismissed — but a member can force a step complete
// via an obscured escape hatch (a deliberately low-prominence control). That writes
// the step key to profiles.meta.onboarding.forced[]; getOnboardingStatus treats
// forced steps as done, so the guide advances / graduates.

const STEP_KEYS = ['avatar', 'circle', 'practice', 'log']

export async function forceOnboardingStep(formData: FormData) {
  const stepKey = String(formData.get('step') ?? '')
  if (!STEP_KEYS.includes(stepKey)) return
  const profileId = await getMyProfileId()
  if (!profileId) return

  const admin = createAdminClient()
  const { data } = await admin.from('profiles').select('meta').eq('id', profileId).maybeSingle()
  const meta = ((data?.meta ?? {}) as Record<string, unknown>)
  const onboarding = ((meta.onboarding ?? {}) as { forced?: string[] })
  const forced = new Set(onboarding.forced ?? [])
  forced.add(stepKey)

  await admin
    .from('profiles')
    .update({ meta: { ...meta, onboarding: { ...onboarding, forced: [...forced] } } } as never)
    .eq('id', profileId)
  revalidatePath('/feed')
}
