// /discover/spaces (the public Business Spaces directory) and /discover/spaces/[type] (the Business and
// Non Profit hubs) under the Frequency design, on the Spaces side (sun).
//
// The directory keeps every feature the DAWN page has: the name search (the same URL-driven
// DirectorySearch), the subject filter (the shared fifteen, lib/taxonomy/subjects.ts), the sort, the
// pager and the legacy `?category=` kind filter an old shared link may carry. The filters and the sort
// are real links built server-side, so a filtered view is shareable and the page needs no toolbar JS.
// Order is STANDING by default (earned, never sold); Founding and Boosted are marks on a card only.

import Link from 'next/link'
import { SPACE_SORTS, type NetworkedSpace, type SpaceSort } from '@/lib/spaces/discovery'
import { SUBJECTS, findSubject } from '@/lib/taxonomy/subjects'
import { isSpaceKind, spaceKindLabel } from '@/lib/spaces/categories'
import { DEFAULT_PER_PAGE } from '@/components/spaces/directory-view'
import { DIRECTORY_TYPES } from '@/components/spaces/space-type'
import { DirectorySearch } from '@/components/ui/directory-search'
import { BETA_CTA_HREF, BETA_CTA_LABEL, SITE_NAME } from '@/lib/site'
import { KeepGoing } from '@/components/frequency/site/shell/keep-going'
import { FqIcon } from '@/components/frequency/icon'
import { count, DirChips, DirEmpty, DirHero, DirPage, DirSection, photo } from './dir-parts'

const BASE = '/discover/spaces'

/** The plural a type door reads ("Businesses", "Non Profits"), as the type hubs title themselves. */
const TYPE_PLURAL: Record<string, string> = { business: 'Businesses', nonprofit: 'Non Profits' }

/** The sort labels SpacesSort shows (components/spaces/spaces-sort.tsx). Restated, not imported: that
 *  module is a client component, so its constant reaches a server component as a reference, not an
 *  array. Keyed by SpaceSort, so a new sort fails the type check here until it has a label. */
const SORT_LABEL: Record<SpaceSort, string> = {
  standing: 'Most active',
  name: 'Name (A–Z)',
  newest: 'Newest',
  members: 'Most members',
}

export interface SpacesQuery {
  q?: string
  subject?: string
  category?: string
  sort?: string
  per: number
  page: number
}

/** A directory URL from the current query with some params changed. A filter or sort change resets
 *  the page (a page number means nothing against a new result set); a subject clears a legacy kind. */
function href(cur: SpacesQuery, next: Partial<Record<'subject' | 'sort' | 'page', string | number | null>>): string {
  const sp = new URLSearchParams()
  const subject = 'subject' in next ? next.subject : cur.subject
  const sort = 'sort' in next ? next.sort : cur.sort
  const page = 'page' in next ? next.page : null
  if (cur.q) sp.set('q', cur.q)
  if (subject) sp.set('subject', String(subject))
  if (!('subject' in next) && cur.category) sp.set('category', cur.category)
  if (sort && sort !== 'standing') sp.set('sort', String(sort))
  if (cur.per !== DEFAULT_PER_PAGE) sp.set('per', String(cur.per))
  if (page && Number(page) > 1) sp.set('page', String(page))
  const s = sp.toString()
  return s ? `${BASE}?${s}` : BASE
}

/** One Space: the kit's `.pc` card. The title links to the profile and a stretched link makes the
 *  whole card a target; the Space's own action is a separate link, so the two are never nested. */
