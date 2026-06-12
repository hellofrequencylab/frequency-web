// Referral program analytics — the funnel and the people driving it. Reads the
// records the referral system writes: profiles.referred_by_profile_id (attributed
// signups), reward_grants `referral.activated:<id>` (the referrer payout, written by
// lib/qr/referral.releaseReferralReward once the referred member activates), and the
// invite_accepted zap_transactions (zaps paid). Server-only, best-effort.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

export interface ReferrerRow {
  profileId: string
  name: string
  handle: string
  avatarUrl: string | null
  signups: number
  activated: number
  zaps: number
}

export interface ReferralActivityRow {
  id: string
  name: string
  handle: string
  at: string | null
}

export interface ReferralStats {
  signups: number
  activated: number
  pending: number
  zapsPaid: number
  conversionPct: number | null
  topReferrers: ReferrerRow[]
  recent: ReferralActivityRow[]
}

const EMPTY: ReferralStats = {
  signups: 0,
  activated: 0,
  pending: 0,
  zapsPaid: 0,
  conversionPct: null,
  topReferrers: [],
  recent: [],
}

export async function getReferralStats(): Promise<ReferralStats> {
  try {
    const db = createAdminClient() as unknown as SupabaseClient

    const [referredRes, grantsRes, zapRes] = await Promise.all([
      db.from('profiles').select('referred_by_profile_id').not('referred_by_profile_id', 'is', null),
      db
        .from('reward_grants')
        .select('profile_id, granted_at')
        .like('rule_key', 'referral.activated:%')
        .order('granted_at', { ascending: false }),
      db.from('zap_transactions').select('profile_id, amount').eq('action_type', 'invite_accepted'),
    ])

    // Attributed signups, per referrer.
    const referred = (referredRes.data ?? []) as { referred_by_profile_id: string }[]
    const signupsBy = new Map<string, number>()
    for (const r of referred) signupsBy.set(r.referred_by_profile_id, (signupsBy.get(r.referred_by_profile_id) ?? 0) + 1)
    const signups = referred.length

    // Activated (the referrer was paid), per referrer.
    const grants = (grantsRes.data ?? []) as { profile_id: string; granted_at: string | null }[]
    const activatedBy = new Map<string, number>()
    for (const g of grants) activatedBy.set(g.profile_id, (activatedBy.get(g.profile_id) ?? 0) + 1)
    const activated = grants.length

    // Zaps paid to referrers, per referrer.
    const zaps = (zapRes.data ?? []) as { profile_id: string; amount: number }[]
    const zapsBy = new Map<string, number>()
    let zapsPaid = 0
    for (const z of zaps) {
      zapsBy.set(z.profile_id, (zapsBy.get(z.profile_id) ?? 0) + (z.amount ?? 0))
      zapsPaid += z.amount ?? 0
    }

    // Names for everyone who appears in any tally.
    const ids = new Set<string>([...signupsBy.keys(), ...activatedBy.keys(), ...zapsBy.keys()])
    const names = new Map<string, { name: string; handle: string; avatar: string | null }>()
    if (ids.size > 0) {
      const { data } = await db.from('profiles').select('id, display_name, handle, avatar_url').in('id', [...ids])
      for (const p of (data ?? []) as { id: string; display_name: string | null; handle: string; avatar_url: string | null }[]) {
        names.set(p.id, { name: p.display_name ?? 'Member', handle: p.handle, avatar: p.avatar_url })
      }
    }

    const topReferrers: ReferrerRow[] = [...ids]
      .map((id) => ({
        profileId: id,
        name: names.get(id)?.name ?? 'Member',
        handle: names.get(id)?.handle ?? '',
        avatarUrl: names.get(id)?.avatar ?? null,
        signups: signupsBy.get(id) ?? 0,
        activated: activatedBy.get(id) ?? 0,
        zaps: zapsBy.get(id) ?? 0,
      }))
      .sort((a, b) => b.activated - a.activated || b.signups - a.signups || b.zaps - a.zaps)
      .slice(0, 12)

    const recent: ReferralActivityRow[] = grants.slice(0, 10).map((g, i) => ({
      id: `${g.profile_id}:${g.granted_at ?? i}`,
      name: names.get(g.profile_id)?.name ?? 'Member',
      handle: names.get(g.profile_id)?.handle ?? '',
      at: g.granted_at,
    }))

    return {
      signups,
      activated,
      pending: Math.max(0, signups - activated),
      zapsPaid,
      conversionPct: signups > 0 ? Math.round((activated / signups) * 100) : null,
      topReferrers,
      recent,
    }
  } catch {
    return EMPTY
  }
}
