import type { ReactNode } from 'react'
import Link from 'next/link'
import { EmptyState } from '@/components/ui/empty-state'
import '@/app/themes/active/members-b'
import type { NetworkedSpace } from '@/lib/spaces/discovery'
import { SPACE_KINDS, isSpaceKind, spaceKindLabel } from '@/lib/spaces/categories'
import { SUBJECTS, findSubject } from '@/lib/taxonomy/subjects'
import { SHOW_STEP, type DirectoryParams, type DirectorySections } from '@/lib/spaces/directory-sections'
import { FqFacetMenu, FqFindField, FqClearLink, hrefWith, type Params } from '@/components/frequency/members/shared/kit-tools'
import { MembersBody } from '@/components/frequency/members/shared/members-body'
import { SystemNotice } from '@/components/frequency/members/shared/system-notice'
import { fqPlaceholderArt } from '@/lib/frequency/placeholder-art'
import { FounderMark } from '@/components/frequency/members/space/founder-mark'
import { BoostedBadge } from '@/components/crew/boosted-badge'

// BUSINESS SPACES DIRECTORY, FREQUENCY BODY (LIVE-1018). The header is the shared index header the page
// passes in (MarketHero; LIVE-1012 gives it the kit head with the search on its own row and no photo), so
// this body never forks it. Under it: one find row (Subject, City, Has events, Following, Sort), the kind strip with real counts, then the lead rows
// (Featured, Founding Businesses) and the results grid that grows a page at a time.
//
// EVERY CONTROL IS A URL, like the Circles body: the find pill is a GET form, each menu item is a link
// that keeps the others (`hrefWith`), and the sections come from one pure builder
// (lib/spaces/directory-sections.ts), so any view is shareable and the page stays a Server Component.
// A filter change drops `show`, so a new query starts at the top of its results.

export const SORTS = [
  { value: 'standing', label: 'Most active' },
  { value: 'name', label: 'Name (A to Z)' },
  { value: 'newest', label: 'Newest' },
  { value: 'members', label: 'Most members' },
]

const BASE = '/spaces/directory'

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

// `inFounding`: the tile sits under the Founding Businesses heading, which already says it, so the mark is not
// repeated on every card (owner 2026-10-20: it read as loud).
function SpaceTile({ s, inFounding = false }: { s: NetworkedSpace; inFounding?: boolean }) {
  const art = s.coverUrl || fqPlaceholderArt(s.slug)
  const stats = [
    s.memberCount ? plural(s.memberCount, 'member', 'members') : null,
    s.upcomingEventCount ? plural(s.upcomingEventCount, 'event', 'events') : null,
    s.city,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <Link className="card fqm-card" href={`/spaces/${s.slug}`}>
      <span className="ph" style={{ backgroundImage: `url('${art}')` }}>
        <span className="tag glass fqm-corner">{s.kindLabel}</span>
        {s.isFoundingBusiness && !inFounding && (
          <span className="fqm-corner-b">
            <FounderMark />
          </span>
        )}
      </span>
      <span className="fqm-card-b">
        <span className="h3">{s.name}</span>
        {s.tagline && <span className="t2">{s.tagline}</span>}
        {stats && <span className="t2 fqm-body-ink">{stats}</span>}
        {s.boosted && (
          <span className="row">
            <BoostedBadge boosted />
          </span>
        )}
      </span>
    </Link>
  )
}

