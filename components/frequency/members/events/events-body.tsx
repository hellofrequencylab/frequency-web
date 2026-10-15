import Link from 'next/link'
import { Suspense } from 'react'
import '@/app/themes/active/members-b'
import '@/app/themes/active/members-events'
import type { EventsIndexData } from '@/app/(main)/events/index-data'
import { CalendarSubscribe } from '@/components/events/calendar-subscribe'
import { FqIcon, type FqIconName } from '@/components/frequency/icon'
import { Input } from '@/components/ui/field'
import { HOME_TZ, dayInZone } from '@/lib/time/zone'
import { CATEGORY_OPTIONS } from '@/lib/events/options'
import { FqClearLink, FqFacetMenu, hrefWith, type Params } from '@/components/frequency/members/shared/kit-tools'
import { FqEventCard } from './event-card'
import { FqEventsMapPane } from './events-map-pane'
import { FqEventsCalendar } from './events-calendar'
import { buildCalendarMonth, chipTime, resolveMonth } from './calendar-month'
import { FqEventsForYou, FqPeopleToMeet } from './events-lanes'
import { HubLinks } from '@/components/frequency/members/shared/hub-links'
import { hubLinks } from '@/components/frequency/members/shell/nav'

// EVENTS, FREQUENCY BODY (templates/members/Events.html + app/events.css + app/events.js, the
// 2026-10-14 export). The shell owns the kit root, header and rails; this is the page body: the
// photo hero with the search pill and the member's home base, the category tabs with real counts,
// the List / Map / Calendar switch, the facet row, the For you lane and People to meet, the card
// grid (with the sticky map in Map), the month grid in Calendar, and Your week down the side.
//
// EVERY CONTROL IS A URL. Search is a GET form, each tab / facet / sort / view / month is a link that
// keeps the others (`hrefWith`), and the server read (getEventsIndexData) does the filtering, so any
// view is shareable and the page stays a Server Component. Only two islands ship JS: the map (loaded
// only in Map) and the calendar's keyboard focus.
//
// THE HYBRID RULE. The design wins on layout, structure, visuals and copy; our real features stay,
// restyled: the operator's intro and CTA (page_content), Subscribe, Manage and Drafts, the Format /
// Pace / Spots / Distance facets and the sort, the For you lane, People to meet. Every number is a
// real count (facetCounts runs the list's own predicate and series fold). Not drawn, with reasons:
// the export's weekly "Show up 3 times" goal (no such goal exists in the product), friend faces and
// invite chips on cards (the listing read carries neither), and browser geolocation (distance is
// measured from the member's saved home base, server side).

type ViewKey = 'list' | 'map' | 'calendar'
const VIEWS: { key: ViewKey; label: string; icon: FqIconName }[] = [
  { key: 'list', label: 'List', icon: 'page' },
  { key: 'map', label: 'Map', icon: 'map' },
  { key: 'calendar', label: 'Calendar', icon: 'event' },
]

function asView(raw: string | undefined): ViewKey {
  return raw === 'map' || raw === 'calendar' ? raw : 'list'
}

/** How many cards the grid draws before it hands off to the calendar. */
const ROW_CAP = 60
const DAY_MS = 24 * 60 * 60 * 1000

