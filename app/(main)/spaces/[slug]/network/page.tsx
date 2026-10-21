import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { spaceProfileMetadata } from '@/lib/spaces/profile-metadata'
import { IndexTemplate } from '@/components/templates'
import { resolveIndexHero } from '@/lib/layout/index-hero'
import { ChapterCard, NetworkEventCard } from '@/components/network/network-cards'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { buttonClasses } from '@/components/ui/button'
import { EventCalendar } from '@/components/events/event-calendar'
import { collectiveNetworkOpen, liveNetworkUpcoming } from '@/lib/collective/network'
import { listPublicCollectiveMembers, loadCollectiveNetworkWindow, loadChapterCardExtras, viewerGoingEventIds } from '@/lib/collective/network-store'
import { monthGridWindow } from '@/lib/calendar/month-window'
import { dayInZone } from '@/lib/time/zone'
import { isNetworkPlan } from '@/lib/collective/member-spaces'
import { networkToolsAccess } from '@/lib/collective/network-tools-store'
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
  const [members, events, hero] = await Promise.all([
    listPublicCollectiveMembers(parent), loadCollectiveNetworkWindow(parent, name, window.fromDay, window.toDay),
    resolveIndexHero(`/spaces/${parent.slug}/network`),
  ])
  const today = dayInZone(now, parent.timeZone)
  const upcoming = liveNetworkUpcoming(events, today)
  const [extras, going] = await Promise.all([loadChapterCardExtras(members.map(m => m.id)), viewerGoingEventIds(caller?.id ?? null, upcoming.map(e => e.eventId))])
  const liveEvents = liveNetworkUpcoming(events, today, Infinity)
  const sourcesOf = (event: { sourceLabel?: string | null }) => (event.sourceLabel ?? '').split(' · ').filter(Boolean)
  // Owner management and the public projection are separate doors: never add private members to this page.
  // A Network's owner and central admins run its Chapters area (SCAN-983); a Collective keeps its billing door.
  const chapters = isNetworkPlan(parent.plan) && caller?.id ? await networkToolsAccess(parent.id, caller.id) : null
  // A Network's member Spaces are its chapters (NAMING: a Network is one owner running chapters); a
  // Collective's are member Spaces. The tab keeps its name, the words on the page follow the plan.
  const noun = isNetworkPlan(parent.plan) ? { plural: 'Chapters', description: 'Chapters and their events, together.', empty: 'Chapters appear here when they are ready to welcome visitors.' }
    : { plural: 'Member Spaces', description: 'Member Spaces and their events, together.', empty: 'Member Spaces appear here when they are ready to welcome visitors.' }
  const management = chapters
    ? (
      <>
        <Link href={`/spaces/${slug}/settings/chapters`} className={buttonClasses('secondary', 'sm')}>Manage chapters</Link>
        {caller?.id === parent.ownerProfileId && <Link href={`/spaces/${slug}/settings/websites`} className={buttonClasses('secondary', 'sm')}>Client websites</Link>}
      </>
    )
    : caller?.id === parent.ownerProfileId
      ? <Link href={`/spaces/${slug}/settings/billing`} className={buttonClasses('secondary', 'sm')}>Manage member Spaces</Link> : undefined
  return (
    <IndexTemplate {...hero} eyebrow="Network" title={`${name} network`} description={`${noun.description} ${members.length} ${noun.plural.toLowerCase()}, ${upcoming.length ? `${upcoming.length} events up next.` : 'no events up next.'}`} action={management} adminBar={false}>
      <div className="space-y-10">
        <section aria-labelledby="network-members">
          <SectionHeader id="network-members" title={noun.plural} count={members.length} />
          <p className="-mt-2 mb-4 text-body-sm text-muted">Open one to see its page, its people and its events.</p>
          {members.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{members.map(member => {
            const mine = liveEvents.filter(event => sourcesOf(event).includes(member.name))
            const extra = extras.get(member.id)
            return <ChapterCard key={member.id} href={`/spaces/${member.slug}`} name={member.name} parentName={name} logoUrl={member.logoUrl}
              coverUrl={extra?.coverUrl ?? null} city={extra?.city ?? null} tagline={extra?.tagline ?? null} nextEvent={mine[0] ?? null} eventCount={mine.length} />
          })}</div> : <EmptyState title="The network is taking shape" description={noun.empty} />}
        </section>
        <section aria-labelledby="network-upcoming">
          <SectionHeader id="network-upcoming" title="Up next" action={<Link href="#network-calendar" className={buttonClasses('secondary', 'sm')}>Full calendar</Link>} />
          <p className="-mt-2 mb-4 text-body-sm text-muted">The next events across every {isNetworkPlan(parent.plan) ? 'chapter' : 'member Space'}.</p>
          {upcoming.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{upcoming.map(event => (
            <NetworkEventCard key={event.slug} event={event} hostChapters={sourcesOf(event).filter(source => source !== name)} going={!!event.eventId && going.has(event.eventId)} />
          ))}</div> : <p className="text-body-sm text-muted">No upcoming events this month. Browse the shared calendar for another date.</p>}
        </section>
        <section aria-labelledby="network-calendar">
          <SectionHeader id="network-calendar" title="Shared calendar" />
          <p className="-mt-2 mb-4 text-body-sm text-muted">Everything on one month grid. Tap a day to open its events.</p>
          <div data-network-cal><EventCalendar events={events} initialYear={year} initialMonth1={month1} audience="member" loadMonth={loadCollectiveNetworkMonth.bind(null, slug)} /></div>
        </section>
      </div>
    </IndexTemplate>
  )
}
