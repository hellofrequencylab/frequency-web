import { listFlagEvents, type FlagEvent } from '@/lib/platform-flags'
import { nextStepsEnabled } from '@/lib/onboarding/status'
import { autoPopupsEnabled } from '@/lib/onboarding/flags'
import { referralsEnabled } from '@/lib/platform-flags'
import { createAdminClient } from '@/lib/supabase/admin'

// "Onboarding & referral controls" data for /admin/onboarding-controls. Returns plain,
// serializable shapes (no Maps) for the client view: the three master-switch states, the
// read-only referral reward amount (from zap_config.invite_accepted, edited at
// /admin/gamification), and the resolved toggle audit log for each switch (who/when).

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
  const [nextSteps, autoPopups, referrals, nextStepsEvents, autoPopupsEvents, referralsEvents, reward] =
    await Promise.all([
      nextStepsEnabled(),
      autoPopupsEnabled(),
      referralsEnabled(),
      listFlagEvents('next_steps_enabled', 10),
      listFlagEvents('auto_popups_enabled', 10),
      listFlagEvents('referrals_enabled', 10),
      admin.from('zap_config').select('zaps_amount, is_active').eq('action_type', 'invite_accepted').maybeSingle(),
    ])

  const [nextStepsAudit, autoPopupsAudit, referralsAudit] = await Promise.all([
    resolveNames(nextStepsEvents),
    resolveNames(autoPopupsEvents),
    resolveNames(referralsEvents),
  ])

  const rewardRow = reward.data as { zaps_amount: number | null; is_active: boolean | null } | null

  return {
    nextSteps,
    autoPopups,
    referrals,
    nextStepsAudit,
    autoPopupsAudit,
    referralsAudit,
    referralReward: {
      amount: rewardRow?.zaps_amount ?? null,
      active: rewardRow?.is_active ?? false,
    },
  }
}
