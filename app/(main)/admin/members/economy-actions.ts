'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { logAdminAction } from '@/lib/admin/audit'
import { atLeastRole } from '@/lib/core/roles'
import type { Database } from '@/lib/database.types'

// Shared auth guard — janitor-only for manual economy adjustments.
async function requireJanitor(): Promise<{ id: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, community_role')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!profile || !atLeastRole(profile.community_role as import('@/lib/core/roles').CommunityRole, 'janitor')) {
    throw new Error('Janitor only')
  }
  return { id: profile.id }
}

const MAX_GRANT = 100_000

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
  const n = Math.floor(amount)
  if (!Number.isFinite(n) || n <= 0 || n > MAX_GRANT) throw new Error('Invalid amount')
  if (!reason.trim()) throw new Error('Reason is required')

  const admin = createAdminClient()
  const { error } = await admin.from('gem_transactions').insert({
    profile_id: profileId,
    action_type: 'manual',
    amount: n,
    metadata: { reason: reason.trim(), granted_by: caller.id } as
      Database['public']['Tables']['gem_transactions']['Insert']['metadata'],
  })
  if (error) throw new Error(error.message)

  await logAdminAction({
    actorId: caller.id,
    action: 'economy.gems.grant',
    targetType: 'profile',
    targetId: profileId,
    detail: { amount: n, reason: reason.trim() },
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
  const n = Math.floor(amount)
  if (!Number.isFinite(n) || n <= 0 || n > MAX_GRANT) throw new Error('Invalid amount')
  if (!reason.trim()) throw new Error('Reason is required')

  const admin = createAdminClient()
  const { error } = await admin.from('gem_transactions').insert({
    profile_id: profileId,
    action_type: 'manual',
    amount: -n,
    metadata: { reason: reason.trim(), revoked_by: caller.id } as
      Database['public']['Tables']['gem_transactions']['Insert']['metadata'],
  })
  if (error) throw new Error(error.message)

  await logAdminAction({
    actorId: caller.id,
    action: 'economy.gems.revoke',
    targetType: 'profile',
    targetId: profileId,
    detail: { amount: n, reason: reason.trim() },
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
  const n = Math.floor(amount)
  if (!Number.isFinite(n) || n <= 0 || n > MAX_GRANT) throw new Error('Invalid amount')
  if (!reason.trim()) throw new Error('Reason is required')

  const admin = createAdminClient()
  const { error } = await admin.from('zap_transactions').insert({
    profile_id: profileId,
    action_type: 'manual',
    amount: n,
    metadata: { reason: reason.trim(), granted_by: caller.id } as
      Database['public']['Tables']['zap_transactions']['Insert']['metadata'],
  })
  if (error) throw new Error(error.message)

  await logAdminAction({
    actorId: caller.id,
    action: 'economy.zaps.grant',
    targetType: 'profile',
    targetId: profileId,
    detail: { amount: n, reason: reason.trim() },
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
  const n = Math.floor(amount)
  if (!Number.isFinite(n) || n <= 0 || n > MAX_GRANT) throw new Error('Invalid amount')
  if (!reason.trim()) throw new Error('Reason is required')

  const admin = createAdminClient()
  const { error } = await admin.from('zap_transactions').insert({
    profile_id: profileId,
    action_type: 'manual',
    amount: -n,
    metadata: { reason: reason.trim(), revoked_by: caller.id } as
      Database['public']['Tables']['zap_transactions']['Insert']['metadata'],
  })
  if (error) throw new Error(error.message)

  await logAdminAction({
    actorId: caller.id,
    action: 'economy.zaps.revoke',
    targetType: 'profile',
    targetId: profileId,
    detail: { amount: n, reason: reason.trim() },
  })

  revalidatePath('/admin/members')
}
