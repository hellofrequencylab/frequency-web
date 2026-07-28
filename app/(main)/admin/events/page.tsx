import { Suspense } from 'react'
import { requireAdmin } from '@/lib/admin/guard'
import { isJanitor } from '@/lib/core/roles'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { EventCompose } from '@/app/(main)/events/event-compose'
import { getSeriesDisplayConfig } from '@/lib/events/series-config'
import { getEventsAdminData } from './load-events'
import { EventsAdminList } from './events-admin-list'
import { PostedEventsSection } from './posted-events-section'
import { PosterQualitySection } from './poster-quality-section'
import { SeriesDisplaySection } from './series-display-section'

// /admin/events (Operations > Community): circle events on top, then the Posted
// events oversight area (the Poster Events engine: claim links, host handover,
// removal + clawback) and the Poster quality panel. The slow posted-events reads
// sit behind their own <Suspense> so the page shell renders immediately.
//
// Gates: viewing is community host+ OR community staff (the page gate below).
// The destructive posted-event actions (new claim link, assign host, remove)
// re-verify janitor on the server; `canManage` only decides what chrome renders.
//
// The "Repeating events" section is the operator console for the series fold (ADR-897). It lands
// HERE rather than at a destination of its own: /admin/events is already a registered destination
// (lib/nav/studio.ts, the `events` STUDIO_LEAVES row), so a fourth AdminSection is a content edit
// inside it, not a menu change. Three integers do not earn an operator a new place to find
// (docs/MENU-CONTRACT.md — the catalog is edited to ADD a destination, and none is added here).
// Its numbers are platform-wide, so it renders behind `canManage` and its action re-gates janitor.

function SectionFallback() {
  return <div className="h-32 animate-pulse rounded-2xl bg-surface-elevated/60" aria-hidden />
}

export default async function AdminEventsPage() {
  const { profileId, webRole } = await requireAdmin('host', { staff: 'community' })
  const { upcoming, past } = await getEventsAdminData(profileId)
  const canManage = isJanitor(webRole)
  // One request-cached settings row, read only for the operator who can actually change it, so a
  // community host viewing this page pays nothing for a section they never see.
  const seriesDisplay = canManage ? await getSeriesDisplayConfig() : null

  return (
    <AdminTemplate
      title="Events"
      eyebrow="Community"
      description="Manage events across your circles, plus the events members post from town posters: claim links, handovers, and poster quality."
      actions={<EventCompose />}
      width="default"
    >
      <AdminSection title="Circle events" description="Gatherings across your circles. Cancel or reinstate from here.">
        <EventsAdminList upcoming={upcoming} past={past} />
      </AdminSection>

      <AdminSection
        title="Posted events"
        description="Events members captured from posters around town, and the claim handshake that hands each one to its organizer."
      >
        <Suspense fallback={<SectionFallback />}>
          <PostedEventsSection canManage={canManage} />
        </Suspense>
      </AdminSection>

      <AdminSection
        title="Poster quality"
        description="Bands set the posting reward automatically. Watch pays half, throttled pays nothing. Removing a spam event returns its Zaps."
      >
        <Suspense fallback={<SectionFallback />}>
          <PosterQualitySection />
        </Suspense>
      </AdminSection>

      {canManage && seriesDisplay && (
        <AdminSection
          title="Repeating events"
          description="How many dates a repeating event shows in listings, and how many it offers on its own page. Set cards in listings to 60 to show every date again."
        >
          <SeriesDisplaySection config={seriesDisplay} />
        </AdminSection>
      )}
    </AdminTemplate>
  )
}
