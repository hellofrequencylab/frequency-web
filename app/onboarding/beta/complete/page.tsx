// Deferred beta induction — completion landing (ADR-082). TEMPORARY — deleted at
// launch. The signed-out flow sends the new Founder here AFTER sign-in; the client
// finalizer uploads the parked avatar, writes the profile from the stashed answers,
// and drops them into the feed with Vera's lightbox. Auth-gated.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BetaCompleteFinalizer } from './finalizer'

export const dynamic = 'force-dynamic'

export default async function BetaCompletePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // Reached only after sign-in. If somehow unauthenticated (e.g. the magic link
  // was abandoned), send them back to run the induction.
  if (!user) redirect('/onboarding/beta')

  return <BetaCompleteFinalizer />
}
