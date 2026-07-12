import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus, ArrowDown } from 'lucide-react'
import { buttonClasses } from '@/components/ui/button'
import { JsonLd } from '@/components/json-ld'
import { spaceListSchema, breadcrumbSchema } from '@/lib/jsonld'
import { BetaCTA } from '@/components/marketing/marketing-ui'
import { MarketHero } from '@/components/marketplace/market-hero'
import { DirectorySearch } from '@/components/ui/directory-search'
import { SITE_NAME } from '@/lib/site'
import { listNetworkedSpacesPage, normalizeSpaceSort } from '@/lib/spaces/discovery'
import { SpacesToolbar } from '@/components/spaces/spaces-toolbar'
import {
  SpacesResults,
  normalizePerPage,
  normalizePage,
  DIRECTORY_GRID_WIDE,
} from '@/components/spaces/directory-view'

// PUBLIC Business Spaces directory (/discover/spaces) — the indexable, no-rail twin of the in-app directory
// (/spaces/directory). It renders inside the shared /discover chrome (SiteHeader + footer, no left menu, no
// community right rail), so a logged-out visitor or a crawler sees the same browse feature the members' app
// has: the search + category toolbar, the paged card grid, and the "Go Business" sell. The grid + pager + CTA
// are the SHARED directory body (components/spaces/directory-view), so the two surfaces never drift. Public
// contract mirrors the rest of /discover: no operator admin bar, no per-viewer state (viewerProfileId is null,
// the "Following" filter is hidden), ISR-cached, and an ItemList + breadcrumb JSON-LD for answer engines.

const TITLE = 'Business Spaces'
const DESCRIPTION =
  'Every practitioner, business, and organization in the Frequency network. Find one, see what they offer, and connect.'
// The marketing header invitation: a plain, two-part welcome (browse what is here, or add your own), sized
// for the on-photo hero. Voice canon: plain, no em dashes, never narrate the reader's feelings.
const HERO_INVITE =
  'Find a practitioner, business, studio, or shop near you. Or list your own and get discovered by everyone browsing the network.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/discover/spaces' },
  openGraph: { title: `${TITLE} · ${SITE_NAME}`, description: DESCRIPTION, url: '/discover/spaces', type: 'website' },
  twitter: { card: 'summary_large_image', title: `${TITLE} · ${SITE_NAME}`, description: DESCRIPTION },
}

// Revalidate hourly — the network of listed Spaces changes often enough to keep fresh, rarely enough that we
// don't need per-request rendering for crawlers (matches the rest of /discover).
export const revalidate = 3600

const PUBLIC_BASE = '/discover/spaces'

export default async function PublicSpacesDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string
    category?: string
    sort?: string
    per?: string
    page?: string
  }>
}) {
  const { q, category, sort: sortParam, per: perParam, page: pageParam } = await searchParams
  const sort = normalizeSpaceSort(sortParam)
  const per = normalizePerPage(perParam)
  const page = normalizePage(pageParam)

  // One public read — no viewer (a logged-out surface follows nothing), so no auth call and the page stays
  // cacheable. The same data feeds both the list schema and the body.
  const { spaces, total } = await listNetworkedSpacesPage(
    { q, category, sort },
    { limit: per, offset: (page - 1) * per },
  )

  // The pager base — the current filters, so paging preserves them (no `following` on the public surface).
  const urlBase = { q, category, sort: sortParam, per, page }

  return (
    // Shared page width with the public Space profiles (~88rem, set in the (main) public chrome), so moving
    // between the directory and a Space reads as one product. The /discover layout already clears the fixed
    // header, so the top padding here stays small (no double gap above the hero).
    <div className="mx-auto max-w-[88rem] px-6 pb-16 pt-4 sm:pb-20 sm:pt-6">
      <JsonLd
        data={[
          spaceListSchema(spaces, TITLE),
          breadcrumbSchema([
            { name: 'Discover', path: '/discover' },
            { name: 'Business Spaces', path: '/discover/spaces' },
          ]),
        ]}
      />

      {/* A Market-style marketing hero (components/marketplace/market-hero): full-bleed photo + scrim + amber
          glow, a bold display headline, an in-hero SEARCH (writes ?q=, so the grid below filters live), and
          two buttons: List your business (create) and Browse all (jump to the listings). */}
      <MarketHero
        image="/images/site/business-directory-hero.jpg"
        eyebrow="Business Spaces"
        title="Find a business near you"
        subtitle={HERO_INVITE}
        search={<DirectorySearch placeholder="Search businesses by name" />}
        action={
          <>
            <Link href="/spaces/new" className={buttonClasses('primary', 'md')}>
              <Plus className="h-4 w-4" aria-hidden />
              List your business
            </Link>
            <Link href="#directory" className={buttonClasses('secondary', 'md')}>
              <ArrowDown className="h-4 w-4" aria-hidden />
              Browse all
            </Link>
          </>
        }
      />

      {/* The category filter + sort (search lives in the hero above). */}
      <div className="mt-6">
        <SpacesToolbar showFollowing={false} showSearch={false} />
      </div>

      {/* Anchor target for the hero's Browse CTA; scroll-mt clears the fixed site header. */}
      <div id="directory" className="mt-6 scroll-mt-24">
        <SpacesResults
          basePath={PUBLIC_BASE}
          spaces={spaces}
          total={total}
          q={q}
          category={category}
          following={false}
          page={page}
          per={per}
          urlBase={urlBase}
          gridClassName={DIRECTORY_GRID_WIDE}
        />
      </div>

      <div className="mt-16">
        <BetaCTA
          heading="Run your whole business in the network people already browse."
          body="Your own branded page, a shop, bookings, memberships, events, and a CRM for your people. Getting listed is getting discovered. Free to start."
        />
      </div>
    </div>
  )
}
