'use server'

// Beta-induction server actions (ADR-068). TEMPORARY — deleted at launch.
// Everything rides profiles.meta (no migration). Unlike the legacy
// completeOnboarding (which blind-overwrites meta on a fresh '{}'), these MERGE
// so the oath stamp and the completion stamp don't clobber each other.

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { sendWelcomeEmail } from '@/lib/email'
import { sanitizeProfileInput } from '@/lib/profile-input'
import { rememberFacts } from '@/lib/ai/memory'
import { track } from '@/lib/analytics/track'
import { BETA_INDUCTION_VERSION, type OathId } from '@/lib/onboarding/beta-script'
import type { Json } from '@/lib/database.types'

type Meta = Record<string, Json>

// Where the deferred (signed-out) flow parks the answers across the auth
// round-trip. The avatar (too big for a cookie) goes to localStorage on the
// client under 'fq_pending_avatar' and is uploaded by /onboarding/beta/complete.
const PENDING_INDUCTION_COOKIE = 'fq_pending_induction'

export interface InductionData {
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
}

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
 * The induction write, shared by the authed path (completeBetaInduction) and the
 * deferred path (finalizePendingInduction). Persists identity + place + intent,
 * stamps onboarding complete, seeds Vera's memory, and fires the welcome email.
 * Requires an authenticated user; does NOT redirect (callers decide where to go).
 */
async function writeBetaInduction(data: InductionData): Promise<void> {
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
}

/**
 * Authed path: a signed-in, not-yet-completed member who lands on the induction.
 * Writes, then hands off to Vera's onboarding lightbox over the feed.
 */
export async function completeBetaInduction(data: InductionData) {
  await writeBetaInduction(data)
  // Hand off to Vera (ADR-066 Phase D): drop them straight into the feed (the real
  // product) with her onboarding lightbox over it. She already has their
  // interests/intent in memory + meta.beta, so the lightbox continues the thread
  // instead of opening cold. One-tap escape to /circles always remains.
  redirect('/feed?welcome=vera')
}

/**
 * Deferred path, step 1 (signed-out): park the induction answers in a short-lived
 * cookie so they survive the sign-in round-trip. No auth required. The avatar is
 * parked separately in localStorage by the client and uploaded at /complete.
 */
export async function stashPendingInduction(data: Omit<InductionData, 'avatarUrl'>) {
  const payload: InductionData = {
    displayName: (data.displayName ?? '').slice(0, 120),
    handle: (data.handle ?? '').slice(0, 40),
    bio: (data.bio ?? '').slice(0, 200),
    avatarUrl: '',
    location: (data.location ?? '').slice(0, 160),
    lat: data.lat ?? null,
    lng: data.lng ?? null,
    intent: (data.intent ?? '').slice(0, 500),
    interests: (data.interests ?? '').slice(0, 200),
    heardAbout: (data.heardAbout ?? '').slice(0, 120),
    oaths: Array.isArray(data.oaths) ? data.oaths.slice(0, 8) : [],
  }
  ;(await cookies()).set(PENDING_INDUCTION_COOKIE, JSON.stringify(payload), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60, // an hour to click the magic link / finish OAuth
  })
}

/**
 * Deferred path, step 2 (now authed, at /onboarding/beta/complete): read the
 * parked answers, fold in the uploaded avatar URL, write the profile, and clear
 * the cookie. Returns ok so the client can navigate AFTER the avatar upload.
 */
export async function finalizePendingInduction(avatarUrl: string | null): Promise<{ ok: boolean; error?: string }> {
  const store = await cookies()
  const raw = store.get(PENDING_INDUCTION_COOKIE)?.value
  if (!raw) return { ok: false, error: 'No pending induction.' }

  let data: InductionData
  try {
    data = JSON.parse(raw) as InductionData
  } catch {
    store.delete(PENDING_INDUCTION_COOKIE)
    return { ok: false, error: 'Could not read your answers.' }
  }

  try {
    await writeBetaInduction({ ...data, avatarUrl: avatarUrl ?? '' })
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong.' }
  }

  store.delete(PENDING_INDUCTION_COOKIE)
  return { ok: true }
}
