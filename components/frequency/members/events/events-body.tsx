import Link from 'next/link'
import { Suspense, type ReactNode } from 'react'
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
import { FqEventsFilterSheet } from './events-filter-sheet'
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

  // THE SHEET'S STATE IS THE URL'S (SCAN-919). The facets the sheet stages, as the URL has them, and how many
  // are set (the Filters badge). Sort is in the sheet but is not a filter, so it does not count.
  const sheetKeys = ['category', ...otherFacets.map((f) => f.paramKey)]
  const activeCount = sheetKeys.filter((k) => !!params[k]).length
  const defaultSort = sortOptions[0]?.value
  const sheetInitial: Record<string, string> = Object.fromEntries(sheetKeys.map((k) => [k, params[k] ?? '']))
  if (sortOptions.length > 1) sheetInitial.sort = params.sort && params.sort !== defaultSort ? params.sort : ''
  const facetBy = (k: string) => otherFacets.find((f) => f.paramKey === k)
  const sheetOrder = ['date', 'price', 'format', 'energy', 'spots'].map(facetBy).filter((f): f is NonNullable<typeof f> => !!f)
  const nearFacet = facetBy('near')
  const homeLink = myProfileId ? (
    <Link
      className="evx-loc"
      href="/settings/profile"
      aria-label={
        homeLabel || hasHome
          ? `Home base: ${homeLabel ?? 'set'}. Change it in Settings.`
          : 'Set your home base to see what is near you'
      }
    >
      <FqIcon name="pin" />
      <span className="ev-loc-t">{homeLabel || hasHome ? homeLabel ?? 'Your home base' : 'Set your home base'}</span>
    </Link>
  ) : null
  // Quick picks on a phone: the common date bands, each a toggle link (SCAN-919).
  const QUICK_DATES = ['today', 'week', 'weekend']
  const dateFacet = facetBy('date')
  const activeCat = tabs.find((t) => t.value && t.value === params.category)

  return (
    <>
      {/* The shared member header (owner, 2026-10-14: one uniform header, no photo on a hub page): the
          kicker, title and meta. ev-hero.is-plain in members-events.css drops the photo band; the editable
          copy (content.*) still feeds it. The search, filters, view and host actions sit in the toolbar
          under it (SCAN-919). */}
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
          {content.ctaLabel && content.ctaHref && (
            <div className="ev-actions">
              <a className="btn glass sm" href={content.ctaHref}>
                {content.ctaLabel}
              </a>
            </div>
          )}
        </div>
      </section>

      {/* THE ONE TOOLBAR (SCAN-919): search, then Filters (a phone's bottom sheet), then the view switch,
          then the host actions in one More menu. It sticks under the header so the controls stay one
          thumb away while the list scrolls. */}
      <div className="ev-tb">
        <form method="GET" action={base} className="ev-search" role="search">
          <FqIcon name="search" />
          <Input
            variant="seamless"
            type="search"
            name="q"
            defaultValue={params.q ?? ''}
            placeholder="Search"
            aria-label="Search events"
            autoComplete="off"
          />
          {keep.map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          {homeLink}
        </form>
        <FqEventsFilterSheet
          action={base}
          active={activeCount}
          initial={sheetInitial}
          counts={facetCounts}
          total={sortedEvents.length}
          clearHref={hrefWith(base, keepView, {})}
        >
          {(['q', 'view', 'month'] as const).map((k) =>
            params[k] ? <input key={k} type="hidden" name={k} value={params[k]} /> : null,
          )}
          <SheetChoices
            legend="Category"
            name="category"
            value={params.category ?? ''}
            options={tabs.map((t) => ({ value: t.value, label: t.label }))}
            counts={catCounts}
          />
          {sheetOrder.map((f) => (
            <SheetChoices
              key={f.paramKey}
              legend={f.label}
              name={f.paramKey}
              value={params[f.paramKey] ?? ''}
              options={[{ value: '', label: 'Any' }, ...f.options]}
              counts={facetCounts[f.paramKey]}
            />
          ))}
          {(homeLink || nearFacet) && (
            <SheetChoices
              legend="Location"
              name="near"
              value={params.near ?? ''}
              options={nearFacet ? [{ value: '', label: 'Any distance' }, ...nearFacet.options] : []}
              counts={facetCounts.near}
            >
              {homeLink}
            </SheetChoices>
          )}
          {sortOptions.length > 1 && (
            <SheetChoices
              legend="Sort"
              name="sort"
              value={sheetInitial.sort}
              options={sortOptions.map((o, i) => ({ value: i === 0 ? '' : o.value, label: o.label }))}
            />
          )}
        </FqEventsFilterSheet>
        <nav className="evx-seg" aria-label="View">
          {VIEWS.map((v) => (
            <Link
              key={v.key}
              href={hrefWith(base, params, { view: v.key === 'list' ? null : v.key, month: v.key === 'calendar' ? params.month ?? null : null })}
              className={view === v.key ? 'on' : undefined}
              aria-current={view === v.key ? 'page' : undefined}
            >
              <FqIcon name={v.icon} />
              <span className="evx-seg-t">{v.label}</span>
            </Link>
          ))}
        </nav>
        {/* Host actions, one More menu, members only (the SCAN-912 gating: New event for any member; Manage
            and Drafts once they have added an event; Subscribe draws itself only for a signed-in member). No
            Calendar button: the view switch is the one way in (SCAN-912). */}
        {myProfileId && (
          <details className="fqm-menu ev-more">
            <summary className="ev-more-b" aria-label="More event actions">
              <FqIcon name="more" />
            </summary>
            <div className="fqm-menu-p ev-more-p">
              <Link href="/events/new">
                <FqIcon name="plus" />
                New event
              </Link>
              {userHasEvents && (
                <>
                  <Link href="/drafts">
                    <FqIcon name="edit" />
                    Drafts
                  </Link>
                  <Link href="/admin/events">
                    <FqIcon name="settings" />
                    Manage
                  </Link>
                </>
              )}
              <CalendarSubscribe buttonClassName="ev-more-sub" />
            </div>
          </details>
        )}
      </div>

      {/* Quick picks on a phone (SCAN-919): the active category (tap to clear) and the common date bands. */}
      <nav className="evf-quick" aria-label="Quick filters">
        {activeCat && (
          <Link className="chip on" href={hrefWith(base, params, { category: null })} aria-label={`${activeCat.label}, clear category`}>
            {activeCat.label}
            <FqIcon name="close" />
          </Link>
        )}
        {dateFacet &&
          dateFacet.options
            .filter((o) => QUICK_DATES.includes(o.value))
            .map((o) => {
              const on = params.date === o.value
              return (
                <Link
                  key={o.value}
                  className={on ? 'chip on' : 'chip'}
                  href={hrefWith(base, params, { date: on ? null : o.value })}
                  aria-current={on ? 'true' : undefined}
                >
                  {o.label}
                </Link>
              )
            })}
        {anyFilter && <FqClearLink base={hrefWith(base, keepView, {})} active />}
      </nav>

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

/** One facet in the filter sheet: a row of radio chips under a legend, each with its real count. */
function SheetChoices({
  legend,
  name,
  value,
  options,
  counts,
  children,
}: {
  legend: string
  name: string
  value: string
  options: { value: string; label: string }[]
  counts?: Record<string, number>
  children?: ReactNode
}) {
  return (
    <fieldset className="evf-set">
      <legend className="k">{legend}</legend>
      {children}
      {options.length > 0 && (
        <div className="evf-opts">
          {options.map((o) => (
            <label key={o.value || 'any'} className="chip evf-opt">
              <input type="radio" name={name} value={o.value} defaultChecked={o.value === value} />
              {o.label}
              {counts && counts[o.value] != null && <span className="ev-n-tag">{counts[o.value]}</span>}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  )
}
