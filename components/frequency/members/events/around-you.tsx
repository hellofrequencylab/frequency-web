import Link from 'next/link'
import { Suspense } from 'react'
import type { EventsIndexData } from '@/app/(main)/events/index-data'
import { scoreEventsForViewer } from '@/lib/events/matching'
import { eventBlurb } from '@/lib/ai/event-blurb'
import { TICKETING_ENABLED } from '@/lib/events/ticketing'
import { SHORT_MONTH_LABELS } from '@/lib/events/calendar-grid'
import { FqIcon } from '@/components/frequency/icon'
import { GoButton } from '@/components/frequency/members/go-button'
import { HubLinks } from '@/components/frequency/members/shared/hub-links'
import { hubLinks } from '@/components/frequency/members/shell/nav'
import { planAroundYou, toAyItem, type AyItem, type AyMapItem, type AyReason, type AyTag } from './around-you-items'
import { AyCountdown, AyPulse, AyTicker } from './around-you-live'
import { FqMapTile } from './events-map-lightbox'

// AROUND YOU (SCAN-975, owner 2026-10-16 on /events: "Make a feature around you area out of the red section
// ... feature either the latest upcoming, or what they've RSVPd to ... a dynamic ticker list, a few event
// cards, a map"). It replaces the For you lane and the Your week panel with one smart feature:
//
//   ┌ Around you ─────────────────────────────── pulse strip (live, starting soon, filling up) ┐
//   │ SPOTLIGHT: your next event, or your best pick      │ MAP TILE (opens the lightbox)      │
//   │ three cards: the balance of yours, picks, filling  │ TICKER: Yours · For you · Week · Near │
//   └─────────────────────────────────────────────────────────────────────────────────────────┘
//
// The plan (around-you-items.ts planAroundYou) decides what leads; this file only draws it. The one slow read
// is the viewer's ranked picks (embedding scores) and the spotlight's one plain why line, so the body
// mounts this behind <Suspense> with a frame of the same shape, and both fail safe: no scores, no picks,
// and the feature still leads with their own next event or what is coming up.

const REASON: Record<AyReason, string> = {
  next: 'Up next for you',
  pick: 'Picked for you',
  featured: 'Featured near you',
  soon: 'Coming up next',
}

function needsTicket(i: AyItem, joinMode: string | null | undefined, priceCents: number | null): boolean {
  if (!TICKETING_ENABLED || joinMode === 'rsvp') return false
  return joinMode === 'tickets' || (priceCents ?? 0) > 0 || (!!i.price && i.price !== 'Free')
}

/** The headline under "Around you": what this member's week looks like, in one plain line. */
function summaryLine(plan: ReturnType<typeof planAroundYou>, signedIn: boolean, homeLabel: string | null): string {
  const where = homeLabel ? ` around ${homeLabel}` : ' near you'
  if (!signedIn) return `What is coming up${where}. Sign in and this fills with your own week and picks.`
  const parts: string[] = []
  if (plan.goingWeek > 0) parts.push(`You are going to ${plan.goingWeek} ${plan.goingWeek === 1 ? 'thing' : 'things'} this week`)
  else if (plan.goingTotal > 0) parts.push(`You have ${plan.goingTotal} coming up`)
  if (plan.picks > 0) parts.push(`${plan.picks} more picked for you${where}`)
  if (parts.length === 0) return `Nothing on your calendar yet. Here is what is coming up${where}.`
  return `${parts.join(', and ')}.`
}

