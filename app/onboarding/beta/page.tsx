// Beta induction page (ADR-068). TEMPORARY — deleted at launch.
// Mirrors the legacy onboarding page's auth + completed guards.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { resolveSequence } from '@/lib/onboarding/resolve-sequence'
import { isPersonaId, type PersonaId } from '@/lib/onboarding/personas'
import { getReferrer } from '@/lib/qr/referral'
import { hasEffectivelyOnboarded } from '@/lib/onboarding/onboarded'
import { isSafeInAppPath } from '@/lib/onboarding/funnel-destination'
import type { FunnelDestination } from '@/lib/onboarding/beta-sequences'
import BetaInduction from './induction'
import FeatureFunnel from './feature-funnel'

export default async function BetaInductionPage({
  searchParams,
}: {
  searchParams: Promise<{ seq?: string; persona?: string; next?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // The sequence drives the copy. No ?seq (or ?seq=beta-default) = the base VERA
  // flow, fully merged with the owner's edits: resolveSequence layers the coded
  // copy, the legacy /admin/vera induction tweaks, and the `beta-default` override
  // saved by the /pages/splash editor. DB-built versions resolve the same way.
  const { seq: seqSlug, persona: personaSlug, next: nextParam } = await searchParams
  const seq = await resolveSequence(seqSlug)
  // A `?next=` in-app path (e.g. an event-claim landing) overrides the sequence destination so
  // completion admits the new member (onboarding_completed) and lands them right back where they
  // came from. Validated as a safe same-origin path; anything else falls through to the sequence.
  const nextDestination: Extract<FunnelDestination, { mode: 'direct' }> | undefined =
    isSafeInAppPath(nextParam) ? { mode: 'direct', url: nextParam } : undefined
  // Who they said they are in the lead flow (ADR-125) — pre-selects the Welcome-beat
  // picker, branches the tour reel, and is stamped on the member at completion.
  const persona: PersonaId | undefined = isPersonaId(personaSlug) ? personaSlug : undefined
  const copy = { vera: seq.vera, oaths: seq.oaths, heardAbout: seq.heardAbout }

  // If they scanned a member's QR code, the /q resolver dropped an fq_ref cookie.
  // Surface "Invited by {name}" through the induction so the welcome feels personal.
  const inviter = await getReferrer()

  // Signed-out visitors run the WHOLE cinematic induction with no login wall
  // (ADR-082): "Join the Beta" opens the sequence immediately. Sign-in is
  // collected at the final "step in" beat; the answers are stashed and written at
  // /onboarding/beta/complete after auth.
  // Niche-funnel config (ADR-funnels): the Slide-2 feature cards, the Slide-3 core
  // features, and the completion destination. Absent on the General funnel, so the
  // induction keeps its persona fork / reel / default landing exactly as today.
  const funnel = {
    slide2Features: seq.slide2Features,
    slide3Core: seq.slide3Core,
    // `?next=` (a claim landing, etc.) wins over the sequence's own destination.
    destination: nextDestination ?? seq.destination,
  }

  // FEATURE funnels (ADR-619) render the playable demo instead of the cinematic induction. The demo
  // + signup are one client component; a signed-out visitor runs it deferred and creates the account
  // at the end through the same stash + /complete pipeline.
  if (seq.style === 'feature' && seq.feature && !user) {
    return (
      <FeatureFunnel
        deferred
        sequence={seq.slug}
        feature={seq.feature}
        destination={funnel.destination}
        headline={seq.splash?.headline}
        intro={seq.splash?.body}
      />
    )
  }

  if (!user) {
    return <BetaInduction deferred copy={copy} sequence={seq.slug} persona={persona} inviter={inviter} {...funnel} />
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('handle, meta, current_season_zaps, lifetime_gems')
    .eq('auth_user_id', user.id)
    .single()

  // Already onboarded, or an existing active member who has plainly used the app but
  // never got the completion flag (seeded / pre-gate account) — don't re-induct them.
  if (hasEffectivelyOnboarded({
    meta: profile?.meta,
    currentSeasonZaps: profile?.current_season_zaps,
    lifetimeGems: profile?.lifetime_gems,
  })) redirect(nextDestination ? nextDestination.url : '/feed')

  // Signed-in (not yet onboarded) visitor on a feature funnel: play the demo, then land in the app.
  if (seq.style === 'feature' && seq.feature) {
    return (
      <FeatureFunnel
        sequence={seq.slug}
        feature={seq.feature}
        destination={funnel.destination}
        userEmail={user.email ?? ''}
        headline={seq.splash?.headline}
        intro={seq.splash?.body}
      />
    )
  }

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
      persona={persona}
      inviter={inviter}
      {...funnel}
    />
  )
}
