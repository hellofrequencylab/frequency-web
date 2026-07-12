// Email Studio — Phase 6: the PER-CAMPAIGN analytics panel. A standalone server component the
// workspace coordinator slots into a campaign view by campaign id. It reads the attributed metrics
// (lib/email-studio/analytics) and renders a compact StatCard row — Delivered / Open / Click /
// Bounce / Unsub — with the guarded rates, plus the Apple MPP caveat.
//
// Fail-soft: a campaign that has not sent shows a calm empty state instead of a wall of zeros.
// Semantic tokens only (no hardcoded hex); copy follows CONTENT-VOICE (plain, no em/en dashes).

import { CheckCircle2, MailOpen, MousePointerClick, AlertTriangle, UserMinus } from 'lucide-react'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { getCampaignMetrics, getCampaignTimeline } from '@/lib/email-studio/analytics'

/** Render a fraction in [0, 1] as a whole-number percent string. */
function pct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`
}

function count(n: number): string {
  return n.toLocaleString('en-US')
}

export async function CampaignAnalyticsPanel({ campaignId }: { campaignId: string }) {
  const [metrics, timeline] = await Promise.all([
    getCampaignMetrics(campaignId),
    getCampaignTimeline(campaignId),
  ])

  if (!metrics.hasSent) {
    return (
      <EmptyState
        variant="first-use"
        icon={MailOpen}
        title="No results yet"
        description="Analytics appear here once this campaign sends. Opens, clicks, bounces, and unsubscribes are tracked automatically."
      />
    )
  }

  // Sparklines need at least two points to read as a trend; below that, skip them.
  const opens = timeline.opens.length > 1 ? timeline.opens : undefined
  const clicks = timeline.clicks.length > 1 ? timeline.clicks : undefined

  return (
    <section aria-label="Campaign performance" className="space-y-3">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label="Delivered"
          value={count(metrics.delivered)}
          icon={CheckCircle2}
          detail={`of ${count(metrics.sent)} sent`}
        />
        <StatCard
          label="Open rate"
          value={pct(metrics.openRate)}
          icon={MailOpen}
          detail={`${count(metrics.opened)} opened`}
          sparkline={opens}
        />
        <StatCard
          label="Click rate"
          value={pct(metrics.clickRate)}
          icon={MousePointerClick}
          detail={`${count(metrics.clicked)} clicked`}
          sparkline={clicks}
        />
        <StatCard
          label="Bounce rate"
          value={pct(metrics.bounceRate)}
          icon={AlertTriangle}
          detail={`${count(metrics.bounced)} bounced`}
        />
        <StatCard
          label="Unsubscribed"
          value={count(metrics.unsubscribed)}
          icon={UserMinus}
          detail={`${count(metrics.complained)} complaints`}
        />
      </div>

      <p className="text-xs text-subtle">
        Open rates are approximate. Apple Mail Privacy Protection loads images for its users, which
        fires an open even when no one read the mail, so weight clicks as the real signal.
      </p>
    </section>
  )
}

export default CampaignAnalyticsPanel
