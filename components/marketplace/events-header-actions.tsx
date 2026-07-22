import Link from 'next/link'
import { EventCompose } from '@/app/(main)/events/event-compose'
import { CrewGateButton } from '@/components/crew/upgrade-lightbox'
import { HERO_PRIMARY_BTN, HERO_SECONDARY_BTN } from './hero-buttons'

// The member action cluster for the unified Events header, rendered IDENTICALLY on both /events and
// /marketplace/events so the two surfaces share one header. New Event (the guided composer, wrapped in
// CrewGateButton so non-Crew get the upgrade popup) shows to any signed-in member; Manage + My drafts
// appear only once the member has added an event (the owner rule). Gating is unchanged from the old
// /events home; it just lives in one place now. No em dashes.
export function EventsHeaderActions({
  myProfileId,
  isCrew,
  userHasEvents,
}: {
  myProfileId: string | null
  isCrew: boolean
  userHasEvents: boolean
}) {
  if (!myProfileId) return null
  return (
    <>
      <CrewGateButton
        isCrew={isCrew}
        label="New Event"
        reason="create-event"
        buttonClassName={HERO_PRIMARY_BTN}
      >
        <EventCompose />
      </CrewGateButton>
      {/* The master Frequency calendar (Events EC3) — every upcoming public event on one grid + a
          subscribable feed. Shown to any signed-in member beside New Event. */}
      <Link href="/events/calendar" className={HERO_SECONDARY_BTN}>
        Calendar
      </Link>
      {userHasEvents && (
        <>
          <Link href="/admin/events" className={HERO_SECONDARY_BTN}>
            Manage
          </Link>
          <Link href="/events/drafts" className={HERO_SECONDARY_BTN}>
            My drafts
          </Link>
        </>
      )}
    </>
  )
}
