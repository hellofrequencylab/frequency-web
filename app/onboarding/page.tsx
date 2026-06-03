import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BETA_INDUCTION_ACTIVE } from '@/lib/onboarding/beta-script'
import OnboardingForm from './form'

export default async function OnboardingPage() {
  // During beta, the founding-cohort induction is the live path (ADR-068).
  // Flip BETA_INDUCTION_ACTIVE off (or delete this block + app/onboarding/beta/)
  // at launch to fall back to the steady-state onboarding below.
  if (BETA_INDUCTION_ACTIVE) redirect('/onboarding/beta')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // proxy.ts handles the unauthenticated redirect, but guard here too.
  if (!user) redirect('/sign-in')

  const { data: profile } = await supabase
    .from('profiles')
    .select('handle, meta')
    .eq('auth_user_id', user.id)
    .single()

  // Returning user who already finished onboarding.
  const meta = profile?.meta as { onboarding_completed?: boolean } | null
  if (meta?.onboarding_completed) redirect('/feed')

  // Only fetch top-level regions (depth = 0) for the region picker.
  const { data: regions } = await supabase
    .from('nexus_regions')
    .select('id, name')
    .eq('depth', 0)
    .order('name')

  return (
    <OnboardingForm
      userId={user.id}
      userEmail={user.email ?? ''}
      // The auto-generated handle (e.g. "jane_abc123") is passed so the
      // uniqueness check can treat it as available for this specific user.
      initialHandle={profile?.handle ?? ''}
      regions={regions ?? []}
    />
  )
}
