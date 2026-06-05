// Beta induction page (ADR-068). TEMPORARY — deleted at launch.
// Mirrors the legacy onboarding page's auth + completed guards.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getVeraConfig } from '@/lib/ai/vera/config'
import { VERA, BETA_OATHS } from '@/lib/onboarding/beta-script'
import { getSequence, DEFAULT_SEQUENCE } from '@/lib/onboarding/beta-sequences'
import BetaInduction from './induction'

export default async function BetaInductionPage({
  searchParams,
}: {
  searchParams: Promise<{ seq?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // The audience sequence (early-adopter / personal / founding-partner) drives the
  // copy. Operator overrides from /admin/vera still apply to the DEFAULT sequence
  // (that's what they were authored against); audience sequences use their own copy.
  const { seq: seqSlug } = await searchParams
  const seq = getSequence(seqSlug)
  const isDefault = seq.slug === DEFAULT_SEQUENCE
  const ind = (await getVeraConfig()).induction
  const copy = isDefault
    ? {
        vera: {
          ...seq.vera,
          oath: { ...seq.vera.oath, heading: ind.oathHeading, body: ind.oathBody },
          intro: { ...seq.vera.intro, heading: ind.introHeading, body: ind.introBody },
        } as typeof VERA,
        oaths: BETA_OATHS.map((o, i) => ({ id: o.id, label: ind.oathLabels[i] || o.label })),
        heardAbout: ind.heardAbout.length ? ind.heardAbout : seq.heardAbout,
      }
    : { vera: seq.vera, oaths: seq.oaths, heardAbout: seq.heardAbout }

  // Signed-out visitors run the WHOLE cinematic induction with no login wall
  // (ADR-082): "Join the Beta" opens the sequence immediately. Sign-in is
  // collected at the final "step in" beat; the answers are stashed and written at
  // /onboarding/beta/complete after auth.
  if (!user) {
    return <BetaInduction deferred copy={copy} sequence={seq.slug} />
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

  return (
    <BetaInduction
      userId={user.id}
      userEmail={user.email ?? ''}
      initialHandle={profile?.handle ?? ''}
      regions={regions ?? []}
      copy={copy}
      sequence={seq.slug}
    />
  )
}
