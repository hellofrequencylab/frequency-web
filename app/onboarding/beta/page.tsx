// Beta induction page (ADR-068). TEMPORARY — deleted at launch.
// Mirrors the legacy onboarding page's auth + completed guards.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import BetaInduction from './induction'

export default async function BetaInductionPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  const { data: profile } = await supabase
    .from('profiles')
    .select('handle, meta')
    .eq('auth_user_id', user.id)
    .single()

  const meta = profile?.meta as { onboarding_completed?: boolean } | null
  if (meta?.onboarding_completed) redirect('/feed')

  const { data: regions } = await supabase
    .from('nexus_regions')
    .select('id, name')
    .eq('depth', 0)
    .order('name')

  return (
    <BetaInduction
      userId={user.id}
      userEmail={user.email ?? ''}
      initialHandle={profile?.handle ?? ''}
      regions={regions ?? []}
    />
  )
}
