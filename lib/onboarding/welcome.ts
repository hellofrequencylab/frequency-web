import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { awardZapsForAction } from '@/lib/zaps'

// Joining pays (ADR-232): every new member starts with `community_join` Zaps, and
// joining through a friend's link pays the NEWCOMER `referred_join_bonus` on top
// (the inviter's invite_accepted is handled by lib/qr/referral.ts). Claim-then-pay
// through reward_grants (UNIQUE rule_key + profile_id), so both onboarding paths
// can call this and a member is never paid twice. Best-effort; never blocks.
export async function grantJoinZaps(memberId: string): Promise<void> {
  const admin = createAdminClient() as unknown as SupabaseClient
  try {
    const { error: claimErr } = await admin.from('reward_grants').insert({
      rule_key: 'join.welcome',
      profile_id: memberId,
      reward_kind: 'zaps',
      amount: 0, // the ledger row carries the live amount
      detail: 'Joined the community',
    })
    if (!claimErr) await awardZapsForAction(memberId, 'community_join')

    const { data: me } = await admin
      .from('profiles')
      .select('referred_by_profile_id')
      .eq('id', memberId)
      .maybeSingle()
    if ((me as { referred_by_profile_id: string | null } | null)?.referred_by_profile_id) {
      const { error: refClaimErr } = await admin.from('reward_grants').insert({
        rule_key: 'join.referred',
        profile_id: memberId,
        reward_kind: 'zaps',
        amount: 0,
        detail: 'Joined through a friend',
      })
      if (!refClaimErr) await awardZapsForAction(memberId, 'referred_join_bonus')
    }
  } catch {
    // a missed join grant must never block onboarding
  }
}

// Newcomer welcome (ONBOARDING beat #6, reshaped by ADR-231): when a new member
// finishes the induction, Vera (the system voice) does two small things —
//   1. drops ONE quiet line into the public feed (post_type 'system', rendered
//      like a group-chat join notice by SystemLine in post-card.tsx), and
//   2. sends the newcomer a personal welcome notification.
// The join grant (above) runs FIRST so the line's live count includes it.
// Best-effort; never blocks onboarding. No-op if there's no system account.
export async function postWelcomeForMember(
  memberId: string,
  displayName: string,
  handle: string,
): Promise<void> {
  // post_type 'system' (20260616100000) isn't in the generated types yet — untyped handle.
  const admin = createAdminClient() as unknown as SupabaseClient

  await grantJoinZaps(memberId)

  const { data: system } = await admin
    .from('profiles')
    .select('id')
    .eq('is_system', true)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()
  if (!system) return

  // The line the whole feed sees — naming the inviter when attribution exists
  // (profiles.referred_by_profile_id, set by the fq_ref scan flow). The renderer
  // (SystemLine) links every mention and shows each member's live Zap count.
  const { data: me } = await admin
    .from('profiles')
    .select('referred_by_profile_id')
    .eq('id', memberId)
    .maybeSingle()
  const refId = (me as { referred_by_profile_id: string | null } | null)?.referred_by_profile_id
  let inviter: string | null = null
  if (refId) {
    const { data: ref } = await admin.from('profiles').select('handle').eq('id', refId).maybeSingle()
    inviter = (ref as { handle: string } | null)?.handle ?? null
  }
  await admin.from('posts').insert({
    author_id: system.id,
    scope_id: system.id,
    visibility: 'public',
    post_type: 'system',
    body: inviter
      ? `@${handle} joined through @${inviter} 👋`
      : `@${handle} joined the community 👋`,
  })

  // The word in the newcomer's ear.
  const firstName = displayName.trim().split(/\s+/)[0] || displayName
  await admin.from('notifications').insert({
    recipient_id: memberId,
    actor_id: system.id,
    type: 'welcome',
    reference_type: 'profile',
    reference_id: system.id,
    body: `Welcome to Frequency, ${firstName} 👋 So glad you're here.`,
  })
}
