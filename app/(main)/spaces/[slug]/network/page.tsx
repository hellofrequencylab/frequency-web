import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { spaceProfileMetadata } from '@/lib/spaces/profile-metadata'
import { IndexTemplate } from '@/components/templates'
import { EntityCard } from '@/components/cards/entity-card'
import { BrandAnchor } from '@/components/spaces/brand-anchor'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { buttonClasses } from '@/components/ui/button'
import { EventCalendar } from '@/components/events/event-calendar'
import { collectiveNetworkOpen, liveNetworkUpcoming } from '@/lib/collective/network'
import { listPublicCollectiveMembers, loadCollectiveNetworkWindow } from '@/lib/collective/network-store'
import { monthGridWindow } from '@/lib/calendar/month-window'
import { dayInZone } from '@/lib/time/zone'
import { loadCollectiveNetworkMonth } from './actions'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  return spaceProfileMetadata(slug, { segment: 'network', label: 'Network', describe: name => `Member Spaces and events across ${name}, together.` })
}
export default async function CollectiveNetworkPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const caller = await getCallerProfile()
  const parent = await getVisibleSpaceBySlug(slug, caller?.id ?? null)
  if (!parent || !collectiveNetworkOpen(parent)) notFound()
  const name = parent.brandName?.trim() || parent.name
  const now = new Date()
  const year = now.getUTCFullYear(), month1 = now.getUTCMonth() + 1
  const window = monthGridWindow(year, month1)
  const [members, events] = await Promise.all([
    listPublicCollectiveMembers(parent), loadCollectiveNetworkWindow(parent, name, window.fromDay, window.toDay),
  ])
  const upcoming = liveNetworkUpcoming(events, dayInZone(now, parent.timeZone))
  // Owner management and the public projection are separate doors: never add private members to this page.
  const management = caller?.id === parent.ownerProfileId
    ? <Link href={`/spaces/${slug}/settings/billing`} className={buttonClasses('secondary', 'sm')}>Manage member Spaces</Link> : undefined
  return (
    <IndexTemplate title={`${name} network`} description="Member Spaces and their events, together." action={management} adminBar={false}>
      <div className="space-y-10">
        <section aria-labelledby="network-members">
          <SectionHeader id="network-members" title="Member Spaces" count={members.length} />
          {members.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{members.map(member => (
            <EntityCard key={member.id} href={`/spaces/${member.slug}`} title={member.name}
              anchor={<BrandAnchor name={member.name} logoUrl={member.logoUrl} size="card" />} />
          ))}</div> : <EmptyState title="The network is taking shape" description="Member Spaces appear here when they are ready to welcome visitors." />}
        </section>
        <section aria-labelledby="network-upcoming">
          <SectionHeader id="network-upcoming" title="Up next" />
          {upcoming.length ? <div className="grid gap-4 sm:grid-cols-2">{upcoming.map(event => (
            <EntityCard key={event.slug} href={`/events/${event.slug}`} title={event.title} context={event.whenLabel} description={event.sourceLabel} />
          ))}</div> : <p className="text-body-sm text-muted">No upcoming events this month. Browse the shared calendar for another date.</p>}
        </section>
        <section aria-labelledby="network-calendar">
          <SectionHeader id="network-calendar" title="Shared calendar" />
          <EventCalendar events={events} initialYear={year} initialMonth1={month1} audience="member" loadMonth={loadCollectiveNetworkMonth.bind(null, slug)} />
        </section>
      </div>
    </IndexTemplate>
  )
}
