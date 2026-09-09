import { listFlagEvents, getPlatformSetting, type FlagEvent } from '@/lib/platform-flags'
import { referralsEnabled } from '@/lib/platform-flags'
import { createAdminClient } from '@/lib/supabase/admin'

// "Onboarding & referral controls" data for /admin/onboarding-controls. Returns plain,
// serializable shapes (no Maps) for the client view: the referral master switch, the
// read-only referral reward amount (from zap_config.invite_accepted, edited at
// /admin/gamification), and the resolved toggle audit log (who/when).
//
// It carried two more switches until 2026-09-09: `next_steps_enabled` and
// `auto_popups_enabled`, the kill flags on two onboarding engines that both read false. Both
// engines are deleted (LIVE-240) and onboarding is authored at /admin/walkthroughs now, so the
// switches went with them. The platform_flags rows are inert; nothing reads them.

export type OnboardingSwitchEvent = {
  id: string
  value: boolean
  source: string
  createdAt: string | null
  who: string
}

async function resolveNames(events: FlagEvent[]): Promise<OnboardingSwitchEvent[]> {
  const admin = createAdminClient()
  const ids = [...new Set(events.map((e) => e.changedBy).filter((x): x is string => !!x))]
  const names = new Map<string, string>()
  if (ids.length) {
    const { data } = await admin.from('profiles').select('id, display_name').in('id', ids)
    for (const p of (data ?? []) as { id: string; display_name: string | null }[]) {
      names.set(p.id, p.display_name ?? 'Unknown')
    }
  }
  return events.map((e) => ({
    id: e.id,
    value: e.value,
    source: e.source,
    createdAt: e.createdAt,
    who: e.changedBy ? (names.get(e.changedBy) ?? 'Unknown') : 'System',
  }))
}

export async function getOnboardingControlsData() {
  const admin = createAdminClient()
  const [referrals, referralsEvents, reward, landing] = await Promise.all([
    referralsEnabled(),
    listFlagEvents('referrals_enabled', 10),
    admin.from('zap_config').select('zaps_amount, is_active').eq('action_type', 'invite_accepted').maybeSingle(),
    getPlatformSetting('personal_code_landing', '/'),
  ])

  const referralsAudit = await resolveNames(referralsEvents)

  const rewardRow = reward.data as { zaps_amount: number | null; is_active: boolean | null } | null

  return {
    referrals,
    referralsAudit,
    referralReward: {
      amount: rewardRow?.zaps_amount ?? null,
      active: rewardRow?.is_active ?? false,
    },
    landing,
  }
}
