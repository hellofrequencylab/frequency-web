// Beta induction page (ADR-068). TEMPORARY — deleted at launch.
// Mirrors the legacy onboarding page's auth + completed guards.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getVeraConfig } from '@/lib/ai/vera/config'
import { VERA, BETA_OATHS, HEARD_ABOUT } from '@/lib/onboarding/beta-script'
import BetaInduction from './induction'
import { BetaWelcome } from './welcome'

export default async function BetaInductionPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // Signed-out visitors get the cinematic opening of the sequence (sign-in embedded),
  // not a bounce to the cold /sign-in form. After auth the cookie returns them here.
  if (!user) {
    const { error } = await searchParams
    return <BetaWelcome error={error} />
  }

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

  // Operator copy overrides from /admin/vera (defaults to the beta-script copy).
  const ind = (await getVeraConfig()).induction
  const copy = {
    // Widened strings cast back to the const shape the component expects.
    vera: {
      ...VERA,
      oath: { ...VERA.oath, heading: ind.oathHeading, body: ind.oathBody },
      intro: { ...VERA.intro, heading: ind.introHeading, body: ind.introBody },
    } as typeof VERA,
    oaths: BETA_OATHS.map((o, i) => ({ id: o.id, label: ind.oathLabels[i] || o.label })),
    heardAbout: ind.heardAbout.length ? ind.heardAbout : [...HEARD_ABOUT],
  }

  return (
    <BetaInduction
      userId={user.id}
      userEmail={user.email ?? ''}
      initialHandle={profile?.handle ?? ''}
      regions={regions ?? []}
      copy={copy}
    />
  )
}