/** Whole days from today (home zone) to the event's stored wall-clock day. */
function daysOut(startsAt: string, today: string): number {
  return Math.round((Date.parse(`${startsAt.slice(0, 10)}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS)
}
function shortDay(iso: string, today: string): string {
  if (daysOut(iso, today) === 0) return 'Today'
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
}

export function FqEventsBody({
  data,
  params,
}: {
  data: EventsIndexData
  /** The page's search params, so every control keeps the others when it changes its own. */
  params: Params
}) {
  const {
    sortedEvents,
    goingEvents,
    myRsvps,
    nowDate,
    myProfileId,
    userHasEvents,
    facets,
    facetCounts,
    sortOptions,
    mapPins,
    showForYou,
    filtering,
    content,
    homeLabel,
    hasHome,
    calendarEvents,
  } = data
  const view = asView(params.view)
  const today = dayInZone(nowDate, HOME_TZ)
  const base = '/events'
  const anyFilter = filtering || !!params.sort
  const keepView = { view: params.view, month: params.month }

  // Category tabs: All, then every category with something in it (or the one you are on).
  const catCounts = facetCounts.category ?? {}
  const tabs = [
    { value: '', label: 'All', n: catCounts[''] ?? sortedEvents.length },
    ...CATEGORY_OPTIONS.filter((o) => (catCounts[o.value] ?? 0) > 0 || params.category === o.value).map((o) => ({
      value: o.value,
      label: o.label,
      n: catCounts[o.value] ?? 0,
    })),
  ]
  const otherFacets = facets.filter((f) => f.show !== false && f.paramKey !== 'category')

  const shown = sortedEvents.slice(0, ROW_CAP)
  const myWeek = goingEvents.filter((e) => {
    const d = daysOut(e.starts_at, today)
    return d >= 0 && d < 7
  })

  const usingFallbackTitle = !content.title || content.title === 'Events near you'
  const near = params.near ? ` within ${params.near} km` : ''

  // The search form carries every other param, so a search keeps the filters and the view.
  const keep = Object.entries(params).filter(([k, v]) => k !== 'q' && k !== 'month' && !!v) as [string, string][]

  const calendar =
    view === 'calendar'
      ? buildCalendarMonth(calendarEvents, {
          ...resolveMonth(params.month, today),
          today,
          going: (e) => myRsvps.has(e.id),
        })
      : null

  return (
    <>
      {/* The shared member header (owner, 2026-10-14: one uniform header, no photo on a hub page): the
          kicker, title and meta, then the search and this area's buttons. ev-hero.is-plain in
          members-events.css drops the photo band; the editable copy (content.*) still feeds it. */}
      <section className="ev-hero is-plain" aria-labelledby="ev-title">
        <div className="ev-hero-in">
          <span className="k">What&apos;s happening</span>
          <h1 id="ev-title" className="h1">
            {usingFallbackTitle ? (
              <>
                Events <span className="serif">near you.</span>
              </>
            ) : (
              content.title
            )}
          </h1>
          <p className="body">
            {content.body ||
              'Paid and free events near you, from community circles and hosts. Search, browse by category, then RSVP or grab a ticket.'}
          </p>
          <form method="GET" action={base} className="ev-search" role="search">
            <FqIcon name="search" />
            <Input
              variant="seamless"
              type="search"
              name="q"
              defaultValue={params.q ?? ''}
              placeholder="Search events"
              aria-label="Search events"
              autoComplete="off"
            />
            {keep.map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
            {myProfileId &&
              (homeLabel || hasHome ? (
                <Link
                  className="evx-loc"
                  href="/settings/profile"
                  aria-label={`Home base: ${homeLabel ?? 'set'}. Change it in Settings.`}
                >
                  <FqIcon name="pin" />
                  <span className="ev-loc-t">{homeLabel ?? 'Your home base'}</span>
                </Link>
              ) : (
                <Link className="evx-loc" href="/settings/profile" aria-label="Set your home base to see what is near you">
                  <FqIcon name="pin" />
                  <span className="ev-loc-t">Set your home base</span>
                </Link>
              ))}
          </form>
          <div className="ev-actions">
            {myProfileId && (
              <Link className="btn pa" href="/events/new">
                <FqIcon name="plus" />
                New Event
              </Link>
            )}
            {/* No Calendar button here: the List / Map / Calendar switch below is the one way in (SCAN-912). */}
            <CalendarSubscribe buttonClassName="btn glass" />
            {content.ctaLabel && content.ctaHref && (
              <a className="btn glass" href={content.ctaHref}>
                {content.ctaLabel}
              </a>
            )}
            {myProfileId && userHasEvents && (
              <>
                <Link className="btn glass" href="/admin/events">
                  <FqIcon name="settings" />
                  Manage
                </Link>
                <Link className="btn glass" href="/drafts">
                  <FqIcon name="edit" />
                  Drafts
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      <div className="ev-bar">
        <nav className="ev-tabs" aria-label="Categories">
          {tabs.map((t) => {
            const on = (params.category ?? '') === t.value
            return (
              <Link
                key={t.value || 'all'}
                href={hrefWith(base, params, { category: t.value || null })}
                className={on ? 'on' : undefined}
                aria-current={on ? 'page' : undefined}
              >
                {t.label}
                <span className="ev-n-tag" aria-label={`${t.n} ${t.n === 1 ? 'event' : 'events'}`}>
                  {t.n}
                </span>
              </Link>
            )
          })}
        </nav>
        <div className="evx-seg" role="group" aria-label="View">
          {VIEWS.map((v) => (
            <Link
              key={v.key}
              href={hrefWith(base, params, { view: v.key === 'list' ? null : v.key, month: v.key === 'calendar' ? params.month ?? null : null })}
              className={view === v.key ? 'on' : undefined}
              aria-current={view === v.key ? 'page' : undefined}
            >
              <FqIcon name={v.icon} />
              {v.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="fqm-tools ev-facets">
        {otherFacets.map((f) => (
          <FqFacetMenu
            key={f.paramKey}
            label={f.label}
            paramKey={f.paramKey}
            options={f.options}
            base={base}
            current={params}
            counts={facetCounts[f.paramKey]}
          />
        ))}
        <span className="fqm-end" />
        {anyFilter && <FqClearLink base={hrefWith(base, keepView, {})} active />}
        {sortOptions.length > 1 && (
          <FqFacetMenu
            label="Sort"
            paramKey="sort"
            options={sortOptions}
            base={base}
            current={params.sort ? params : { ...params, sort: sortOptions[0].value }}
            clearable={false}
            icon="filter"
          />
        )}
      </div>

      <div className="ap-cols">
        <div>
          {view !== 'calendar' && showForYou && (
            <Suspense fallback={null}>
              <FqEventsForYou data={data} />
            </Suspense>
          )}
          {view !== 'calendar' && showForYou && myProfileId && (
            <Suspense fallback={null}>
              <FqPeopleToMeet viewerProfileId={myProfileId} eventIds={sortedEvents.map((e) => e.id)} />
            </Suspense>
          )}

          {calendar ? (
            <FqEventsCalendar
              key={calendar.param}
              month={calendar}
              prevHref={calendar.prev ? hrefWith(base, params, { view: 'calendar', month: calendar.prev }) : null}
              nextHref={calendar.next ? hrefWith(base, params, { view: 'calendar', month: calendar.next }) : null}
              emptyHref={hrefWith(base, params, { view: null, month: null })}
              subscribe={<CalendarSubscribe buttonClassName="btn sm" />}
            />
          ) : (
            <div className={view === 'map' ? 'ev-split' : 'ev-split solo'}>
              <section aria-labelledby="ev-sum-h">
                <div className="ev-sum">
                  <h2 id="ev-sum-h" className="h2">
                    {filtering ? 'Matching events' : 'Everything coming up'}
                  </h2>
                  <span className="t2">
                    {sortedEvents.length} {sortedEvents.length === 1 ? 'event' : 'events'}
                    {near}
                    {params.q ? ` for “${params.q}”` : ''}
                  </span>
                </div>
                <div className="ev-list">
                  {shown.length === 0 ? (
                    <div className="ev-empty">
                      <span className="ic">
                        <FqIcon name="event" />
                      </span>
                      <span className="h3">{anyFilter ? 'No events match these filters' : 'Nothing coming up yet'}</span>
                      <span className="t2">
                        {anyFilter
                          ? 'Try another category or clear the filters to see everything coming up.'
                          : 'When a host near you posts a gathering, it lands here.'}
                      </span>
                      {anyFilter ? (
                        <Link className="btn pa" href={hrefWith(base, keepView, {})}>
                          Clear filters
                        </Link>
                      ) : myProfileId ? (
                        <Link className="btn pa" href="/events/new">
                          New Event
                        </Link>
                      ) : null}
                    </div>
                  ) : (
                    shown.map((e) => <FqEventCard key={e.id} e={e} data={data} />)
                  )}
                </div>
                {sortedEvents.length > ROW_CAP && (
                  <div className="ev-more">
                    <Link className="btn" href={hrefWith(base, params, { view: 'calendar' })}>
                      See all {sortedEvents.length} on the calendar
                    </Link>
                  </div>
                )}
              </section>
              {view === 'map' && <FqEventsMapPane pins={mapPins} homeLabel={homeLabel} />}
            </div>
          )}
        </div>

        <aside className="side">
          <div className="panel stack">
            <span className="k">Your week</span>
            {myWeek.length > 0 ? (
              <div className="evx-yours">
                {myWeek.map((e) => (
                  <Link key={e.id} href={`/events/${e.slug}`}>
                    <span className="t2 ev-wk">{shortDay(e.starts_at, today)}</span>
                    <span className="dot" />
                    <span className="t1 grow">{e.title}</span>
                    <span className="t2">{chipTime(e.starts_at)}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <span className="t2">
                {myProfileId
                  ? 'Nothing yet. Tap Go on anything here and it shows up.'
                  : 'Sign in and the things you are going to line up here.'}
              </span>
            )}
          </div>
          <Suspense fallback={null}>
            <HubLinks title="Events" boxed links={(v) => hubLinks('/events', v)} />
          </Suspense>
        </aside>
      </div>
    </>
  )
}
