import { MarketingEmailOverview } from '@/lib/email-studio/analytics'

// MARKETING QUICK STATS — the compact pipeline-at-a-glance box that sits in the Marketing header's right
// slot (~1/3 width beside the title + description). Six tiny stats in a white card: the campaign pipeline
// counts plus one overall-performance number (total emails sent). Presentational, server-friendly.

export function MarketingQuickStats({
  counts,
  overview,
}: {
  counts: { campaigns: number; funnels: number; live: number; scheduled: number; drafts: number }
  overview: MarketingEmailOverview
}) {
  const stats: { label: string; value: number }[] = [
    { label: 'Campaigns', value: counts.campaigns },
    { label: 'Funnels', value: counts.funnels },
    { label: 'Live', value: counts.live },
    { label: 'Scheduled', value: counts.scheduled },
    { label: 'Drafts', value: counts.drafts },
    { label: 'Emails sent', value: overview.sent },
  ]
  return (
    <div className="w-full rounded-2xl border border-border bg-surface p-3.5 shadow-sm sm:w-80">
      <div className="grid grid-cols-3 gap-x-3 gap-y-3">
        {stats.map((s) => (
          <div key={s.label} className="min-w-0">
            <p className="text-base font-extrabold leading-none tabular-nums text-text">
              {s.value.toLocaleString()}
            </p>
            <p className="mt-0.5 truncate text-2xs font-medium text-muted">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
