import Link from 'next/link'
import { EventCompose } from './event-compose'
import { CrewGateButton } from '@/components/crew/upgrade-lightbox'
import { EventsSurface } from '@/components/marketplace/events-surface'
import { pageContentMetadata } from '@/lib/page-content'
import { getEventsIndexData, CONTENT_FALLBACK } from './index-data'

// EVENTS — the member's own events home. It renders the SAME Marketplace events surface the
// commerce Events tab uses (components/marketplace/events-surface.tsx), on the SAME data + card
// (getEventsIndexData + EventCard), at the SAME /events URL (kept, with its profile link). What's
// different from the /marketplace/events tab: this home carries the member's own action cluster in
// the hero (Add Event always; Manage + My drafts only once they have added an event). No business
// logic is duplicated. No em or en dashes.

// Operator-set title/description also drive <title> + og/twitter cards (PX.2). Kept on /events so the
// URL keeps its SEO — the surface swap does not touch the page's metadata.
export function generateMetadata() {
  return pageContentMetadata('/events', CONTENT_FALLBACK)
}

// On-ink secondary button (Manage / My drafts) — legible riding the dark hero image, matching the
// site's overlay-hero grammar. The primary Add Event stays bg-primary.
const SECONDARY_ON_INK =
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold text-on-ink transition-colors hover:bg-white/20'

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string
    category?: string
    format?: string
    date?: string
    price?: string
    energy?: string
    spots?: string
    near?: string
    sort?: string
  }>
}) {
  const sp = await searchParams
  const data = await getEventsIndexData(sp)
  const { myProfileId, isCrew, userHasEvents } = data

  // The member action cluster, rendered in the hero on THIS home only (the commerce tab passes none).
  //   • Add Event — the guided composer, wrapped in CrewGateButton so non-Crew get the upgrade popup.
  //     Always shown to a signed-in member.
  //   • Manage / My drafts — only once the member has added an event (owner rule). Manage keeps the old
  //     page's target (/admin/events); My drafts links to /events/drafts.
  const actions = myProfileId ? (
    <>
      <CrewGateButton
        isCrew={isCrew}
        label="New Event"
        reason="create-event"
        buttonClassName="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
      >
        <EventCompose />
      </CrewGateButton>
      {userHasEvents && (
        <>
          <Link href="/admin/events" className={SECONDARY_ON_INK}>
            Manage
          </Link>
          <Link href="/events/drafts" className={SECONDARY_ON_INK}>
            My drafts
          </Link>
        </>
      )}
    </>
  ) : undefined

  return (
    <EventsSurface data={data} basePath="/events" activeCategory={sp.category} actions={actions} />
  )
}