export function FqSpacesBody({
  sections,
  params,
  signedIn,
  header,
}: {
  /** The page header, owned by the shared index header (MarketHero, LIVE-1012): this body never draws its own. */
  header: ReactNode
  sections: DirectorySections
  params: DirectoryParams & Params
  signedIn: boolean
}) {
  const { filtering, featured, featuredPicked, founding, results, total, limit, hasMore, kindCounts, cities } = sections
  // Menus and chips build links off the params WITHOUT the grid window, so a new filter starts at the top.
  const cur: Params = { ...params, show: undefined }
  const anyFilter = filtering || !!params.sort
  const subjectLabel = findSubject(params.subject)?.label ?? null
  const kind = isSpaceKind(params.category) ? params.category : null

  const active: { label: string; clear: string }[] = []
  if ((params.q ?? '').trim()) active.push({ label: `"${params.q!.trim()}"`, clear: hrefWith(BASE, cur, { q: null }) })
  if (subjectLabel) active.push({ label: subjectLabel, clear: hrefWith(BASE, cur, { subject: null }) })
  if (kind) active.push({ label: spaceKindLabel(kind), clear: hrefWith(BASE, cur, { category: null }) })
  if (params.city) {
    const c = cities.find((x) => x.value === params.city?.toLowerCase())
    active.push({ label: c?.label ?? params.city, clear: hrefWith(BASE, cur, { city: null }) })
  }
  if (params.events === '1') active.push({ label: 'Has events', clear: hrefWith(BASE, cur, { events: null }) })
  if (params.following === '1') active.push({ label: 'Following', clear: hrefWith(BASE, cur, { following: null }) })

  const toggle = (key: 'events' | 'following', label: string) => {
    const on = params[key] === '1'
    return (
      <Link className={on ? 'chip on' : 'chip'} href={hrefWith(BASE, cur, { [key]: on ? null : '1' })} aria-pressed={on}>
        {label}
      </Link>
    )
  }

  return (
    <MembersBody>
      {header}

      {!signedIn && (
        <SystemNotice
          icon="space"
          title="Run something in town?"
          body="A Space is one home for the Circles you gather and the Events you put on. Hosting is free."
          actions={[
            { href: '/join', label: 'Sign up to create a Space', primary: true },
            { href: '/sign-in', label: 'Log in' },
          ]}
        />
      )}

      <div className="fqm-tools">
        <FqFindField action={BASE} value={params.q} placeholder="Search by name, place or subject" keep={{ ...cur, q: undefined }} />
        <FqFacetMenu
          label="Subject"
          paramKey="subject"
          options={SUBJECTS.map((s) => ({ value: s.key, label: s.label }))}
          base={BASE}
          current={cur}
        />
        {cities.length > 0 && (
          <FqFacetMenu
            label="City"
            paramKey="city"
            icon="pin"
            options={cities.map((c) => ({ value: c.value, label: `${c.label} · ${c.n}` }))}
            base={BASE}
            current={cur}
          />
        )}
        {toggle('events', 'Has events')}
        {signedIn && toggle('following', 'Following')}
        <FqFacetMenu
          label="Sort"
          paramKey="sort"
          options={SORTS}
          base={BASE}
          current={params.sort ? cur : { ...cur, sort: 'standing' }}
          clearable={false}
          icon="chart"
        />
        <FqClearLink base={BASE} active={anyFilter} />
      </div>

      <nav className="chips fqm-chips" aria-label="Kinds of Space">
        <Link className={kind ? 'chip' : 'chip on'} href={hrefWith(BASE, cur, { category: null })}>
          Everything
        </Link>
        {kindCounts.map((k) => (
          <Link
            key={k.key}
            className={kind === k.key ? 'chip on' : 'chip'}
            href={hrefWith(BASE, cur, { category: k.key })}
            aria-current={kind === k.key ? 'true' : undefined}
          >
            {k.label} <span className="t2">{k.n}</span>
          </Link>
        ))}
      </nav>

      {active.length > 0 && (
        <div className="row wrap" aria-label="Active filters">
          {active.map((a) => (
            <Link key={a.label} className="chip on" href={a.clear} aria-label={`Remove filter ${a.label}`}>
              {a.label} <span aria-hidden>×</span>
            </Link>
          ))}
        </div>
      )}

      {featured.length > 0 && (
        <section className="sec" aria-labelledby="fq-spaces-featured">
          <div className="sec-h">
            <span id="fq-spaces-featured" className="h2">
              Featured Spaces
            </span>
            <span className="meta">
              {featuredPicked ? 'Picked by the people who run this community' : 'The most active Spaces right now'}
            </span>
          </div>
          <div className="g3">
            {featured.map((s) => (
              <SpaceTile key={s.id} s={s} />
            ))}
          </div>
        </section>
      )}

      {founding.length > 0 && (
        <section className="sec" aria-labelledby="fq-spaces-founding">
          <div className="sec-h">
            <span id="fq-spaces-founding" className="h2">
              Founding Businesses
            </span>
            <span className="meta">The first to build a home here</span>
          </div>
          <div className="g3">
            {founding.map((s) => (
              <SpaceTile key={s.id} s={s} inFounding />
            ))}
          </div>
        </section>
      )}

      <section className="sec" aria-labelledby="fq-spaces-all">
        <div className="sec-h">
          <span id="fq-spaces-all" className="h2">
            {filtering ? 'Results' : featured.length + founding.length > 0 ? 'More Spaces' : 'All Spaces'}
          </span>
          <span className="meta">{plural(total, 'Space', 'Spaces')}</span>
        </div>
        {results.length > 0 ? (
          <>
            <div className="g3">
              {results.map((s) => (
                <SpaceTile key={s.id} s={s} />
              ))}
            </div>
            {hasMore && (
              <div className="row wrap">
                <Link
                  className="btn"
                  href={hrefWith(BASE, params, { show: String(limit + SHOW_STEP) })}
                  scroll={false}
                >
                  Show more ({total - limit} left)
                </Link>
              </div>
            )}
          </>
        ) : (
          <div className="stack">
            <EmptyState
              variant={filtering ? 'no-results' : 'first-use'}
              title={
                params.following === '1'
                  ? 'You are not following any Spaces yet.'
                  : filtering
                    ? 'No Spaces match.'
                    : featured.length + founding.length > 0
                      ? 'Every Space is in the rows above.'
                      : 'No Spaces here yet.'
              }
              description={
                filtering
                  ? 'Try a wider search, or start from a kind of Space below.'
                  : 'A Space is the home a studio, a shop or a nonprofit keeps here. If you run something in town, this is where it goes.'
              }
              action={
                filtering ? (
                  <Link className="btn sm" href={BASE}>
                    See every Space
                  </Link>
                ) : undefined
              }
            />
            {filtering && (
              <nav className="chips" aria-label="Try a kind of Space">
                {SPACE_KINDS.map((k) => (
                  <Link key={k.key} className="chip" href={`${BASE}?category=${k.key}`}>
                    {k.label}
                  </Link>
                ))}
              </nav>
            )}
          </div>
        )}
      </section>

      {signedIn && (
        <SystemNotice
          className="sec"
          icon="help"
          title="Not sure what a Space is?"
          body="It is one home for the Circles you gather, the Events you put on and everything you offer. Hosting is free. You pay when you start charging."
          actions={[{ href: '/help', label: 'How Spaces work' }]}
        />
      )}
    </MembersBody>
  )
}