function SpaceTile({ s }: { s: NetworkedSpace }) {
  const stats = [
    s.memberCount && s.memberCount > 0 ? count(s.memberCount, 'member', 'members') : null,
    s.followerCount && s.followerCount > 0 ? count(s.followerCount, 'follower', 'followers') : null,
    s.upcomingEventCount && s.upcomingEventCount > 0 ? count(s.upcomingEventCount, 'event', 'events') : null,
  ].filter(Boolean) as string[]
  const marks = [s.isFoundingBusiness && 'Founding Business', s.boosted && 'Boosted'].filter(Boolean) as string[]
  return (
    <li>
      <article className="pc dd-card">
        {s.coverUrl && (
          <span className="ph">
            {/* eslint-disable-next-line @next/next/no-img-element -- operator-supplied cover URL */}
            <img src={s.coverUrl} alt="" loading="lazy" decoding="async" />
          </span>
        )}
        <span className="row">
          <span className="ic">
            {s.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- operator-supplied logo URL
              <img src={s.logoUrl} alt="" loading="lazy" decoding="async" width={28} height={28} />
            ) : (
              <FqIcon name="space" />
            )}
          </span>
          <span className="tg">
            <i>{s.kindLabel}</i>
            {marks.map((m) => (
              <i key={m}>{m}</i>
            ))}
          </span>
        </span>
        <h3>
          <Link href={`/spaces/${s.slug}`}>{s.name}</Link>
        </h3>
        {s.tagline && <p className="dd-clamp">{s.tagline}</p>}
        {stats.length > 0 && (
          <span className="dd-meta">
            {stats.map((x) => (
              <span key={x}>{x}</span>
            ))}
          </span>
        )}
        {s.action && (
          <Link className="dd-act" href={s.action.href}>
            {s.action.label} →
          </Link>
        )}
      </article>
    </li>
  )
}

function SpaceGrid({ spaces, label }: { spaces: readonly NetworkedSpace[]; label: string }) {
  return (
    <ul className="g3 dd-grid" aria-label={label}>
      {spaces.map((s) => (
        <SpaceTile key={s.id} s={s} />
      ))}
    </ul>
  )
}

const CLOSER = {
  title: 'Run your whole business in the network people already browse.',
  body: 'Your own page, a shop, bookings, memberships, events, and a CRM for your people. Getting listed is getting discovered. Free to start.',
  primary: { href: '/spaces/new', label: 'List your business' },
  secondary: { href: '/spaces', label: 'How Spaces work' },
}

export function FrequencySpacesDirectory({
  spaces,
  total,
  query,
  image,
}: {
  spaces: readonly NetworkedSpace[]
  total: number
  query: SpacesQuery
  image: string | null
}) {
  const filtering = !!((query.q ?? '').trim() || (query.subject ?? '').trim() || (query.category ?? '').trim())
  const facet = findSubject(query.subject)?.label ?? (isSpaceKind(query.category) ? spaceKindLabel(query.category) : null)
  const pages = Math.max(1, Math.ceil(total / query.per))
  const sort = query.sort ?? 'standing'
  return (
    <DirPage side="e">
      <DirHero
        crumbs={[{ label: 'Discover', href: '/discover' }, { label: 'Business Spaces' }]}
        image={image || photo('gathering-04.jpg')}
        title="Find a business or nonprofit near you"
        lede="Find a business or nonprofit near you. Or list your own and get discovered by everyone browsing the network."
      >
        <Link className="btn fq-iri-btn" href="/spaces/new">
          List your business
        </Link>
        <a className="btn btn-ghost fq-iri-rim" href="#directory">
          Browse all
        </a>
      </DirHero>

      <DirSection
        id="directory"
        label="The directory"
        meta={total > 0 ? count(total, 'Space', 'Spaces') : null}
        title="Ranked by how often they gather."
        lede="Nobody can pay their way up this list. Standing comes from showing up."
      >
        <div className="dd-tools">
          <DirectorySearch placeholder="Search businesses by name" />
          <DirChips
            label="Filter by subject"
            chips={[
              { href: href(query, { subject: null }), label: 'All', on: !query.subject },
              ...SUBJECTS.map((s) => ({ href: href(query, { subject: s.key }), label: s.label, on: query.subject === s.key })),
            ]}
          />
          <DirChips
            label="Sort Spaces"
            chips={SPACE_SORTS.map((o) => ({ href: href(query, { sort: o }), label: SORT_LABEL[o], on: sort === o }))}
          />
        </div>

        {total === 0 ? (
          <DirEmpty
            title={filtering ? 'No Spaces match your search.' : 'No Spaces here yet.'}
            body={
              filtering
                ? facet
                  ? `No ${facet} Spaces matched. Try a different filter or a wider search.`
                  : 'Try a different filter or a wider search.'
                : 'A Space is the home a studio, a shop or a nonprofit keeps here, and the Circles and Events they host hang off it. Hosting is free, so if you run something in town, this is where it goes.'
            }
          >
            {filtering ? (
              <Link className="btn btn-ghost" href={BASE}>
                Clear filters
              </Link>
            ) : (
              <Link className="btn fq-iri-btn" href="/spaces/new">
                List your business
              </Link>
            )}
          </DirEmpty>
        ) : (
          <>
            <SpaceGrid spaces={spaces} label="Spaces" />
            {pages > 1 && (
              <nav className="dd-pager" aria-label="Pages">
                <span>
                  Page {Math.min(query.page, pages)} of {pages}
                </span>
                <span className="subnav">
                  {query.page > 1 && <Link href={href(query, { page: Math.min(query.page, pages) - 1 })}>← Previous</Link>}
                  {query.page < pages && <Link href={href(query, { page: query.page + 1 })}>Next →</Link>}
                </span>
              </nav>
            )}
          </>
        )}
      </DirSection>

      <DirSection label="By type" title="Browse a whole kind at once.">
        <DirChips
          label="Space types"
          chips={DIRECTORY_TYPES.map((t) => ({ href: `${BASE}/${t.value}`, label: TYPE_PLURAL[t.value] ?? t.label, on: false }))}
        />
      </DirSection>

      <KeepGoing {...CLOSER} />
    </DirPage>
  )
}

