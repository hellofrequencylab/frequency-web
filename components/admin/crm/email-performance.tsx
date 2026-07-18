import type { MarketingEmailOverview } from '@/lib/email-studio/analytics'

// EMAIL PERFORMANCE — the account-wide response strip for the CRM Marketing tab. Rolls the whole
// email_events ledger (Resend delivery + engagement webhooks) into a row of SMALL, INLINE stats, each in
// its own white card: delivered, opened, clicked, bounced, complained, unsubscribed. Clicks are the
// trustworthy engagement signal (Apple Mail privacy inflates opens). Server component, no hooks. Semantic
// tokens only, no hex. No em dashes (voice canon).

const pct = (n: number): string => `${Math.round(n * 100)}%`

function PerfStat({ value, label, hint }: { value: React.ReactNode; label: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 shadow-sm">
      <div className="flex items-baseline gap-1.5">
        <span className="text-base font-extrabold tabular-nums text-text">{value}</span>
        <span className="text-xs font-medium text-muted">{label}</span>
      </div>
      {hint && <p className="mt-0.5 text-2xs text-subtle">{hint}</p>}
    </div>
  )
}

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
    <div className="flex flex-wrap gap-2">
      <PerfStat value={overview.delivered.toLocaleString()} label="Delivered" hint={`${pct(overview.deliveryRate)} of ${overview.sent.toLocaleString()} sent`} />
      <PerfStat value={pct(overview.openRate)} label="Open rate" hint={`${overview.opened.toLocaleString()} opens`} />
      <PerfStat value={pct(overview.clickRate)} label="Click rate" hint={`${overview.clicked.toLocaleString()} clicks`} />
      <PerfStat value={pct(overview.bounceRate)} label="Bounce rate" hint={`${overview.bounced.toLocaleString()} bounced`} />
      <PerfStat value={overview.complained.toLocaleString()} label="Complaints" hint={pct(overview.complaintRate)} />
      <PerfStat value={overview.unsubscribed.toLocaleString()} label="Unsubscribes" hint={pct(overview.unsubscribeRate)} />
    </div>
  )
}
