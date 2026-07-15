'use server'

// Beta-induction server actions (ADR-068). TEMPORARY — deleted at launch.
// Everything rides profiles.meta (no migration). Unlike the legacy
// completeOnboarding (which blind-overwrites meta on a fresh '{}'), these MERGE
// so the oath stamp and the completion stamp don't clobber each other.

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { uploadProfileImage } from '@/lib/storage/profile-images'
import { sendWelcomeEmail } from '@/lib/email'
import { sanitizeProfileInput } from '@/lib/profile-input'
import { rememberFacts } from '@/lib/ai/memory'
import { postWelcomeForMember } from '@/lib/onboarding/welcome'
import { ensureMemberCodes } from '@/lib/qr/member-codes'
import { track } from '@/lib/analytics/track'
import { BETA_INDUCTION_VERSION, BETA_MEMBERS_GET_CREW, type OathId } from '@/lib/onboarding/beta-script'
import { resolveSequence } from '@/lib/onboarding/resolve-sequence'
import { sequenceGrant } from '@/lib/onboarding/beta-sequences'
import { grantFoundingStatus } from '@/lib/founding/status'
import { funnelLanding, isSafeInAppPath } from '@/lib/onboarding/funnel-destination'
import type { FunnelDestination } from '@/lib/onboarding/beta-sequences'
import { personaTag, isPersonaId, DEFAULT_PERSONA } from '@/lib/onboarding/personas'
import { enrollInNurture } from '@/lib/nurture/enroll'
import { getSequenceByPersona } from '@/lib/nurture/store'
import { assignTag } from '@/lib/traits/tags'
import { resolveAcquisition, stampAcquisitionTag } from '@/lib/attribution/server'
import { applyReferralAttribution, applyEntryPointConversion } from '@/lib/qr/referral'
import { persistAcquisition } from '@/lib/attribution/acquisition'
import type { Json } from '@/lib/database.types'

/** The audience sequence the member arrived through (cookie set by the induction). */
async function readBetaSequenceSlug(): Promise<string | null> {
  try {
    return (await cookies()).get('fq_beta_seq')?.value ?? null
  } catch {
    return null
  }
}

/** Stamp the cohort's marketing tag on the member (best-effort; never blocks).
 *  Resolves through the DB layer so versions built in the wizard stamp THEIR tag,
 *  not the default's. */
async function tagBetaCohort(profileId: string, seqSlug: string | null): Promise<void> {
  if (!seqSlug) return
  try {
    await assignTag(profileId, (await resolveSequence(seqSlug)).marketingTag)
  } catch {
    /* tagging is best-effort */
  }
}

/** The PRIMARY persona the member chose at intake (cookie set by the induction / lead
 *  flow). Drives meta.persona — the single value the site + Vera read to tailor. */
async function readPersonaSlug(): Promise<string | null> {
  try {
    const v = (await cookies()).get('fq_persona')?.value ?? null
    return isPersonaId(v) ? v : null
  } catch {
    return null
  }
}

/** EVERY persona the member selected at intake (the picker is multi-select). Each is
 *  tagged at completion; the first is the primary (readPersonaSlug). Falls back to the
 *  primary alone when the multi cookie is absent (older links / lead flows). */
