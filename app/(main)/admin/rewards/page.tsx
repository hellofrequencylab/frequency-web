import { Gift } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { StatusChip } from '@/components/admin/status'
import { evaluateRetroRewards } from '@/lib/rewards/evaluate'
import { REWARD_RULES, getRewardRule } from '@/lib/rewards/rules'
import { RunRewardsButton } from './run-button'

export const dynamic = 'force-dynamic'

export default async function RewardsPage() {
  await requireAdmin('admin')

  // Dry-run preview — what WOULD grant if you ran it now (no writes).
  const preview = await evaluateRetroRewards({ dryRun: true })
  const pending = preview.byRule.reduce((n, r) => n + r.pending, 0)
  const pendingGems = preview.byRule.reduce((n, r) => {
    const rule = getRewardRule(r.key)
    return n + (rule?.reward.kind === 'gems' ? r.pending * rule.reward.amount : 0)
  }, 0)

  return (
    <AdminTemplate
      title="Retroactive rewards"
      icon={Gift}
      eyebrow="Engage"
      description="Define a rule today; reward the behavior members already earned. Runs are idempotent, so re-running never double-grants. Preview below shows what is pending."
      actions={<RunRewardsButton pending={pending} />}
      width="default"
    >
      {/* Stat tiles — bordered so they read on the canvas */}
      <AdminSection>
        <div className="grid grid-cols-3 gap-3">
          <StatCard bordered label="Members scanned" value={preview.members} />
          <StatCard bordered label="Pending grants" value={pending} />
          <StatCard bordered label="Pending gems" value={pendingGems.toLocaleString()} />
        </div>
      </AdminSection>

      <AdminSection title="Rules" description="Each rule matches durable history (lifetime rank, behavioral depth, tags, tier) and grants once.">
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {REWARD_RULES.map((rule) => {
            const t = preview.byRule.find((b) => b.key === rule.key)
            return (
              <li key={rule.key} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-text">
                    {rule.label}
                    <span className="inline-flex items-center gap-1 rounded-md bg-signal-bg/40 px-1.5 py-0.5 text-xs font-bold text-signal-strong">
                      +{rule.reward.amount} {rule.reward.kind}
                    </span>
                    {!rule.active && (
                      <StatusChip tone="neutral" size="sm">Off</StatusChip>
                    )}
                  </p>
                  <p className="text-xs text-subtle">{rule.description}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold tabular-nums text-text">
                    {t?.pending ?? 0}{' '}
                    <span className="text-xs font-normal text-subtle">pending</span>
                  </p>
                  <p className="text-xs text-subtle tabular-nums">{t?.granted ?? 0} already granted</p>
                </div>
              </li>
            )
          })}
        </ul>
      </AdminSection>
    </AdminTemplate>
  )
}
