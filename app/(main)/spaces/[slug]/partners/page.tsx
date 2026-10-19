import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { spaceProfileMetadata } from '@/lib/spaces/profile-metadata'
import { IndexTemplate } from '@/components/templates'
import { resolveIndexHero } from '@/lib/layout/index-hero'
import { EntityCard } from '@/components/cards/entity-card'
import { BrandAnchor } from '@/components/spaces/brand-anchor'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { EventCalendar } from '@/components/events/event-calendar'
import { COLLECTIVE_PARTNER_CAP, spacePlanTab } from '@/lib/collective/partners'
import { loadPartnersCalendarWindow, loadPartnersView } from '@/lib/collective/partners-store'
import { monthGridWindow } from '@/lib/calendar/month-window'
import { loadPartnersMonth } from './actions'
import { PartnersManager } from './partners-manager'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  return spaceProfileMetadata(slug, { segment: 'partners', label: 'Partners', describe: name => `The Spaces working together with ${name}.` })
}

const listedCount = (n: number) => n === 0 ? 'Nothing shared yet' : n === 1 ? '1 thing shared' : `${n} things shared`

/** The Collective Partners tab (SCAN-982): the partner directory, what partners cross-list, and the
 *  shared calendar of it. No member list across partners, no chapter tree, no control of a partner. */
export default async function CollectivePartnersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const caller = await getCallerProfile()
  const hub = await getVisibleSpaceBySlug(slug, caller?.id ?? null)
  if (!hub || spacePlanTab(hub) !== 'partners') notFound()
  // SCAN-1000: the partners store throws when its table cannot be read (a migration not yet in production,
  // an outage). The tab shows on every Collective, so it says so plainly instead of failing the page.
  const view = await loadPartnersView(hub.id).catch((error: unknown) => {
    console.error('[partners] the partners view could not be read', error)
    return 'unavailable' as const
  })
  if (!view) notFound()
  const now = new Date()
  const year = now.getUTCFullYear(), month1 = now.getUTCMonth() + 1
  const window = monthGridWindow(year, month1)
  if (view === 'unavailable') {
    const hero = await resolveIndexHero(`/spaces/${hub.slug}/partners`)
    return (
      <IndexTemplate {...hero} title={`${hub.name} partners`} description="Spaces run by other people, working together. Each one keeps its own members and settings." adminBar={false}>
        <EmptyState title="Partners are not available yet" description="Check back soon. Nothing about this Space has changed." />
      </IndexTemplate>
    )
  }
  const [events, hero] = await Promise.all([
    loadPartnersCalendarWindow(view, window.fromDay, window.toDay).catch((error: unknown) => {
      console.error('[partners] the shared calendar could not be read', error)
      return []
    }),
    resolveIndexHero(`/spaces/${hub.slug}/partners`),
  ])
  const isOwner = !!caller && caller.id === hub.ownerProfileId
  return (
    <IndexTemplate {...hero} title={`${view.hubName} partners`} description="Spaces run by other people, working together. Each one keeps its own members and settings." adminBar={false}>
      <div className="space-y-10">
        <section aria-labelledby="partners-directory">
          <SectionHeader id="partners-directory" title="Partners" count={view.partners.length} />
          {view.partners.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{view.partners.map(partner => (
            <EntityCard key={partner.id} href={`/spaces/${partner.slug}`} title={partner.name} context={listedCount(partner.listings.length)}
              anchor={<BrandAnchor name={partner.name} logoUrl={partner.logoUrl} size="card" />} />
          ))}</div> : <EmptyState title="No partners yet" description={isOwner ? `Invite up to ${COLLECTIVE_PARTNER_CAP} Spaces run by other people. They show up here once they accept.` : 'Partner Spaces show up here once they join.'} />}
        </section>
        {isOwner ? <section aria-labelledby="partners-manage">
          <SectionHeader id="partners-manage" title="Invites" count={view.pending.length} />
          <PartnersManager hubId={view.hubId} slotsLeft={view.slotsLeft}
            pending={view.pending.map(p => ({ id: p.partnershipId, name: p.name, slug: p.slug }))}
            partners={view.partners.map(p => ({ id: p.partnershipId, name: p.name, slug: p.slug }))} />
        </section> : null}
        <section aria-labelledby="partners-shared">
          <SectionHeader id="partners-shared" title="Shared across partners" count={view.listings.length} />
          {view.listings.length ? <div className="grid gap-4 sm:grid-cols-2">{view.listings.map(listing => (
            <EntityCard key={`${listing.kind}:${listing.id}:${listing.targetSpaceId}`} href={`/${listing.kind === 'journey' ? 'journeys' : 'circles'}/${listing.slug}`}
              title={listing.label} context={listing.kind === 'journey' ? 'Journey' : 'Circle'}
              description={`From ${view.names[listing.sourceSpaceId] ?? 'a partner'}, listed with ${view.names[listing.targetSpaceId] ?? 'a partner'}`} />
          ))}</div> : <p className="text-body-sm text-muted">When a partner lists a Circle or Journey with this Collective, it shows up here.</p>}
        </section>
        <section aria-labelledby="partners-calendar">
          <SectionHeader id="partners-calendar" title="Shared calendar" />
          <EventCalendar events={events} initialYear={year} initialMonth1={month1} audience="member" loadMonth={loadPartnersMonth.bind(null, slug)} />
        </section>
      </div>
    </IndexTemplate>
  )
}
