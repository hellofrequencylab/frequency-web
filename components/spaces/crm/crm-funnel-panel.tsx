import { GitCompareArrows, MailCheck, Target, TrendingDown, Users } from 'lucide-react'
import {
  getSpaceCrmFunnel,
  type AtRiskSummary,
  type ContactReach,
  type FunnelStage,
} from '@/lib/spaces/crm-funnel'
import { formatMoney } from '@/lib/crm/pipeline'
import { SectionHeader } from '@/components/ui/section-header'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { AtRiskWinBackButton } from './at-risk-winback-button'

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

/** The contact-consent split as a single stacked bar + a small legend. `reach.total` counts every
 *  contact; `subscribed` + `unsubscribed` are the two decided states, and the remainder is the
 *  added-but-not-yet-opted-in ("unknown") group, derived here so the three segments always sum to the
 *  whole list. PURE/presentational; the caller only renders it when there is at least one contact. */
function ContactConsentBar({ reach }: { reach: ContactReach }) {
  // Clamp to avoid a negative remainder if a stray bucket ever overcounts (the read is fail-safe, but
  // the bar should never go below zero or past the total).
  const decided = Math.min(reach.subscribed + reach.unsubscribed, reach.total)
  const notYet = reach.total - decided
  const segments = [
    { key: 'subscribed', label: 'Subscribed', count: reach.subscribed, bar: 'bg-success', dot: 'bg-success' },
    { key: 'notYet', label: 'Not yet opted in', count: notYet, bar: 'bg-surface-elevated', dot: 'bg-subtle' },
    { key: 'unsubscribed', label: 'Unsubscribed', count: reach.unsubscribed, bar: 'bg-danger', dot: 'bg-danger' },
  ] as const

  return (
    <div className="mb-4 rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-text">Who you can reach</p>
        <span className="text-xs tabular-nums text-subtle">
          {reach.subscribed} of {reach.total} mailable
        </span>
      </div>
      <div
        className="flex h-2 overflow-hidden rounded-full bg-surface-elevated"
        role="img"
        aria-label={`${reach.subscribed} subscribed, ${notYet} not yet opted in, ${reach.unsubscribed} unsubscribed, of ${reach.total} contacts`}
      >
        {segments.map((s) =>
          s.count > 0 ? (
            <div
              key={s.key}
              className={`h-full ${s.bar}`}
              style={{ width: `${(s.count / reach.total) * 100}%` }}
            />
          ) : null,
        )}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((s) => (
          <li key={s.key} className="inline-flex items-center gap-1.5 text-xs text-muted">
            <span className={`h-2 w-2 shrink-0 rounded-full ${s.dot}`} aria-hidden />
            <span>{s.label}</span>
            <span className="font-medium tabular-nums text-text">{s.count}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The at-risk / churn slice (ADR-560): how many of the Space's contacts are going cold, and the worst
 *  few with WHY (the scorer's factors) + a manual win-back trigger. Presentational; the caller renders
 *  it only when there is at least one at-risk contact, so a healthy CRM never shows an alarm. `slug` is
 *  threaded to the win-back action. */
function AtRiskPanel({ atRisk, slug }: { atRisk: AtRiskSummary; slug: string }) {
  return (
    <div className="mb-4 rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div className="flex items-center gap-2">
          <TrendingDown className="h-4 w-4 shrink-0 text-warning" aria-hidden />
          <p className="text-sm font-medium text-text">Going cold</p>
        </div>
        <span className="text-xs tabular-nums text-subtle">
          {atRisk.count} at risk
        </span>
      </div>
      <ul className="space-y-2">
        {atRisk.top.map((c) => (
          <li
            key={c.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-elevated px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-text">{c.displayName || c.email || 'Contact'}</p>
              {c.factors.length > 0 && (
                <p className="truncate text-xs text-muted">
                  {c.factors.map((f) => f.label).join(' · ')}
                </p>
              )}
            </div>
            <AtRiskWinBackButton slug={slug} contactId={c.id} />
          </li>
        ))}
      </ul>
      {atRisk.count > atRisk.top.length && (
        <p className="mt-2 text-xs text-subtle">
          Showing the {atRisk.top.length} most at risk of {atRisk.count}.
        </p>
      )}
    </div>
  )
}

export async function CrmFunnelPanel({ spaceId, slug }: { spaceId: string; slug: string }) {
  const funnel = await getSpaceCrmFunnel(spaceId)

  if (funnel.totalDeals === 0) {
    return (
      <section>
        <SectionHeader title="Funnel" />
        {/* Even with no deals to chart, a Space may have contacts going cold worth winning back. */}
        {funnel.atRisk.count > 0 && <AtRiskPanel atRisk={funnel.atRisk} slug={slug} />}
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

      {/* Contact-consent split: who you can actually reach. The reach the StatCard above headlines is
          `subscribed`; this band shows the whole list broken into the three consent states the funnel
          read already computes, so an owner sees at a glance how many are mailable (subscribed), how
          many are added-but-not-yet-opted-in (the gap they can invite), and how many have opted out.
          Hidden when the Space has no contacts, so an empty CRM never shows an empty bar. */}
      {funnel.reach.total > 0 && (
        <ContactConsentBar reach={funnel.reach} />
      )}

      {/* At-risk / churn (ADR-560): the contacts going cold + a manual win-back. Only shown when at
          least one contact is flagged, so a healthy CRM never shows an alarm. */}
      {funnel.atRisk.count > 0 && (
        <AtRiskPanel atRisk={funnel.atRisk} slug={slug} />
      )}

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
