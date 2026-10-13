import Link from 'next/link'
import { Suspense } from 'react'
import '@/app/themes/frequency/members-b.css'
import type { EventRow, EventsIndexData } from '@/app/(main)/events/index-data'
import { CalendarSubscribe } from '@/components/events/calendar-subscribe'
import { FqIcon } from '@/components/frequency/icon'
import { GoButton } from '@/components/frequency/members/go-button'
import { TICKETING_ENABLED } from '@/lib/events/ticketing'
import { HOME_TZ, dayInZone, isEventPast } from '@/lib/time/zone'
import { FqClearLink, FqFacetMenu, FqFindField, hrefWith, type Params } from '@/components/frequency/members/shared/kit-tools'
import { FqEventsMapToggle } from './events-map-toggle'
import { FqEventsForYou, FqPeopleToMeet } from './events-lanes'

// EVENTS, FREQUENCY BODY (templates/members/Events.html, line for line). The shell lane owns the
// kit root, header and rails; this is the page body only: the head, the When tabs, the day-grouped
// list with its Go / Going swap, and the "Your week" side panel. Every row is a real event from
// getEventsIndexData (the same read the DAWN surface renders), every count is a real count.
//
// THE WHEN TABS are links (`?when=`), not client state, so the view stays shareable and the server
// does the filtering. They cut the same upcoming list the DAWN page shows: Now is all of it, Tonight
// is today from 5pm, Tomorrow is tomorrow, This week is the next seven days, in the community's home
// zone (the zone `formatWhen` already reads "Today" in).
//
// THE HYBRID RULE (owner, design pass): the reference draws no search, filters or map, and the
// platform has all of them, so they are kept in the kit's idiom rather than hidden. Under the When
// tabs sits one find-and-filter row (kit-tools.tsx: the find pill, each facet as a chip menu, the
// sort), every control a URL param the shared read already honours; the day list sits inside the
// List / Map switch; For you and People to know stream in behind their own <Suspense>.

type WhenKey = 'now' | 'tonight' | 'tomorrow' | 'week'
const WHEN_TABS: { key: WhenKey; label: string }[] = [
  { key: 'now', label: 'Now' },
  { key: 'tonight', label: 'Tonight' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'week', label: 'This week' },
]

/** How many rows the list draws before it hands off to the calendar. */
const ROW_CAP = 60

export function asWhen(raw: string | undefined): WhenKey {
  return WHEN_TABS.some((t) => t.key === raw) ? (raw as WhenKey) : 'now'
}

