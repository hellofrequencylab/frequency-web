import 'server-only'

// CLAIM-ON-JOIN, shared by both signup finishers (SCAN-743). Everything a brand-new member brought
// with them is redeemed here: the Space lead-grab they scanned in on, the sealed lead already holding
// their email, the guest event seats they RSVP'd to before they had an account, and the connector
// rewards owed to whoever captured them. It lived only in completeOnboarding (app/onboarding/actions.ts),
// whose page has redirected to /join since FUNNEL_INDUCTION_ACTIVE, so every live signup skipped all of
// it. One helper, two callers, so the two paths cannot drift again.
//
// EVERY STEP IS FAIL-SAFE AND NEVER BLOCKS A SIGNUP. A claim is a bonus; the member is already in.

import { cookies } from 'next/headers'
import { rewardConnectorJoinOnSignup } from '@/lib/rewards/connector'
import {
  LEAD_GRAB_COOKIE,
  LEGACY_LEAD_GRAB_COOKIE,
  parseLeadGrab,
  claimPendingLeadGrab,
  claimLeadOnSignup,
} from '@/lib/crm/lead-capture'

/** The SESSION-scoped Supabase client. claim_guest_rsvps proves ownership with auth.uid(), so the
 *  service-role client would claim nothing. Narrow on purpose: the RPC postdates the generated types,
 *  so the caller casts once rather than fighting a stale Database type here. */
export type ClaimOnJoinSession = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<unknown>
}

/**
 * Redeem everything a new member carried into signup. Call it once the profile row exists, after
 * acquisition is persisted and before the welcome is posted (so join rewards see the claimed state).
 */
export async function runClaimOnJoin(
  profileId: string,
  email: string | null | undefined,
  session: ClaimOnJoinSession,
): Promise<void> {
  if (!profileId) return

  // 1) The Space lead-grab (CRM Phase 3): an anonymous Space-QR scan parked a pending grab in a cookie.
  // Link the member into that Space's CRM with the original door, then clear ONLY the slot the grab
  // came from.
  //
  // 2026-09-06 (LIVE-162): the grab cookie was renamed 'fq_lead' -> 'fq_lead_grab' because the signup
  // lead claim (app/join/(induction)/lead-actions.ts) writes the same 'fq_lead' name, so on a shared
  // browser one overwrote the other. A grab parked before the rename is still worth redeeming (30-day
  // max-age), so the OLD name is read as a fallback and only a value that parses as a grab is used:
  // the claim cookie's `<id>.<token>` string is not one, so a visitor who only walked the join funnel
  // parses to null here and nothing is claimed. The legacy name is ALSO the signup lead claim's cookie,
  // consumed later by markLeadConverted, so it is never deleted unless the grab came from it.
  // 🗓️ DELETE THE FALLBACK AFTER 2026-10-07 (one full LEAD_GRAB_MAX_AGE past the rename): drop
  // LEGACY_LEAD_GRAB_COOKIE from this read, its delete below, and the export in lib/crm/lead-capture.ts.
  try {
    const jar = await cookies()
    const current = parseLeadGrab(jar.get(LEAD_GRAB_COOKIE)?.value)
    const legacy = current ? null : parseLeadGrab(jar.get(LEGACY_LEAD_GRAB_COOKIE)?.value)
    const grab = current ?? legacy
    if (grab) {
      await claimPendingLeadGrab(profileId, grab).catch(() => {})
      jar.delete(current ? LEAD_GRAB_COOKIE : LEGACY_LEAD_GRAB_COOKIE)
    }
  } catch {
    /* claim is a bonus, never a blocker on signup */
  }

  // 2) Any sealed lead already sharing this email gets its 'claim' touchpoint logged (the
  // profiles_sync_contact trigger linked profile_id).
  await claimLeadOnSignup(profileId, email).catch(() => {})

  // 3) The seats leg: any event this person RSVP'd to as a signed-out guest becomes theirs
  // (20270303000100). Session client, not incidental: the RPC proves ownership with auth.uid() and
  // requires auth.users.email_confirmed_at, so a merely-typed address claims nothing (ADR-854).
  try {
    await session.rpc('claim_guest_rsvps', { p_profile_id: profileId })
  } catch {
    /* a claim is a bonus, never a blocker on signup */
  }

  // 4) Connector reward (ADR-154 / ADR-777): each inviter whose event-sourced personal contacts hold
  // this email earns the join Zaps and Gem. Idempotent, daily-capped and fail-safe inside the engine.
  await rewardConnectorJoinOnSignup(email).catch(() => {})
}
