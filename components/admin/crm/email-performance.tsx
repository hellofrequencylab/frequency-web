import { Send, Eye, MousePointerClick, TrendingDown, TriangleAlert, UserMinus, MailCheck } from 'lucide-react'
import { StatCard } from '@/components/ui/stat-card'
import type { MarketingEmailOverview } from '@/lib/email-studio/analytics'

// EMAIL PERFORMANCE — the account-wide response dashboard for the CRM Marketing tab. Rolls the whole
// email_events ledger (delivery + engagement webhooks from Resend) into a dense strip of half-height
// stat tiles: what got delivered, opened, clicked, bounced, complained, and unsubscribed. Clicks are
// the trustworthy engagement signal (Apple Mail privacy inflates opens). Server component, no hooks.
// Semantic tokens only, no hex. No em dashes (voice canon).

const pct = (n: number): string => `${Math.round(n * 100)}%`

export function EmailPerformance({ overview }: { overview: MarketingEmailOverview }) {
  const nothingYet = overview.sent === 0 && overview.delivered === 0
  if (nothingYet) {
    return (
      <p className="rounded-2xl border border-dashed border-border bg-surface px-4 py-6 text-center text-sm text-muted">
        No email has gone out yet. Open, click, bounce, and complaint stats land here the moment your first send delivers.
      </p>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7">
      <StatCard
        size="xs"
        icon={Send}
        label="Delivered"
        value={overview.delivered.toLocaleString()}
        detail={`${pct(overview.deliveryRate)} of ${overview.sent.toLocaleString()} sent`}
      />
      <StatCard
        size="xs"
        icon={Eye}
        label="Open rate"
        value={pct(overview.openRate)}
        detail={`${overview.opened.toLocaleString()} opens`}
      />
      <StatCard
        size="xs"
        icon={MousePointerClick}
        label="Click rate"
        value={pct(overview.clickRate)}
        detail={`${overview.clicked.toLocaleString()} clicks`}
      />
      <StatCard
        size="xs"
        icon={TrendingDown}
        label="Bounce rate"
        value={pct(overview.bounceRate)}
        detail={`${overview.bounced.toLocaleString()} bounced`}
      />
      <StatCard
        size="xs"
        icon={TriangleAlert}
        label="Complaints"
        value={overview.complained.toLocaleString()}
        detail={pct(overview.complaintRate)}
      />
      <StatCard
        size="xs"
        icon={UserMinus}
        label="Unsubscribes"
        value={overview.unsubscribed.toLocaleString()}
        detail={pct(overview.unsubscribeRate)}
      />
      <StatCard
        size="xs"
        icon={MailCheck}
        label="Campaigns sent"
        value={overview.campaignsSent.toLocaleString()}
      />
    </div>
  )
}
