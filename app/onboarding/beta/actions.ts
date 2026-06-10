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
import { postWelcomeForMember } from '@/lib/onboarding/welcome'
import { track } from '@/lib/analytics/track'
import { BETA_INDUCTION_VERSION, BETA_MEMBERS_GET_CREW, type OathId } from '@/lib/onboarding/beta-script'
import { getSequence } from '@/lib/onboarding/beta-sequences'
import { personaTag, isPersonaId } from '@/lib/onboarding/personas'
import { assignTag } from '@/lib/traits/tags'
import { resolveAcquisition, stampAcquisitionTag } from '@/lib/attribution/server'
import type { Json } from '@/lib/database.types'

/** The audience sequence the member arrived through (cookie set by the induction). */
async function readBetaSequenceSlug(): Promise<string | null> {
  try {
    return (await cookies()).get('fq_beta_seq')?.value ?? null
  } catch {
    return null
  }
}

/** Stamp the cohort's marketing tag on the member (best-effort; never blocks). */
async function tagBetaCohort(profileId: string, seqSlug: string | null): Promise<void> {
  if (!seqSlug) return
  try {
    await assignTag(profileId, getSequence(seqSlug).marketingTag)
  } catch {
    /* tagging is best-effort */
  }
}

/** The persona the member chose at intake (cookie set by the induction / lead flow). */
async function readPersonaSlug(): Promise<string | null> {
  try {
    const v = (await cookies()).get('fq_persona')?.value ?? null
    return isPersonaId(v) ? v : null
  } catch {
    return null
  }
}

/** Stamp the persona's marketing tag on the member (best-effort; never blocks). */
async function tagPersona(profileId: string, personaSlug: string | null): Promise<void> {
  const key = personaTag(personaSlug)
  if (!key) return
  try {
    await assignTag(profileId, key)
  } catch {
    /* tagging is best-effort */
  }
}

/** During the Beta, comp every new member the paid **Crew tier** (full gamification) —
 *  membership is the entitlement axis, the ONLY thing this touches. The legacy
 *  `community_role='crew'` write is gone (PB.1i): endorsement/display now reads the
 *  tier (lib/season-ranks `isEndorsed`), and the role value is retired by migration
 *  20260612060000. Only upgrades free-tier members; they can downgrade anytime via
 *  /upgrade. Writes use the admin client (RLS). */
async function grantBetaCrew(authUserId: string) {
  if (!BETA_MEMBERS_GET_CREW) return
  await createAdminClient()
    .from('profiles')
    .update({ membership_tier: 'crew' })
    .eq('auth_user_id', authUserId)
    .eq('membership_tier', 'free')
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
  const seqSlug = await readBetaSequenceSlug()
  const personaSlug = await readPersonaSlug()
  // How they first reached us (ADR-095) — resolved from the attribution cookies.
  const acquisition = await resolveAcquisition()

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
        // First-touch acquisition record (utm / referrer / landing / channel).
        acquisition: (acquisition as unknown as Json),
        // WHO they said they are at intake (ADR-125) — the spine the site + Vera read
        // to tailor the experience. Cookie wins; falls back to any prior value.
        persona: personaSlug ?? ((meta.persona as string | undefined) ?? null),
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
          // The audience sequence they arrived through — recorded for segmentation.
          sequence: seqSlug ?? (beta.sequence as string | undefined) ?? null,
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
    await tagBetaCohort(prof.id, seqSlug)
    await tagPersona(prof.id, personaSlug)
    await stampAcquisitionTag(prof.id, acquisition)
    // Greet the new member in the public feed — once, only on first completion
    // (`meta` was read pre-update, so it reflects the prior state). Best-effort.
    if (!(meta as { onboarding_completed?: boolean }).onboarding_completed) {
      postWelcomeForMember(displayName, handle).catch(() => {})
    }
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
  const personaSlug = await readPersonaSlug()

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
    // New persona choice wins; never blanks an existing one (ADR-125).
    persona: personaSlug ?? ((meta.persona as string | undefined) ?? null),
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

  await tagPersona(profile.id as string, personaSlug)

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