export async function FqAroundYou({ data, mapItems }: { data: EventsIndexData; mapItems: AyMapItem[] }) {
  const { myProfileId, sortedEvents, nowDate, homeLabel, hasHome } = data
  const rows = sortedEvents.filter((e) => !e.is_cancelled)
  const byRow = new Map(rows.map((e) => [e.id, e]))
  const items = rows.map((e) => toAyItem(e, data))

  let pickIds: string[] = []
  if (myProfileId) {
    try {
      const ranked = await scoreEventsForViewer(myProfileId, [...byRow.keys()])
      pickIds = ranked.map((r) => r.eventId)
    } catch {
      pickIds = []
    }
  }
  const plan = planAroundYou(items, pickIds, { now: nowDate.getTime(), hasHome })
  if (!plan.spotlight) return null

  const spot = plan.spotlight.item
  const spotRow = byRow.get(spot.id)
  const why =
    myProfileId && plan.spotlight.reason === 'pick' ? await eventBlurb(myProfileId, spot.id).catch(() => null) : null

  return (
    <section className="ay" aria-labelledby="ay-h">
      <div className="ay-h">
        <div className="stack fqm-gap-sm">
          <h2 id="ay-h" className="h2">
            <span className="orb ev-orb" aria-hidden="true" />
            Around you
          </h2>
          <span className="t2">{summaryLine(plan, !!myProfileId, homeLabel)}</span>
        </div>
      </div>

      <AyPulse items={plan.pulse} />

      <div className="ay-grid">
        <div className="ay-main">
          <article className={`ay-spot ${plan.spotlight.reason}`}>
            <Link
              href={`/events/${spot.slug}`}
              className="ay-spot-cover"
              tabIndex={-1}
              aria-hidden="true"
              style={spot.cover ? { backgroundImage: `url('${spot.cover}')`, backgroundPosition: spot.coverFocus ?? undefined } : undefined}
            >
              {spotRow && (
                <span className="ev-date">
                  <b>{Number(spotRow.starts_at.slice(8, 10))}</b>
                  <i>{SHORT_MONTH_LABELS[Number(spotRow.starts_at.slice(5, 7)) - 1]}</i>
                </span>
              )}
            </Link>
            <div className="ay-spot-b">
              <span className="ay-tag">
                {plan.spotlight.reason === 'next' ? <FqIcon name="check" /> : <FqIcon name="zap" />}
                {REASON[plan.spotlight.reason]}
              </span>
              <Link href={`/events/${spot.slug}`} className="ay-spot-t">
                {spot.title}
              </Link>
              <AyCountdown item={spot} />
              {why && <span className="ev-why">{why}</span>}
              <div className="ev-stats">
                <span>
                  <FqIcon name="contacts" />
                  {spot.goingCount > 0 ? `${spot.goingCount} going` : 'Be the first'}
                  {spot.spotsLeft != null && ` · ${spot.spotsLeft === 0 ? 'Waitlist' : `${spot.spotsLeft} left`}`}
                </span>
                {spot.price && (
                  <span className="ev-price">
                    <FqIcon name="ticket" />
                    {spot.price}
                  </span>
                )}
                {spot.place && (
                  <span>
                    <FqIcon name="pin" />
                    {spot.place}
                  </span>
                )}
              </div>
              <div className="ay-spot-acts">
                {spotRow && needsTicket(spot, spotRow.join_mode, spotRow.price_cents) ? (
                  <Link className="btn pa sm" href={`/events/${spot.slug}`}>
                    <FqIcon name="ticket" />
                    {spot.price ? `Tickets · ${spot.price}` : 'Tickets'}
                  </Link>
                ) : myProfileId ? (
                  <GoButton eventId={spot.id} slug={spot.slug} going={spot.going} />
                ) : (
                  <Link className="btn pa sm" href={`/events/${spot.slug}`}>
                    RSVP
                  </Link>
                )}
                <Link className="btn sm" href={`/events/${spot.slug}`}>
                  {spot.going ? 'Your details' : 'See details'}
                </Link>
              </div>
            </div>
          </article>

          {plan.supporting.length > 0 && (
            <ul className="ay-trio" aria-label="More around you">
              {plan.supporting.map(({ item, tag }) => (
                <li key={item.id}>
                  <AyCard item={item} tag={tag} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="ay-side">
          <FqMapTile items={mapItems} homeLabel={homeLabel} />
          {plan.defaultTab && <AyTicker tabs={plan.tabs} defaultTab={plan.defaultTab} />}
          <Suspense fallback={null}>
            <HubLinks title="Events" links={(v) => hubLinks('/events', v)} />
          </Suspense>
        </div>
      </div>
    </section>
  )
}

function AyCard({ item, tag }: { item: AyItem; tag: AyTag }) {
  return (
    <Link href={`/events/${item.slug}`} className="ay-card">
      <span
        className="ay-card-cover"
        style={item.cover ? { backgroundImage: `url('${item.cover}')`, backgroundPosition: item.coverFocus ?? undefined } : undefined}
      >
        <span className={tag === 'Going' ? 'ev-badge feat' : tag === 'Filling up' ? 'ev-badge warm' : 'ev-badge'}>{tag}</span>
      </span>
      <span className="ay-card-b">
        <span className="ev-when">{item.when}</span>
        <span className="ay-card-t">{item.title}</span>
        <span className="t2">
          {[item.goingCount > 0 ? `${item.goingCount} going` : null, item.place].filter(Boolean).join(' · ')}
        </span>
      </span>
    </Link>
  )
}

/** The wait: the feature's own frame, so nothing jumps when the picks land. */
export function FqAroundYouFrame() {
  return (
    <section className="ay" aria-busy="true" aria-label="Loading what is around you">
      <div className="ay-h">
        <span className="ev-skel-bar tall w30" />
      </div>
      <div className="ay-grid">
        <div className="ay-main">
          <div className="ay-spot">
            <span className="ay-spot-cover" />
            <div className="ay-spot-b">
              <span className="ev-skel-bar w30" />
              <span className="ev-skel-bar tall w60" />
              <span className="ev-skel-bar w45" />
            </div>
          </div>
        </div>
        <div className="ay-side">
          <span className="evm-tile" />
        </div>
      </div>
    </section>
  )
}
