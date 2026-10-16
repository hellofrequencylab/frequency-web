import Link from 'next/link'
import { Radio } from '@/components/ui/radio'
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
import { FqEventsCalendar } from './events-calendar'
import { FqEventsFilterSheet } from './events-filter-sheet'
import { buildCalendarMonth, resolveMonth } from './calendar-month'
import { FqPeopleToMeet } from './events-lanes'
import { FqAroundYou, FqAroundYouFrame } from './around-you'
import { ayMapItems } from './around-you-items'
import { FqEventsMapLightbox, FqMapButton } from './events-map-lightbox'

// EVENTS, FREQUENCY BODY (templates/members/Events.html + app/events.css + app/events.js, the
// 2026-10-14 export). The shell owns the kit root, header and rails; this is the page body: the
// plain member header, the one sticky toolbar (search, Filters on a phone, List / Map / Calendar, More),
// the Around you feature (SCAN-975: the member's next event or best pick, three balanced cards, the
// pulse strip, the ticker and the map's door), People to meet, then the library: the category tabs and
// facet row in one bar that sticks under the toolbar, and a truncated grid four wide that grows a page
// at a time. Map is a lightbox over the page (events-map-lightbox.tsx), not a view of its own.
//
// EVERY CONTROL IS A URL. Search is a GET form, each tab / facet / sort / view / month is a link that
// keeps the others (`hrefWith`), and the server read (getEventsIndexData) does the filtering, so any
// view is shareable and the page stays a Server Component. The islands are small: the map lightbox (its
// engine loads only once it opens), the ticker's clock, and the calendar's keyboard focus.
//
// THE HYBRID RULE. The design wins on layout, structure, visuals and copy; our real features stay,
// restyled: the operator's intro and CTA (page_content), Subscribe, Manage and Drafts, the Format /
// Pace / Spots / Distance facets and the sort, the For you lane, People to meet. Every number is a
// real count (facetCounts runs the list's own predicate and series fold). Not drawn, with reasons:
// the export's weekly "Show up 3 times" goal (no such goal exists in the product), friend faces and
// invite chips on cards (the listing read carries neither), and browser geolocation (distance is
// measured from the member's saved home base, server side).

type ViewKey = 'list' | 'calendar'
const VIEWS: { key: ViewKey; label: string; icon: FqIconName }[] = [
  { key: 'list', label: 'List', icon: 'page' },
  { key: 'calendar', label: 'Calendar', icon: 'event' },
]

/** The old `?view=map` link draws the list, and the map lightbox opens over it. */
function asView(raw: string | undefined): ViewKey {
  return raw === 'calendar' ? raw : 'list'
}

/** The library's page: four across, three rows, then "Show more" adds a page, up to ROW_CAP. */
const LIB_STEP = 12
/** How many cards the grid draws before it hands off to the calendar. */
const ROW_CAP = 60

function libLimit(raw: string | undefined): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= LIB_STEP) return LIB_STEP
  return Math.min(ROW_CAP, Math.ceil(n / LIB_STEP) * LIB_STEP)
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
    mapPins,
    myRsvps,
    nowDate,
    myProfileId,
    userHasEvents,
    facets,
    facetCounts,
    sortOptions,
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

  const limit = libLimit(params.show)
  const shown = sortedEvents.slice(0, limit)
  const mapItems = ayMapItems(sortedEvents, mapPins, data)
  // The feature leads only when the member is browsing: a search or a filter puts the results first.
  const featured = view === 'list' && !filtering && sortedEvents.length > 0

  const usingFallbackTitle = !content.title || content.title === 'Events near you'
  const near = params.near ? ` within ${params.near} km` : ''

  // The search form carries every other param, so a search keeps the filters and the view.
  const keep = Object.entries(params).filter(
    ([k, v]) => k !== 'q' && k !== 'month' && k !== 'show' && k !== 'map' && !!v,
  ) as [string, string][]

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
              href={hrefWith(base, params, {
                view: v.key === 'list' ? null : v.key,
                month: v.key === 'calendar' ? params.month ?? null : null,
                show: null,
                map: null,
              })}
              className={view === v.key ? 'on' : undefined}
              aria-current={view === v.key ? 'page' : undefined}
            >
              <FqIcon name={v.icon} />
              <span className="evx-seg-t">{v.label}</span>
            </Link>
          ))}
          <FqMapButton />
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
          <Link className="chip on" href={hrefWith(base, params, { category: null, show: null })} aria-label={`${activeCat.label}, clear category`}>
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
                  href={hrefWith(base, params, { date: on ? null : o.value, show: null })}
                  aria-current={on ? 'true' : undefined}
                >
                  {o.label}
                </Link>
              )
            })}
        {anyFilter && <FqClearLink base={hrefWith(base, keepView, {})} active />}
      </nav>

      {featured && (
        <Suspense fallback={<FqAroundYouFrame />}>
          <FqAroundYou data={data} mapItems={mapItems} />
        </Suspense>
      )}
      {featured && myProfileId && (
        <Suspense fallback={null}>
          <FqPeopleToMeet viewerProfileId={myProfileId} eventIds={sortedEvents.map((e) => e.id)} />
        </Suspense>
      )}

      {/* THE LIBRARY BAR (SCAN-975): the category tabs and the facet and sort menus in one bar that sticks
          under the toolbar while the library scrolls, so a sort is always one tap away. A phone keeps the
          Filters sheet instead (SCAN-919), so the bar draws nothing there. */}
      <div className="ev-libbar">
        <div className="ev-bar">
          <nav className="ev-tabs" aria-label="Categories">
            {tabs.map((t) => {
              const on = (params.category ?? '') === t.value
              return (
                <Link
                  key={t.value || 'all'}
                  href={hrefWith(base, params, { category: t.value || null, show: null })}
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
      </div>

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
        <section className="ev-lib" aria-labelledby="ev-sum-h">
          <div className="ev-sum">
            <h2 id="ev-sum-h" className="h2">
              {filtering ? 'Matching events' : 'Everything coming up'}
            </h2>
            <span className="t2">
              {shown.length < sortedEvents.length ? `${shown.length} of ` : ''}
              {sortedEvents.length} {sortedEvents.length === 1 ? 'event' : 'events'}
              {near}
              {params.q ? ` for “${params.q}”` : ''}
            </span>
          </div>
          <div className="ev-list ev-list4">
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
          {sortedEvents.length > shown.length && (
            <div className="ev-more ev-lib-more">
              {limit < ROW_CAP ? (
                <Link className="btn" href={hrefWith(base, params, { show: String(limit + LIB_STEP) })} scroll={false}>
                  Show more
                  <span className="ev-n-tag">{sortedEvents.length - shown.length} more</span>
                </Link>
              ) : null}
              <Link className="btn txt" href={hrefWith(base, params, { view: 'calendar', show: null })}>
                See all {sortedEvents.length} on the calendar
              </Link>
            </div>
          )}
        </section>
      )}

      <Suspense fallback={null}>
        <FqEventsMapLightbox items={mapItems} signedIn={!!myProfileId} homeLabel={homeLabel} />
      </Suspense>
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
            <Radio
              key={o.value || 'any'}
              name={name}
              value={o.value}
              defaultChecked={o.value === value}
              wrapperClassName="chip evf-opt"
              label={
                <>
                  {o.label}
                  {counts && counts[o.value] != null && <span className="ev-n-tag">{counts[o.value]}</span>}
                </>
              }
            />
          ))}
        </div>
      )}
    </fieldset>
  )
}
