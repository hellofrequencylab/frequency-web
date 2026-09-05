'use server'

import { revalidatePath } from 'next/cache'
import { getMyProfileId } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { mergeProfileMeta } from '@/lib/profiles/meta'

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

  // 2026-09-05 (scan2 L6-09): only the `onboarding` key is merged server-side; a failed merge is logged
  // and the feed is not repainted for a step that did not land.
  const { error } = await mergeProfileMeta(admin, profileId, { onboarding: { ...onboarding, forced: [...forced] } })
  if (error) {
    console.error('[forceOnboardingStep] onboarding merge failed', { profileId, stepKey, error })
    return
  }
  revalidatePath('/feed')
}
