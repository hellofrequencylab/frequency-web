import { GitCompareArrows, MailCheck, Target, Users } from 'lucide-react'
import { getSpaceCrmFunnel, type FunnelStage } from '@/lib/spaces/crm-funnel'
import { formatMoney } from '@/lib/crm/pipeline'
import { SectionHeader } from '@/components/ui/section-header'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'

// PER-SPACE CRM FUNNEL PANEL (ADR-381). A read-only conversion + engagement view on the CRM board: a
// stage-by-stage funnel (count + value + share of the pipeline), a headline conversion rate, and a
// small stat row for contact reach + email engagement. Self-fetching Server Component; the read
// (getSpaceCrmFunnel) is owner-gated + fail-safe, so an unauthorized viewer or any error renders the
// calm empty state. Composes kit primitives + semantic tokens only. No em or en dashes (CONTENT-VOICE).

function stageBarClass(kind: FunnelStage['kind']): string {
  return kind === 'won' ? 'bg-success' : kind === 'lost' ? 'bg-danger' : 'bg-primary'
}

/** A whole-percent label for a fraction in [0, 1] (e.g. 0.123 -> "12%"). */
function pct(fraction: number): string {
  return `${Math.round((fraction || 0) * 100)}%`
}

export async function CrmFunnelPanel({ spaceId }: { spaceId: string }) {
  const funnel = await getSpaceCrmFunnel(spaceId)

  if (funnel.totalDeals === 0) {
    return (
      <section>
        <SectionHeader title="Funnel" />
        <EmptyState
          icon={Target}
          title="No deals to chart yet."
          description="Once you track deals through your stages, this shows where they sit and how many turn into wins."
        />
      </section>
    )
  }

  // The widest stage sets the bar scale, so the longest bar fills the row and the rest read relative
  // to it. Guard against an all-empty-stages case (every deal sits outside a known stage).
  const maxCount = funnel.stages.reduce((m, s) => Math.max(m, s.count), 0)

  return (
    <section>
      <SectionHeader title="Funnel" count={funnel.totalDeals} />

      {/* Headline stats: conversion + value, then reach + email engagement. */}
      <div className="mb-4 grid grid-cols-2 gap-3 @2xl:grid-cols-4">
        <StatCard
          size="sm"
          label="Won rate"
          value={pct(funnel.conversionRate)}
          detail={`${funnel.wonCount} of ${funnel.totalDeals} deals`}
          icon={Target}
        />
        <StatCard
          size="sm"
          label="Pipeline value"
          value={formatMoney(funnel.totalValue)}
          icon={GitCompareArrows}
        />
        <StatCard
          size="sm"
          label="Subscribed contacts"
          value={funnel.reach.subscribed}
          detail={`${funnel.reach.total} in your space`}
          icon={Users}
        />
        <StatCard
          size="sm"
          label="Emails delivered"
          value={funnel.email.delivered}
          detail={
            funnel.email.sent > 0
              ? `${pct(funnel.email.bounceRate)} bounced`
              : 'No sends yet'
          }
          icon={MailCheck}
        />
      </div>

      {/* The stage-by-stage funnel: a labeled bar per stage, scaled to the widest stage. */}
      <div className="space-y-2 rounded-2xl border border-border bg-surface p-4 shadow-sm">
        {funnel.stages.map((stage) => {
          const width = maxCount > 0 ? Math.round((stage.count / maxCount) * 100) : 0
          return (
            <div key={stage.id}>
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${stageBarClass(stage.kind)}`}
                    aria-hidden
                  />
                  <p className="truncate text-sm font-medium text-text">{stage.name}</p>
                  <span className="shrink-0 text-xs tabular-nums text-subtle">{stage.count}</span>
                </div>
                <span className="shrink-0 text-xs font-medium tabular-nums text-muted">
                  {formatMoney(stage.value)}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-elevated">
                <div
                  className={`h-full rounded-full ${stageBarClass(stage.kind)} transition-[width] motion-reduce:transition-none`}
                  style={{ width: `${width}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
