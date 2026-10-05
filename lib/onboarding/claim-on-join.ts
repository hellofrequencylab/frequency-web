import 'server-only'

import { cookies } from 'next/headers'
import { rewardConnectorJoinOnSignup } from '@/lib/rewards/connector'
import {
  LEAD_GRAB_COOKIE,
  LEGACY_LEAD_GRAB_COOKIE,
  parseLeadGrab,
  claimPendingLeadGrab,
  claimLeadOnSignup,
} from '@/lib/crm/lead-capture'

// CLAIM-ON-JOIN (CRM Phase 3, ADR-154 / ADR-777). One helper for every finisher that turns a
// visitor into a member, so a Space lead-grab scan, a sealed lead's claim touchpoint, a guest RSVP
// seat and an inviter's join reward land no matter which door the member came through.
//
// SCAN-743 (2026-10-05): this block lived only in completeOnboarding (app/onboarding/actions.ts),
// whose page redirects to /join while the funnel induction is live. The live finisher, writeInduction
// in app/join/(induction)/actions.ts, never ran it, so every member who signed up through /join was
// dropped from the Space CRM they scanned into and their inviters never earned the join Zaps and
// Gems. Both finishers now call runClaimOnJoin. Every leg is fail-safe: a claim is a bonus, never a
// blocker on signup, and each leg is idempotent on its own side.

/** The SESSION-scoped client: claim_guest_rsvps proves ownership with auth.uid() and would find
 *  nothing under the admin client (see the seats leg below). Narrowed to the one call made, with
 *  the function name as its literal so the generated `Database` client is assignable without a
 *  cast (the RPC is in lib/database.types.ts). supabase-js resolves `{ error }` rather than
 *  throwing, and the outcome is deliberately not read: a claim is a bonus. */
export type ClaimOnJoinSessionClient = {
  rpc: (fn: 'claim_guest_rsvps', args: { p_profile_id: string }) => PromiseLike<unknown>
}

export async function runClaimOnJoin(
  profileId: string,
  email: string | null | undefined,
  session: ClaimOnJoinSessionClient,
): Promise<void> {
  if (!profileId) return
  // The Space leg: an anonymous Space-QR scan parked a pending grab (fq_lead_grab cookie); link the
  // new member into that Space's CRM with the original door, then clear the cookie.
  try {
    const jar = await cookies()
    // 2026-09-06 (LIVE-162): the grab cookie was renamed 'fq_lead' -> 'fq_lead_grab' because the
    // signup lead claim (app/join/(induction)/lead-actions.ts) writes the same 'fq_lead' name, so
    // on a shared browser one overwrote the other. A grab parked before the rename is still worth
    // redeeming (30-day max-age), so the OLD name is read as a fallback and only a value that
    // parses as a grab is used: the claim cookie's `<id>.<token>` string is not one, so a visitor
    // who only walked the join funnel parses to null here and nothing is claimed.
    // 🗓️ DELETE THE FALLBACK AFTER 2026-10-07 (one full LEAD_GRAB_MAX_AGE past the rename): drop
    // LEGACY_LEAD_GRAB_COOKIE from this read, its delete below, and the export in lib/crm/lead-capture.ts.
    const current = parseLeadGrab(jar.get(LEAD_GRAB_COOKIE)?.value)
    const legacy = current ? null : parseLeadGrab(jar.get(LEGACY_LEAD_GRAB_COOKIE)?.value)
    const grab = current ?? legacy
    if (grab) {
      await claimPendingLeadGrab(profileId, grab).catch(() => {})
      // Clear only the slot the grab actually came from. The legacy name is ALSO the signup lead
      // claim's cookie, and that one is consumed later, by markLeadConverted: deleting it here
      // whenever it exists would drop a conversion stamp that has not been written yet.
      jar.delete(current ? LEAD_GRAB_COOKIE : LEGACY_LEAD_GRAB_COOKIE)
    }
  } catch {
    /* claim is a bonus, never a blocker on signup */
  }
  // The touchpoint leg: any sealed lead already sharing this email gets its 'claim' touchpoint
  // logged (the profiles_sync_contact trigger linked profile_id).
  await claimLeadOnSignup(profileId, email).catch(() => {})
  // The seats leg: any event this person already RSVP'd to as a signed-out guest becomes theirs
  // (20270303000100). Without this the guest seat is a dead end: it holds a place in the room but
  // never appears in "my events", can never be cancelled by the person holding it, and never
  // reaches WAM. Called on the SESSION client, which is not incidental: claim_guest_rsvps proves
  // ownership with auth.uid() and would find nothing under the admin client. It also requires
  // auth.users.email_confirmed_at, so a merely-typed address claims nothing (ADR-854). The auth
  // callback runs the same claim at sign-in; the RPC is idempotent, so both may run.
  try {
    await session.rpc('claim_guest_rsvps', { p_profile_id: profileId })
  } catch {
    /* a claim is a bonus, never a blocker on signup */
  }
  // The connector leg (ADR-154 / ADR-777): if this new member's email matches one or more inviters'
  // event-sourced personal contacts, each inviter earns the join Zaps and Gem (the person they
  // captured actually joined). Idempotent, daily-capped and fail-safe inside the grant engine.
  await rewardConnectorJoinOnSignup(email).catch(() => {})
}