async function readPersonaSlugs(): Promise<string[]> {
  try {
    const v = (await cookies()).get('fq_personas')?.value ?? ''
    return v.split(',').map((s) => s.trim()).filter((s) => isPersonaId(s))
  } catch {
    return []
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

/** The interest choices the member ticked on the niche funnel's Beat-1 cards
 *  (fq_interests cookie, set by the induction — survives the deferred sign-in
 *  round-trip). Each is a registered `interest_*` marketing tag so the picks are
 *  segmentable. The regex fences the values so only well-formed keys are trusted. */
async function readInterestTags(): Promise<string[]> {
  try {
    const v = (await cookies()).get('fq_interests')?.value ?? ''
    return v
      .split(',')
      .map((s) => s.trim())
      .filter((s) => /^interest_[a-z0-9]+$/.test(s))
      .slice(0, 8)
  } catch {
    return []
  }
}

/** Stamp each selected interest tag on the member (best-effort; an unregistered or
 *  typo'd key simply skips and never blocks onboarding). */
async function tagInterests(profileId: string): Promise<void> {
  for (const key of await readInterestTags()) {
    try {
      await assignTag(profileId, key, { source: 'onboarding', context: { question: 'interests' } })
    } catch {
      /* tagging is best-effort */
    }
  }
}

/**
 * Cue future onboarding (owner directive): enroll the finished member into the nurture / onboarding
 * sequence for their PRIMARY persona (ADR-131), in addition to the persona tags. Best-effort, idempotent
 * (the enrollment has a unique (sequence_id, contact_id) constraint), and NEVER blocks onboarding.
 *
 * When the primary persona has no enabled sequence yet, it falls back to the DEFAULT persona's sequence
 * so a member still gets a sensible onboarding series; when neither exists it is a clean no-op. The
 * nurture runner sends to a CRM contact row, so this resolves (or creates) the member's contact first.
 */
async function enrollPersonaOnboarding(profileId: string, email: string, primaryPersona: string): Promise<void> {
  try {
    // Choose the persona whose sequence exists + is enabled; fall back to the default persona's series.
    let persona = primaryPersona
    const primarySeq = await getSequenceByPersona(primaryPersona)
    if (!primarySeq || !primarySeq.sequence.enabled) {
      if (primaryPersona === DEFAULT_PERSONA) return // already the default; nothing enabled to enroll into
      const fallback = await getSequenceByPersona(DEFAULT_PERSONA)
      if (!fallback || !fallback.sequence.enabled) return
      persona = DEFAULT_PERSONA
    }

    // Resolve the member's CRM contact (the nurture cron sends to a contact row). Prefer the row already
    // linked to this profile, then the one matching their email, and only create one when none exists.
    const admin = createAdminClient()
    const { data: byProfile } = await admin.from('contacts').select('id').eq('profile_id', profileId).maybeSingle()
    let contactId = (byProfile as { id: string } | null)?.id ?? null
    if (!contactId) {
      const { data: byEmail } = await admin.from('contacts').select('id').ilike('email', email).maybeSingle()
      contactId = (byEmail as { id: string } | null)?.id ?? null
    }
    if (!contactId) {
      const { data: inserted } = await admin
        .from('contacts')
        .insert({ email, profile_id: profileId, consent_state: 'unknown', source: 'onboarding_beta', last_seen_at: new Date().toISOString() })
        .select('id')
        .maybeSingle()
      contactId = (inserted as { id: string } | null)?.id ?? null
    }
    if (!contactId) return

    await enrollInNurture({ contactId, email, persona })
  } catch {
    /* enrollment is best-effort; a failure must never block onboarding */
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

/**
 * Apply any one-time GRANTS a funnel confers on the accounts that finish it, keyed by the
 * ?seq slug the fq_beta_seq cookie carried through signup (SEQUENCE_GRANTS, not email — the
 * email is unknown at authoring time). The `randy` donor funnel honors every finisher as a
 * Founding Member and comps them Crew.
 *
 * Best-effort + idempotent, so it NEVER blocks onboarding: grantFoundingStatus is a no-op on
 * an already-active founder, and the Crew comp is a guarded upsert that only lifts a free member.
 * The Crew comp here is INDEPENDENT of BETA_MEMBERS_GET_CREW so the funnel's promise holds even
 * after that beta-wide flag flips off at launch.
 */
async function applySequenceGrants(seqSlug: string | null, authUserId: string, profileId: string): Promise<void> {
  const grant = sequenceGrant(seqSlug)
  if (!grant) return
  try {
    if (grant.crew) {
      await createAdminClient()
        .from('profiles')
        .update({ membership_tier: 'crew' })
        .eq('auth_user_id', authUserId)
        .eq('membership_tier', 'free')
    }
    if (grant.founding) {
      // Durable Founding Member status: an active founding_members row + is_founding_member,
      // which lights the gold Founder badge beside their Member badge. No charge (reserve-now,
      // charge-at-graduation invariant in lib/founding/status).
      await grantFoundingStatus({ profileId, kind: 'member' })
    }
  } catch (err) {
    console.error('[beta] sequence grant failed:', err)
  }
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
  const personaSlugs = await readPersonaSlugs()
  // Primary first, then any other personas they also picked (multi-select), de-duped.
  const allPersonas = Array.from(new Set([...(personaSlug ? [personaSlug] : []), ...personaSlugs]))
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
        // Every persona they picked (the picker is multi-select); primary is `persona`.
        personas: (allPersonas.length ? allPersonas : ((meta.personas as Json) ?? null)) as Json,
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

  // The inviter's name (when this member arrived via a personal code), for the
  // welcome email's utility-framed "say hi" line. Set after attribution below.
  let inviterName: string | null = null

  // Seed Vera's memory so she already knows who just arrived — their interests,
  // what they came for, where they are (AI-VERA §5). Member-provided, best-effort;
  // never blocks onboarding.
  const { data: prof } = await supabase
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (prof?.id) {
    // Every account gets its QR code the moment it has a handle (owner directive).
    // Fire-and-forget: a provisioning hiccup never blocks onboarding — the invite
    // and /codes surfaces lazily re-provision as the fallback.
    ensureMemberCodes(prof.id as string, handle).catch((e) => console.error('[member-codes]', e))
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
    // Apply any grants the arriving funnel confers (SEQUENCE_GRANTS, keyed on seqSlug): the
    // `randy` donor funnel makes the finisher a Founding Member + comps Crew. Best-effort.
    await applySequenceGrants(seqSlug, user.id, prof.id as string)
    // Tag every persona they selected (multi-select); each tag is registered + idempotent.
    for (const p of allPersonas) await tagPersona(prof.id as string, p)
    // Tag the event-host interests they ticked on the niche funnel (segmentation).
    await tagInterests(prof.id as string)
    // Cue future onboarding: enroll the member into their PRIMARY persona's nurture / onboarding sequence
    // (ADR-131), on top of the tags. Best-effort + idempotent; never blocks onboarding. Uses the member's
    // email (required for the nurture send); no-op when they somehow have none.
    if (user.email) await enrollPersonaOnboarding(prof.id as string, user.email, allPersonas[0] ?? DEFAULT_PERSONA)
    await stampAcquisitionTag(prof.id, acquisition)
    // Referral attribution (ADR-095) — apply the `fq_ref` cookie the /q resolver
    // drops when someone scans a member's personal code: set referred_by_profile_id,
    // credit the referrer (invite_accepted zaps), and record the conversion +
    // first-touch acquisition on the canonical column. MUST run BEFORE grantJoinZaps
    // (inside postWelcomeForMember) so the newcomer's referred_join_bonus lands. The
    // legacy completeOnboarding path does the same; the beta path had silently
    // skipped it, so scanned referrals were never credited. Best-effort — never
    // blocks onboarding (each fn is internally idempotent + clears its cookie).
    await applyReferralAttribution(prof.id as string).catch(() => {})
    await applyEntryPointConversion(prof.id as string).catch(() => {})
    await persistAcquisition(prof.id as string).catch(() => {})
    // Name the inviter for the welcome email when this member joined through a
    // personal code (attribution just set referred_by). Best-effort personalization.
    try {
      const admin = createAdminClient()
      const { data: refRow } = await admin
        .from('profiles')
        .select('referred_by_profile_id')
        .eq('id', prof.id)
        .maybeSingle()
      const refId = (refRow as { referred_by_profile_id: string | null } | null)?.referred_by_profile_id
      if (refId) {
        const { data: inviter } = await admin.from('profiles').select('display_name').eq('id', refId).maybeSingle()
        inviterName = (inviter as { display_name: string | null } | null)?.display_name ?? null
      }
    } catch {
      // personalization is a nicety, never a blocker
    }
    // Welcome the new member from Vera — one quiet join line in the feed plus a
    // personal notification (ADR-231). Called unconditionally now: postWelcomeForMember
    // is idempotent (a reward_grants lock posts at most once per member), so dropping the
    // old `!onboarding_completed` gate is what lets a member who was flagged onboarded by
    // an earlier path (but never got a line) finally receive one, without any double-post.
    postWelcomeForMember(prof.id, displayName, handle).catch(() => {})
  }

  if (user.email) {
    sendWelcomeEmail({ to: user.email, displayName, inviterName }).catch(() => {})
  }

  // Beta: every new member comes in as Crew (full game), free.
  await grantBetaCrew(user.id)
}

/**
 * Authed path: a signed-in, not-yet-completed member who lands on the induction.
 * Writes, then hands off to Vera's onboarding lightbox over the feed.
 */
export async function completeBetaInduction(data: InductionData, destination?: FunnelDestination) {
  await writeBetaInduction(data)
  // Hand off to Vera (ADR-066 Phase D): drop them straight into the feed (the real
  // product) with her onboarding lightbox over it. She already has their
  // interests/intent in memory + meta.beta, so the lightbox continues the thread
  // instead of opening cold. One-tap escape to /circles always remains.
  //
  // NICHE funnels (ADR-funnels) admit the new member to a niche-relevant section instead.
  // funnelLanding re-validates the destination HERE (where the redirect actually fires) and
  // fails closed to the Vera welcome for a waitlist / absent / unsafe url, so the General
  // funnel is unchanged and no attacker-influenced value can open-redirect off-site.
  redirect(funnelLanding(destination, '/feed?welcome=vera'))
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
    .select('id, meta, handle, display_name')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!profile) return

  const meta = (profile.meta as Meta) ?? {}
  const beta = (meta.beta as Meta) ?? {}
  const seqSlug = await readBetaSequenceSlug()
  const personaSlug = await readPersonaSlug()
  const personaSlugs = await readPersonaSlugs()
  const allPersonas = Array.from(new Set([...(personaSlug ? [personaSlug] : []), ...personaSlugs]))

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
    personas: (allPersonas.length ? allPersonas : ((meta.personas as Json) ?? null)) as Json,
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

  for (const p of allPersonas) await tagPersona(profile.id as string, p)
  // Tag the event-host interests they ticked on the niche funnel (segmentation).
  await tagInterests(profile.id as string)

  // Safety net for the deferred/merge path: a returning member who reaches /complete may have
  // been flagged onboarded by an earlier path that NEVER posted their join line. Idempotency
  // (reward_grants lock) means this posts the line only if it was never posted — so a member
  // who was silently skipped finally gets their notice, and one who already has it is untouched.
  const mergeHandle = (profile.handle as string | null) ?? ''
  const mergeName = newDisplayName || (profile.display_name as string | null) || mergeHandle
  if (mergeHandle) postWelcomeForMember(profile.id as string, mergeName, mergeHandle).catch(() => {})

  // Beta: a returning member who was still on the Member tier comes up to Crew.
  await grantBetaCrew(user.id)
  // Apply the arriving funnel's grants too, so a returning member who re-runs the `randy`
  // funnel is still honored as a Founding Member + comped Crew (idempotent, best-effort).
  await applySequenceGrants(seqSlug, user.id, profile.id as string)
}

/**
 * Upload the avatar the signed-out induction parked (as a data URL) once the
 * member is authed. Runs server-side via the service role: the browser client can
 * lack a session right after the magic-link hop, which makes a client-side storage
 * upload run as `anon` and fail the owner-INSERT RLS policy — the reason a real
 * member's onboarding photo silently never landed. Best-effort: returns null on
 * any problem so finishing onboarding never blocks on the photo.
 */
export async function uploadPendingAvatar(dataUrl: string): Promise<string | null> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const m = /^data:([^;,]+)[^,]*,(.*)$/.exec(dataUrl)
    if (!m) return null
    const contentType = m[1] || 'image/jpeg'
    const bytes = new Uint8Array(Buffer.from(m[2], 'base64'))
    return await uploadProfileImage(user.id, bytes, contentType, 'avatar')
  } catch {
    return null
  }
}

/**
 * Deferred path, step 2 (now authed, at /onboarding/beta/complete): read the
 * parked answers + uploaded avatar. A brand-new account is written in full; a
 * returning member's answers are MERGED into their existing profile (new info
 * harvested, blanks ignored). Then clear the cookie.
 */
export async function finalizePendingInduction(
  avatarUrl: string | null,
  destinationUrl?: string,
): Promise<{ ok: boolean; error?: string; merged?: boolean; target?: string }> {
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

  let merged = false
  try {
    if (await callerAlreadyOnboarded()) {
      await mergeBetaInduction(payload)
      merged = true
    } else {
      await writeBetaInduction(payload)
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong.' }
  }

  store.delete(PENDING_INDUCTION_COOKIE)
  // Default landing: a returning member (merged) → the bare feed; a brand-new Founder → the
  // feed with Vera's welcome. A NICHE funnel's destination overrides it, but ONLY when the
  // url (carried as the `?to=` on the completion path) re-validates here as a safe in-app
  // path. Fails closed to the default for a waitlist / absent / unsafe url.
  const fallback = merged ? '/feed' : '/feed?welcome=vera'
  const target = destinationUrl && isSafeInAppPath(destinationUrl) ? destinationUrl : fallback
  return { ok: true, merged, target }
}
