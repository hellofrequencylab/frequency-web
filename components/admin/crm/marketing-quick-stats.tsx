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
  // No background card (owner directive): the stats read as a plain cluster in the header. A left inset on
  // sm+ opens breathing room between the title/description block and the stats.
  return (
    <div className="w-full sm:w-80 sm:border-l sm:border-border sm:pl-8">
      <div className="grid grid-cols-3 gap-x-4 gap-y-3.5">
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