const DAY_MS = 24 * 60 * 60 * 1000
/** Whole days from today (home zone) to the event's stored wall-clock day. */
function daysOut(startsAt: string, now: Date): number {
  const eventDay = startsAt.slice(0, 10)
  const today = dayInZone(now, HOME_TZ)
  return Math.round((Date.parse(`${eventDay}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS)
}

function inWhen(e: EventRow, when: WhenKey, now: Date): boolean {
  const d = daysOut(e.starts_at, now)
  if (when === 'tonight') return d === 0 && new Date(e.starts_at).getUTCHours() >= 17
  if (when === 'tomorrow') return d === 1
  if (when === 'week') return d >= 0 && d < 7
  return true
}

// `starts_at` keeps the event's wall clock as UTC parts, so every label formats in UTC.
function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })
}
function shortDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
}
function timeLabel(iso: string): string {
  return new Date(iso)
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })
    .replace(' ', '')
    .toLowerCase()
}
function miles(m: number | null | undefined): string | null {
  if (m == null) return null
  return `${(m / 1609.344).toFixed(1)} mi`
}

/** A ticketed event answers at the checkout on its own page, never with a bare RSVP from a list. */
function needsTicket(e: EventRow, priceLabel: string | null | undefined): boolean {
  if (!TICKETING_ENABLED || e.join_mode === 'rsvp') return false
  return e.join_mode === 'tickets' || (e.price_cents ?? 0) > 0 || (!!priceLabel && priceLabel !== 'Free')
}

export function FqEventsBody({
  data,
  when,
  params,
}: {
  data: EventsIndexData
  when: WhenKey
  /** The page's search params, so every control keeps the others when it changes its own. */
  params: Params
}) {
  const {
    sortedEvents,
    goingEvents,
    coverUrls,
    rsvpCounts,
    myRsvps,
    priceLabels,
    nowDate,
    myProfileId,
    userHasEvents,
    facets,
    sortOptions,
    mapPins,
    showForYou,
    filtering,
    content,
  } = data
  const shownFacets = facets.filter((f) => f.show !== false)
  const anyFilter = filtering || !!params.sort

  const shown = sortedEvents.filter((e) => inWhen(e, when, nowDate)).slice(0, ROW_CAP)
  const days: { label: string; rows: EventRow[] }[] = []
  for (const e of shown) {
    const label = dayLabel(e.starts_at)
    const last = days[days.length - 1]
    if (last && last.label === label) last.rows.push(e)
    else days.push({ label, rows: [e] })
  }

  const myWeek = goingEvents.filter((e) => {
    const d = daysOut(e.starts_at, nowDate)
    return d >= 0 && d < 7
  })

  const meta = [
    `${sortedEvents.length} coming up`,
    params.q ? `matching “${params.q}”` : null,
    myProfileId ? `${goingEvents.length} you're going to` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <>
      <div className="head">
        <div>
          <span className="k">What&apos;s happening</span>
          <h1 className="h1">
            This <span className="serif">week.</span>
          </h1>
          <span className="meta">{meta}</span>
        </div>
        {myProfileId && (
          <div className="row wrap">
            <Link className="btn pa lg" href="/events/new">
              <FqIcon name="event" />
              New Event
            </Link>
            <Link className="btn lg" href="/events/calendar">
              Calendar
            </Link>
            <CalendarSubscribe buttonClassName="btn lg" />
            {content.ctaLabel && content.ctaHref && (
              <a className="btn lg" href={content.ctaHref}>
                {content.ctaLabel}
              </a>
            )}
            {userHasEvents && (
              <>
                <Link className="btn txt" href="/admin/events">
                  Manage
                </Link>
                <Link className="btn txt" href="/drafts">
                  Drafts
                </Link>
              </>
            )}
          </div>
        )}
      </div>

      {content.body && <p className="body fqm-intro">{content.body}</p>}

      <nav className="tabs fqm-tabs" aria-label="When">
        {WHEN_TABS.map((t) => (
          <Link
            key={t.key}
            href={hrefWith('/events', params, { when: t.key === 'now' ? null : t.key })}
            className={t.key === when ? 'on' : undefined}
            aria-current={t.key === when ? 'page' : undefined}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <div className="fqm-tools">
        <FqFindField action="/events" value={params.q} placeholder="Search events" keep={params} />
        {shownFacets.map((f) => (
          <FqFacetMenu key={f.paramKey} label={f.label} paramKey={f.paramKey} options={f.options} base="/events" current={params} />
        ))}
        {sortOptions.length > 1 && (
          <FqFacetMenu
            label="Sort"
            paramKey="sort"
            options={sortOptions}
            base="/events"
            current={params.sort ? params : { ...params, sort: sortOptions[0].value }}
            clearable={false}
            icon="chart"
          />
        )}
        <FqClearLink base={when === 'now' ? '/events' : `/events?when=${when}`} active={anyFilter} />
      </div>

      <div className="ap-cols">
        <div>
          {showForYou && when === 'now' && (
            <Suspense fallback={null}>
              <FqEventsForYou data={data} />
            </Suspense>
          )}
          <FqEventsMapToggle pins={mapPins}>
          {days.length === 0 ? (
            <div className="empty stack">
              <span className="h3">
                {anyFilter ? 'Nothing matches these filters.' : `Nothing on the calendar ${when === 'now' ? 'yet' : 'for then'}.`}
              </span>
              <span className="t2">
                {anyFilter
                  ? 'Try another filter, or clear them to see everything coming up.'
                  : when === 'now'
                    ? 'When a host near you posts a gathering, it lands here.'
                    : 'Try another day, or see everything coming up.'}
              </span>
              {(when !== 'now' || anyFilter) && (
                <Link className="btn sm fqm-tag-start" href="/events">
                  See everything
                </Link>
              )}
            </div>
          ) : (
            days.map((day, i) => (
              <div key={day.label}>
                <span className="k">{day.label}</span>
                <div className={i === days.length - 1 ? 'list fqm-day last' : 'list fqm-day'}>
                  {day.rows.map((e) => {
                    const cover = coverUrls[e.id]
                    const live =
                      !!e.ends_at &&
                      isEventPast(e.starts_at, null, HOME_TZ, nowDate) &&
                      !isEventPast(e.starts_at, e.ends_at, HOME_TZ, nowDate)
                    const going = rsvpCounts[e.id] ?? 0
                    const line = [
                      timeLabel(e.starts_at),
                      e.location,
                      miles(e.distance_m),
                      going > 0 ? `${going} going` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                    const ticket = needsTicket(e, priceLabels[e.id])
                    return (
                      <Link key={e.id} href={`/events/${e.slug}`}>
                        <span
                          className="ph fqm-thumb"
                          style={cover ? { backgroundImage: `url('${cover}')` } : undefined}
                        />
                        <span className="grow stack fqm-row-stack">
                          <span className="t1 fqm-t1-row">
                            {live && <span className="dot fq-breathe" aria-label="Happening now" />}
                            {e.title}
                          </span>
                          <span className="t2">{e.is_cancelled ? `Cancelled · ${line}` : line}</span>
                        </span>
                        {e.is_cancelled ? null : ticket ? (
                          <span className="btn sm">{priceLabels[e.id] ?? 'Tickets'}</span>
                        ) : myProfileId ? (
                          <GoButton eventId={e.id} slug={e.slug} going={myRsvps.has(e.id)} />
                        ) : null}
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))
          )}
          {sortedEvents.filter((e) => inWhen(e, when, nowDate)).length > ROW_CAP && (
            <Link className="btn sm" href="/events/calendar">
              See the full calendar
            </Link>
          )}
          </FqEventsMapToggle>
        </div>

        <aside className="side">
          <div className="panel stack">
            <span className="k">Your week</span>
            {myWeek.length > 0 ? (
              <div className="list">
                {myWeek.map((e) => (
                  <Link key={e.id} href={`/events/${e.slug}`}>
                    <span className="t2 fqm-wk">{shortDay(e.starts_at)}</span>
                    <span className="dot" />
                    <span className="t1 grow">{e.title}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <span className="t2">
                {myProfileId
                  ? 'Nothing on your week yet. Tap Go on anything here and it shows up.'
                  : 'Sign in and the things you are going to line up here.'}
              </span>
            )}
          </div>
          {showForYou && myProfileId && (
            <Suspense fallback={null}>
              <FqPeopleToMeet viewerProfileId={myProfileId} eventIds={sortedEvents.map((e) => e.id)} />
            </Suspense>
          )}
        </aside>
      </div>
    </>
  )
}
