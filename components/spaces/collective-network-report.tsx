import Link from 'next/link'
import { SectionHeader } from '@/components/ui/section-header'
import { StatCard } from '@/components/ui/stat-card'
import { readCollectiveNetworkReport } from '@/lib/collective/network-report'
const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
export async function CollectiveNetworkReport({ spaceId, callerProfileId }: { spaceId: string; callerProfileId: string }) {
  const report = await readCollectiveNetworkReport(spaceId, callerProfileId)
  if (report.status === 'denied') return null
  return <section aria-labelledby="collective-report" className="mt-8">
    <SectionHeader id="collective-report" title="Your Collective" />
    {report.status === 'unavailable' ? <p className="text-body-sm text-muted">We couldn’t load the complete report. Try again later.</p> : <>
      <p className="mb-4 text-body-sm text-muted">All-time totals across your Collective and its current member Spaces. Each member and Event is counted once. Activity can change while this report loads.</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Spaces" value={report.spaces.length} />
        <StatCard label="Active members" value={report.members} />
        <StatCard label="Events" value={report.events} detail="Owned or hosted, excluding removed and demo Events" />
        <StatCard label="Net revenue" value={money(report.earnings.netCents)} detail="Settled sales, tickets, gifts and split shares" />
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-3 text-body-sm">
        <div><dt className="text-subtle">Gross revenue</dt><dd>{money(report.earnings.grossCents)}</dd></div>
        <div><dt className="text-subtle">Fees</dt><dd>{money(report.earnings.feeCents)}</dd></div>
        <div><dt className="text-subtle">Refunds</dt><dd>{money(report.earnings.refundedCents)}</dd></div>
      </dl>
      <p className="mt-3 text-body-sm text-muted">Revenue is in USD, after refunds. Membership billing is not included.</p>
      <ul className="mt-4 space-y-2 text-body-sm">{report.spaces.map(space => <li key={space.id}><Link href={`/spaces/${space.slug}/settings/reach`} className="text-primary-strong underline underline-offset-4">{space.name}</Link></li>)}</ul>
    </>}
  </section>
}
