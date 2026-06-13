'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { logAdminAction } from '@/lib/admin/audit'
import { isJanitor, type WebRole } from '@/lib/core/roles'
import type { Database } from '@/lib/database.types'
import { parseInput, z, uuid, positiveIntAmount, requiredText } from '@/lib/validation'

// Shared auth guard — janitor-only for manual economy adjustments. Crown-jewel gate:
// the STAFF axis (web_role janitor, ADR-208), read via the untyped cast (column not
// yet in the generated types).
async function requireJanitor(): Promise<{ id: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')
  const admin = createAdminClient()
  const { data: profile } = await (admin)
    .from('profiles')
    .select('id, web_role')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!profile || !isJanitor(profile.web_role as WebRole | null)) {
    throw new Error('Janitor only')
  }
  return { id: profile.id as string }
}

const MAX_GRANT = 100_000

// Manual gem/zap adjustment input — mirrors the prior hand-rolled guard exactly
// (Math.floor, 0 < n ≤ MAX_GRANT, non-empty reason) plus a uuid check on the target.
const economyAdjustment = z.object({
  profileId: uuid,
  amount: positiveIntAmount(MAX_GRANT),
  reason: requiredText('Reason is required'),
})

// ── Gems ──────────────────────────────────────────────────────────────────────

/**
 * Grant `amount` gems to a member. Records a `manual` gem_transaction so the
 * Vault log is complete and the trigger keeps profile totals in sync.
 */
export async function grantGems(
  profileId: string,
  amount: number,
  reason: string,
): Promise<void> {
  const caller = await requireJanitor()
  const { profileId: pid, amount: n, reason: cleanReason } = parseInput(economyAdjustment, {
    profileId,
    amount,
    reason,
  })

  const admin = createAdminClient()
  const { error } = await admin.from('gem_transactions').insert({
    profile_id: pid,
    action_type: 'manual',
    amount: n,
    metadata: { reason: cleanReason, granted_by: caller.id } as
      Database['public']['Tables']['gem_transactions']['Insert']['metadata'],
  })
  if (error) throw new Error(error.message)

  await logAdminAction({
    actorId: caller.id,
    action: 'economy.gems.grant',
    targetType: 'profile',
    targetId: pid,
    detail: { amount: n, reason: cleanReason },
  })

  revalidatePath('/admin/members')
}

/**
 * Revoke (deduct) `amount` gems from a member. Records a negative
 * `manual` gem_transaction so the Vault log remains the single source of truth
 * and the `after_gem_transaction` trigger adjusts profile totals automatically.
 */
export async function revokeGems(
  profileId: string,
  amount: number,
  reason: string,
): Promise<void> {
  const caller = await requireJanitor()
  const { profileId: pid, amount: n, reason: cleanReason } = parseInput(economyAdjustment, {
    profileId,
    amount,
    reason,
  })

  const admin = createAdminClient()
  const { error } = await admin.from('gem_transactions').insert({
    profile_id: pid,
    action_type: 'manual',
    amount: -n,
    metadata: { reason: cleanReason, revoked_by: caller.id } as
      Database['public']['Tables']['gem_transactions']['Insert']['metadata'],
  })
  if (error) throw new Error(error.message)

  await logAdminAction({
    actorId: caller.id,
    action: 'economy.gems.revoke',
    targetType: 'profile',
    targetId: pid,
    detail: { amount: n, reason: cleanReason },
  })

  revalidatePath('/admin/members')
}

// ── Zaps ──────────────────────────────────────────────────────────────────────

/**
 * Grant `amount` zaps to a member. Writes directly to zap_transactions (no
 * membership-tier throttle — this is a deliberate admin override). The
 * `after_zap_transaction` trigger advances season + lifetime totals and rank.
 */
export async function grantZaps(
  profileId: string,
  amount: number,
  reason: string,
): Promise<void> {
  const caller = await requireJanitor()
  const { profileId: pid, amount: n, reason: cleanReason } = parseInput(economyAdjustment, {
    profileId,
    amount,
    reason,
  })

  const admin = createAdminClient()
  const { error } = await admin.from('zap_transactions').insert({
    profile_id: pid,
    action_type: 'manual',
    amount: n,
    metadata: { reason: cleanReason, granted_by: caller.id } as
      Database['public']['Tables']['zap_transactions']['Insert']['metadata'],
  })
  if (error) throw new Error(error.message)

  await logAdminAction({
    actorId: caller.id,
    action: 'economy.zaps.grant',
    targetType: 'profile',
    targetId: pid,
    detail: { amount: n, reason: cleanReason },
  })

  revalidatePath('/admin/members')
}

/**
 * Revoke (deduct) `amount` zaps from a member. Negative zap_transaction row;
 * the trigger walks totals and rank back automatically.
 */
export async function revokeZaps(
  profileId: string,
  amount: number,
  reason: string,
): Promise<void> {
  const caller = await requireJanitor()
  const { profileId: pid, amount: n, reason: cleanReason } = parseInput(economyAdjustment, {
    profileId,
    amount,
    reason,
  })

  const admin = createAdminClient()
  const { error } = await admin.from('zap_transactions').insert({
    profile_id: pid,
    action_type: 'manual',
    amount: -n,
    metadata: { reason: cleanReason, revoked_by: caller.id } as
      Database['public']['Tables']['zap_transactions']['Insert']['metadata'],
  })
  if (error) throw new Error(error.message)

  await logAdminAction({
    actorId: caller.id,
    action: 'economy.zaps.revoke',
    targetType: 'profile',
    targetId: pid,
    detail: { amount: n, reason: cleanReason },
  })

  revalidatePath('/admin/members')
}