export function FrequencySpaceTypeHub({
  type,
  hub,
  hubs,
  label,
  spaces,
}: {
  type: string
  hub: { plural: string; blurb: string }
  /** Every hub, so the cross-links read each one's own plural. */
  hubs: Record<string, { plural: string }>
  label: string
  spaces: readonly NetworkedSpace[]
}) {
  return (
    <DirPage side="e">
      <DirHero
        crumbs={[
          { label: 'Discover', href: '/discover' },
          { label: 'Spaces', href: '/spaces' },
          { label: hub.plural },
        ]}
        image={photo(type === 'nonprofit' ? 'gathering-12.jpg' : 'gathering-04.jpg')}
        title={`${hub.plural} on ${SITE_NAME}`}
        lede={`The ${hub.plural.toLowerCase()} building on ${SITE_NAME}: ${hub.blurb}. Browse them free, follow the ones you like, then reach out.`}
      />
      <DirSection
        label="Browse"
        meta={spaces.length > 0 ? `${count(spaces.length, 'profile', 'profiles')}, and counting` : null}
        title={`Every ${label} in the network.`}
      >
        {spaces.length === 0 ? (
          <DirEmpty title={`No ${hub.plural.toLowerCase()} here yet.`} body="Be the first to claim one. A profile is free and gets found on search and AI.">
            <Link className="btn fq-iri-btn" href="/spaces/new">
              List yours
            </Link>
          </DirEmpty>
        ) : (
          <SpaceGrid spaces={spaces} label={hub.plural} />
        )}
      </DirSection>
      <DirSection label="Keep browsing" title="Other kinds of Spaces.">
        <DirChips
          label="Space types"
          chips={[
            { href: '/spaces', label: 'All Spaces', on: false },
            ...DIRECTORY_TYPES.filter((t) => t.value !== type).map((t) => ({
              href: `${BASE}/${t.value}`,
              label: hubs[t.value]?.plural ?? t.label,
              on: false,
            })),
          ]}
        />
      </DirSection>
      <KeepGoing
        title={`Run your ${label.toLowerCase()} on ${SITE_NAME}.`}
        body="Start with a free profile that gets found on search and AI, then grow into the full toolkit when you are ready."
        primary={{ href: BETA_CTA_HREF, label: BETA_CTA_LABEL }}
        secondary={{ href: '/spaces', label: 'How Spaces work' }}
      />
    </DirPage>
  )
}
