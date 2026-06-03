'use server'

// Beta-induction server actions (ADR-068). TEMPORARY — deleted at launch.
// Everything rides profiles.meta (no migration). Unlike the legacy
// completeOnboarding (which blind-overwrites meta on a fresh '{}'), these MERGE
// so the oath stamp and the completion stamp don't clobber each other.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { sendWelcomeEmail } from '@/lib/email'
import { sanitizeProfileInput } from '@/lib/profile-input'
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
  regionId: string
  intent: string
  heardAbout: string
  oaths: OathId[]
}) {
  const { displayName, handle, bio, avatarUrl } = sanitizeProfileInput(data)
  const intent = data.intent.trim().slice(0, 500)
  const heardAbout = data.heardAbout.trim().slice(0, 120)

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
      nexus_region_id: data.regionId || null,
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
          heard_about: heardAbout || null,
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

  if (user.email) {
    sendWelcomeEmail({ to: user.email, displayName }).catch(() => {})
  }

  redirect('/circles')
}
