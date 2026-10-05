'use server'

import { redirect } from 'next/navigation'
import type { Database } from '@/lib/database.types'
import { createClient } from '@/lib/supabase/server'
import { mergeProfileMeta } from '@/lib/profiles/meta'
import { sendWelcomeEmail } from '@/lib/email'
import { sanitizeProfileInput } from '@/lib/profile-input'
import { recordConsent } from '@/lib/consent/consent'
import { applyReferralAttribution, applyEntryPointConversion } from '@/lib/qr/referral'
import { postWelcomeForMember } from '@/lib/onboarding/welcome'
import { ensureMemberCodes } from '@/lib/qr/member-codes'
import { persistAcquisition } from '@/lib/attribution/acquisition'
import { runClaimOnJoin } from '@/lib/onboarding/claim-on-join'

export async function completeOnboarding(data: {
  displayName: string
  handle: string
  bio: string
  avatarUrl: string
  regionId: string
  /** The member's email opt-in choice from onboarding (defaults on). Recorded to the consent ledger. */
  // 2026-09-05 (scan2 L5-16): "defaults on" is retired. Marketing consent is never granted by
  // omission: an absent field records `granted = false`. Only an explicit `true` opts in.
  emailOptIn?: boolean
}) {
  const { displayName, handle, bio, avatarUrl } = sanitizeProfileInput(data)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error('Unauthorized')

  // Don't clobber a member who's already been through onboarding. On a SECOND pass
  // we only fill blanks (never overwrite existing display name/handle/bio/avatar/
  // region) and MERGE meta (so beta/tour state survives). First pass sets it all.
  const { data: cur } = await supabase
    .from('profiles')
    .select('display_name, handle, bio, avatar_url, nexus_region_id, meta')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const curMeta = ((cur?.meta as Record<string, unknown> | null) ?? {})
  const onboarded = curMeta.onboarding_completed === true

  // 2026-09-05 (scan2 L6-09): "MERGE meta" above now happens at the database. The identity columns go
  // in the checked update below (handle uniqueness decides that outcome); `onboarding_completed` is
  // then merged server-side as its own key, so beta/tour state is preserved without being read and
  // written back. A merge that fails throws before any welcome side effect runs; the next pass sees
  // `onboarded` false and only fills blanks, so nothing is lost by retrying.
  const update: Database['public']['Tables']['profiles']['Update'] = {}
  if (!onboarded) {
    update.display_name = displayName
    update.handle = handle
    update.bio = bio || null
    update.avatar_url = avatarUrl || null
    update.nexus_region_id = data.regionId
  } else {
    // Repeat pass — fill only what's empty; leave the handle/identity untouched.
    if (!cur?.display_name?.trim()) update.display_name = displayName
    if (!cur?.bio) update.bio = bio || null
    if (!cur?.avatar_url) update.avatar_url = avatarUrl || null
    if (!cur?.nexus_region_id) update.nexus_region_id = data.regionId
  }

  const { data: updated, error } = await supabase
    .from('profiles')
    .update(update)
    .eq('auth_user_id', user.id)
    .select('id')
    .maybeSingle()

  if (error) {
    // 23505 = unique_violation. Handle was claimed between check and submit
    if (error.code === '23505') {
      throw new Error('That handle was just taken. Go back and choose another.')
    }
    throw new Error(error.message)
  }

  if (updated?.id) {
    const { error: metaErr } = await mergeProfileMeta(supabase, updated.id, { onboarding_completed: true })
    if (metaErr) throw new Error(metaErr)
  }

  // Credit the referrer if this member arrived via a scanned referral code, and
  // snapshot first-touch acquisition (campaign / poster / code) onto the profile.
  if (updated?.id) {
    // Record the member's email opt-in choice (ONLY on the first pass, so a later opt-out is never
    // clobbered by a repeat onboarding). `email_lifecycle` already defaults granted; this captures the
    // marketing/community-news scope they chose on the compelling opt-in card. Never blocks onboarding.
    // 2026-09-05 (scan2 L5-16): `emailOptIn ?? true` recorded consent as GRANTED whenever a caller
    // omitted the field. Consent is an affirmative act, so only an explicit `true` grants it.
    if (!onboarded) {
      await recordConsent(updated.id, 'email_marketing', data.emailOptIn === true, 'onboarding').catch(() => {})
    }
    await applyReferralAttribution(updated.id)
    await applyEntryPointConversion(updated.id).catch(() => {})
    await persistAcquisition(updated.id).catch(() => {})
    // CLAIM-ON-JOIN (CRM Phase 3): the Space lead-grab, the sealed lead's claim touchpoint, the
    // guest RSVP seats and the inviter's connector reward, each fail-safe. SCAN-743: shared with the
    // live /join finisher (writeInduction) through lib/onboarding/claim-on-join.ts.
    await runClaimOnJoin(updated.id, user.email, supabase)
    // Welcome the new member (ADR-231): grants the join Zaps AND drops the one quiet
    // "@handle joined 👋" line into the feed + the personal notification. This is the
    // classic path — it previously only granted Zaps and never posted the feed line,
    // so many members joined with no notice. postWelcomeForMember is idempotent
    // (reward_grants lock), so a repeat pass or the beta path never double-announces.
    // Every account gets its QR code the moment it has a handle (owner directive).
    // First pass writes the new handle; a repeat pass keeps the existing one.
    const memberHandle = onboarded ? (cur?.handle ?? handle) : handle
    await postWelcomeForMember(updated.id, displayName, memberHandle).catch(() => {})
    // Fire-and-forget: a provisioning hiccup never blocks onboarding — the invite
    // and /codes surfaces lazily re-provision as the fallback.
    if (memberHandle) {
      ensureMemberCodes(updated.id, memberHandle).catch((e) => console.error('[member-codes]', e))
    }
  }

  // Fire welcome email. Non-blocking, never throws
  if (user.email) {
    sendWelcomeEmail({ to: user.email, displayName }).catch(() => {})
  }

  // Hand off to Vera, whose one job is getting the new member into a real circle,
  // then she steps back (AI-VERA §3). Drop them into the feed with her onboarding
  // lightbox over it; she links straight on to /circles.
  redirect('/feed?welcome=vera')
}
