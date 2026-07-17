'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import type { Database } from '@/lib/database.types'
import { createClient } from '@/lib/supabase/server'
import { sendWelcomeEmail } from '@/lib/email'
import { sanitizeProfileInput } from '@/lib/profile-input'
import { applyReferralAttribution, applyEntryPointConversion } from '@/lib/qr/referral'
import { postWelcomeForMember } from '@/lib/onboarding/welcome'
import { ensureMemberCodes } from '@/lib/qr/member-codes'
import { persistAcquisition } from '@/lib/attribution/acquisition'
import { rewardConnectorJoinOnSignup } from '@/lib/rewards/connector'
import {
  LEAD_GRAB_COOKIE,
  parseLeadGrab,
  claimPendingLeadGrab,
  claimLeadOnSignup,
} from '@/lib/crm/lead-capture'

export async function completeOnboarding(data: {
  displayName: string
  handle: string
  bio: string
  avatarUrl: string
  regionId: string
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

  const update: Database['public']['Tables']['profiles']['Update'] = {
    meta: { ...curMeta, onboarding_completed: true },
  }
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

  // Credit the referrer if this member arrived via a scanned referral code, and
  // snapshot first-touch acquisition (campaign / poster / code) onto the profile.
  if (updated?.id) {
    await applyReferralAttribution(updated.id)
    await applyEntryPointConversion(updated.id).catch(() => {})
    await persistAcquisition(updated.id).catch(() => {})
    // CLAIM-ON-JOIN (CRM Phase 3): redeem any Space lead-grab this new member came through. Two
    // fail-safe, never-blocking paths — an anonymous Space-QR scan carried a pending grab (fq_lead
    // cookie → link into the Space CRM with the original door), and any sealed lead already sharing this
    // email gets its 'claim' touchpoint logged (the profiles_sync_contact trigger linked profile_id).
    try {
      const jar = await cookies()
      const grab = parseLeadGrab(jar.get(LEAD_GRAB_COOKIE)?.value)
      if (grab) {
        await claimPendingLeadGrab(updated.id, grab).catch(() => {})
        jar.delete(LEAD_GRAB_COOKIE)
      }
    } catch {
      /* claim is a bonus, never a blocker on signup */
    }
    await claimLeadOnSignup(updated.id, user.email).catch(() => {})
    // Connector reward (ADR-154 / ADR-777): if this new member's email matches one or more
    // inviters' event-sourced personal contacts, each inviter earns the join ⚡⚡ + 💎 (the person
    // they captured actually joined). Idempotent + daily-capped + fail-safe inside the grant engine.
    await rewardConnectorJoinOnSignup(user.email).catch(() => {})
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
