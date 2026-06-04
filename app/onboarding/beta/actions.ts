'use server'

// Beta-induction server actions (ADR-068). TEMPORARY — deleted at launch.
// Everything rides profiles.meta (no migration). Unlike the legacy
// completeOnboarding (which blind-overwrites meta on a fresh '{}'), these MERGE
// so the oath stamp and the completion stamp don't clobber each other.

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendWelcomeEmail } from '@/lib/email'
import { sanitizeProfileInput } from '@/lib/profile-input'
import { rememberFacts } from '@/lib/ai/memory'
import { track } from '@/lib/analytics/track'
import { BETA_INDUCTION_VERSION, BETA_MEMBERS_GET_CREW, type OathId } from '@/lib/onboarding/beta-script'
import type { Json } from '@/lib/database.types'

/** During the Beta, grant every new member Crew (full gamification). Only upgrades
 *  members — leaders (host+) and existing crew are untouched — and they can
 *  downgrade anytime via /upgrade. Role writes use the admin client (RLS). */
async function grantBetaCrew(authUserId: string) {
  if (!BETA_MEMBERS_GET_CREW) return
  await createAdminClient()
    .from('profiles')
    .update({ community_role: 'crew' })
    .eq('auth_user_id', authUserId)
    .eq('community_role', 'member')
}

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

  // Beta: every new member comes in as Crew (full game), free.
  await grantBetaCrew(user.id)
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

/** Has the signed-in caller already completed onboarding? Decides write vs merge. */
async function callerAlreadyOnboarded(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data } = await supabase
    .from('profiles')
    .select('meta')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  return !!(data?.meta as { onboarding_completed?: boolean } | null)?.onboarding_completed
}

/** Union two comma-separated lists: existing order kept, new ones appended,
 *  case-insensitive dedupe. Used to merge interests without losing any. */
function mergeCsv(existing: string, incoming: string): string {
  const out: string[] = []
  const seen = new Set<string>()
  for (const part of `${existing},${incoming}`.split(',')) {
    const v = part.trim()
    if (!v) continue
    const key = v.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(v)
  }
  return out.slice(0, 20).join(', ')
}

/**
 * Returning member re-ran the beta intake: intelligently MERGE whatever new info
 * they entered into their existing profile. New non-empty values win; a blank
 * field never wipes existing data; interests are unioned; handle is left untouched
 * (unique identity). Never deletes good info.
 */
async function mergeBetaInduction(data: InductionData): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, meta')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!profile) return

  const meta = (profile.meta as Meta) ?? {}
  const beta = (meta.beta as Meta) ?? {}

  const clean = sanitizeProfileInput(data)
  const newDisplayName = clean.displayName?.trim()
  const newBio = clean.bio?.trim()
  const newAvatar = clean.avatarUrl?.trim()
  const newIntent = data.intent.trim().slice(0, 500)
  const newInterests = data.interests.trim().slice(0, 200)
  const newHeardAbout = data.heardAbout.trim().slice(0, 120)
  const newLocation = data.location.trim().slice(0, 160)
  const mergedInterests = mergeCsv(typeof beta.interests === 'string' ? beta.interests : '', newInterests)

  const mergedMeta: Meta = {
    ...meta,
    onboarding_completed: true,
    beta: {
      ...beta,
      version: BETA_INDUCTION_VERSION,
      intent: newIntent || (beta.intent ?? null),
      interests: mergedInterests || (beta.interests ?? null),
      heard_about: newHeardAbout || (beta.heard_about ?? null),
      location: newLocation
        ? { label: newLocation, lat: data.lat, lng: data.lng }
        : (beta.location ?? null),
      merged_at: new Date().toISOString(),
    },
  }

  // Only set top-level fields when the new value is non-empty (never blank out
  // existing data). Handle is identity + unique, so it is never changed on a merge.
  const { error } = await supabase
    .from('profiles')
    .update({
      ...(newDisplayName ? { display_name: newDisplayName } : {}),
      ...(newBio ? { bio: newBio } : {}),
      ...(newAvatar ? { avatar_url: newAvatar } : {}),
      meta: mergedMeta,
    })
    .eq('auth_user_id', user.id)
  if (error) throw new Error(error.message)

  // Fold the merged interests/intent/place into Vera's memory (best-effort).
  const interestList = mergedInterests.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 10)
  await rememberFacts(profile.id as string, {
    interests: interestList,
    goals: newIntent ? [newIntent] : [],
    neighborhood: newLocation || null,
  }).catch(() => {})

  // Beta: a returning member who was still on the Member tier comes up to Crew.
  await grantBetaCrew(user.id)
}

/**
 * Deferred path, step 2 (now authed, at /onboarding/beta/complete): read the
 * parked answers + uploaded avatar. A brand-new account is written in full; a
 * returning member's answers are MERGED into their existing profile (new info
 * harvested, blanks ignored). Then clear the cookie.
 */
export async function finalizePendingInduction(avatarUrl: string | null): Promise<{ ok: boolean; error?: string; merged?: boolean }> {
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

  const payload: InductionData = { ...data, avatarUrl: avatarUrl ?? '' }

  try {
    if (await callerAlreadyOnboarded()) {
      await mergeBetaInduction(payload)
      store.delete(PENDING_INDUCTION_COOKIE)
      return { ok: true, merged: true }
    }
    await writeBetaInduction(payload)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong.' }
  }

  store.delete(PENDING_INDUCTION_COOKIE)
  return { ok: true }
}
