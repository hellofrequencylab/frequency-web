'use server'

// Beta-induction server actions (ADR-068). TEMPORARY — deleted at launch.
// Everything rides profiles.meta (no migration). Unlike the legacy
// completeOnboarding (which blind-overwrites meta on a fresh '{}'), these MERGE
// so the oath stamp and the completion stamp don't clobber each other.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { sendWelcomeEmail } from '@/lib/email'
import { sanitizeProfileInput } from '@/lib/profile-input'
import { rememberFacts } from '@/lib/ai/memory'
import { track } from '@/lib/analytics/track'
import { BETA_INDUCTION_VERSION, type OathId } from '@/lib/onboarding/beta-script'
import type { Json } from '@/lib/database.types'

type Meta = Record<string, Json>

async function readMeta(supabase: Awaited<ReturnType<typeof createClient>>, authUserId: string): Promise<Meta> {
  const { data } = await supabase
    .from('profiles')
    .select('meta')
    .eq('auth_user_id', authUserId)
    .single()
  return (data?.meta as Meta) ?? {}
}

/**
 * Stamp the oath as soon as the gate is passed, so we have consent on record
 * even if the founder drops off mid-induction. Best-effort, non-fatal.
 */
export async function acceptBetaOath(oaths: OathId[]) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const meta = await readMeta(supabase, user.id)
  const beta = (meta.beta as Meta) ?? {}

  await supabase
    .from('profiles')
    .update({
      meta: {
        ...meta,
        beta: {
          ...beta,
          version: BETA_INDUCTION_VERSION,
          oath: { accepted_at: new Date().toISOString(), version: BETA_INDUCTION_VERSION, oaths },
        },
      },
    })
    .eq('auth_user_id', user.id)
}

/**
 * Final step: persist identity + place + intent, stamp onboarding complete,
 * fire the welcome email, and drop the founder into Circles.
 */
export async function completeBetaInduction(data: {
  displayName: string
  handle: string
  bio: string
  avatarUrl: string
  location: string
  lat: number | null
  lng: number | null
  intent: string
  interests: string
  heardAbout: string
  oaths: OathId[]
}) {
  const { displayName, handle, bio, avatarUrl } = sanitizeProfileInput(data)
  const intent = data.intent.trim().slice(0, 500)
  const interests = data.interests.trim().slice(0, 200)
  const heardAbout = data.heardAbout.trim().slice(0, 120)
  const location = data.location.trim().slice(0, 160)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const meta = await readMeta(supabase, user.id)
  const beta = (meta.beta as Meta) ?? {}

  const { error } = await supabase
    .from('profiles')
    .update({
      display_name: displayName,
      handle,
      bio: bio || null,
      avatar_url: avatarUrl || null,
      meta: {
        ...meta,
        onboarding_completed: true,
        beta: {
          ...beta,
          version: BETA_INDUCTION_VERSION,
          // Re-affirm the oath here too, in case acceptBetaOath didn't land.
          oath: (beta.oath as Meta) ?? {
            accepted_at: new Date().toISOString(),
            version: BETA_INDUCTION_VERSION,
            oaths: data.oaths,
          },
          intent: intent || null,
          interests: interests || null,
          heard_about: heardAbout || null,
          location: location ? { label: location, lat: data.lat, lng: data.lng } : null,
          completed_at: new Date().toISOString(),
        },
      },
    })
    .eq('auth_user_id', user.id)

  if (error) {
    // 23505 = unique_violation: handle claimed between the live check and submit.
    if (error.code === '23505') {
      throw new Error('That handle was just taken. Go back and choose another.')
    }
    throw new Error(error.message)
  }

  // Seed Vera's memory so she already knows who just arrived — their interests,
  // what they came for, where they are (AI-VERA §5). Member-provided, best-effort;
  // never blocks onboarding.
  const { data: prof } = await supabase
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (prof?.id) {
    const interestList = interests.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 10)
    await rememberFacts(prof.id, {
      interests: interestList,
      goals: intent ? [intent] : [],
      neighborhood: location || null,
    })
    // Activation-funnel instrumentation (ADR-075): the head of the new-member
    // funnel. Best-effort; never blocks onboarding. Name + handle are required to
    // get here, so profile is "completed" by our funnel's definition.
    await track('onboarding.induction_completed', { hasAvatar: !!avatarUrl, hasIntent: !!intent }, prof.id)
    await track('profile.completed', { hasAvatar: !!avatarUrl }, prof.id)
  }

  if (user.email) {
    sendWelcomeEmail({ to: user.email, displayName }).catch(() => {})
  }

  // Hand off to Vera (ADR-066 Phase D): she already has their interests/intent in
  // memory (seeded just above), so her one job now is bridging them to a real
  // circle — the activation lever — then stepping back. Dark-safe: if the AI kernel
  // is off, the concierge falls back to its deterministic script. There's always a
  // one-tap escape to /circles, and the feed first-run banner catches skippers.
  redirect('/onboarding/vera')
}
