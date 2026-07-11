import { Suspense } from 'react'
import Link from 'next/link'
import {
  Building2,
  Plus,
  ChevronLeft,
  ChevronRight,
  Globe,
  ShoppingBag,
  CalendarCheck,
  BadgeCheck,
  Ticket,
  Contact,
  QrCode,
  Mail,
  BarChart3,
} from 'lucide-react'
import { IndexTemplate } from '@/components/templates'
import { buttonClasses } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { getMyProfileId } from '@/lib/auth'
import {
  listNetworkedSpacesPage,
  normalizeSpaceSort,
  type SpaceSort,
} from '@/lib/spaces/discovery'
import { spaceCategoryLabel } from '@/lib/spaces/categories'
import { SpaceCard } from '@/components/spaces/space-card'
import { SpacesToolbar } from '@/components/spaces/spaces-toolbar'

// The Spaces DIRECTORY — the in-app surface where a member browses the networked entity Spaces
// (practitioners, businesses, organizations, coaching academies, event spaces) and opens one's
// profile (ENTITY-SPACES-BUILD §A/§B, Phase 1 / Epic 1.8). Composed, not authored: the Index
// template provides the header grammar, a toolbar carries the search + category filter, and each
// Space renders through the shared SpaceCard -> EntityCard so the directory reads like every other
// browse grid. The grid is its own <Suspense> so the shell + header paint instantly and never block on
// the discovery read (D5 / PAGE-FRAMEWORK §5). The result set is PAGED (12/24/48 per page) via
// listNetworkedSpacesPage, all URL-driven so a filtered + paged view stays shareable.

export const metadata = {
  title: 'Business Spaces',
  description:
    'Browse every practitioner, business, organization, coaching academy, and event space in the Frequency network.',
}

// The page-size options the selector offers; 12 is the default, matching the 3-up grid (multiples of 3).
const PER_PAGE_OPTIONS = [12, 24, 48] as const
const DEFAULT_PER_PAGE = 12

/** Coerce an arbitrary `?per=` value to a supported page size (default 12). */
function normalizePerPage(value: string | undefined): number {
  const n = Number(value)
  return (PER_PAGE_OPTIONS as readonly number[]).includes(n) ? n : DEFAULT_PER_PAGE
}

/** Coerce an arbitrary `?page=` value to a 1-based page number (default 1). */
function normalizePage(value: string | undefined): number {
  const n = Number(value)
  return Number.isInteger(n) && n >= 1 ? n : 1
}

// A dimension-matched skeleton grid — same shape/spacing as the real card grid, so the streamed
// grid lands with no layout shift (PAGE-FRAMEWORK §5.4).
function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 @lg:grid-cols-2 @2xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-80 rounded-2xl" />
      ))}
    </div>
  )
}

// Build a directory URL that keeps the current filters and overrides only the given params. A null
// value drops the param (a clean canonical URL). Used by the pager + page-size selector.
function buildHref(
  base: { q?: string; category?: string; following?: string; sort?: string; per?: number; page?: number },
  overrides: { per?: number | null; page?: number | null },
): string {
  const sp = new URLSearchParams()
  if (base.q) sp.set('q', base.q)
  if (base.category) sp.set('category', base.category)
  if (base.following) sp.set('following', base.following)
  if (base.sort) sp.set('sort', base.sort)
  const per = overrides.per === undefined ? base.per : overrides.per
  const page = overrides.page === undefined ? base.page : overrides.page
  if (per && per !== DEFAULT_PER_PAGE) sp.set('per', String(per))
  if (page && page > 1) sp.set('page', String(page))
  const s = sp.toString()
  return s ? `/spaces/directory?${s}` : '/spaces/directory'
}

// The pager: a page-size selector (12 / 24 / 48) plus Prev / Next and a "Page X of Y" indicator.
// All-Link, so it needs no client JS and the page stays a Server Component. Hidden when there is only
// one page and the default size (nothing to control).
function DirectoryPager({
  page,
  per,
  total,
  urlBase,
}: {
  page: number
  per: number
  total: number
  urlBase: Parameters<typeof buildHref>[0]
}) {
  const totalPages = Math.max(1, Math.ceil(total / per))
  if (total <= DEFAULT_PER_PAGE && per === DEFAULT_PER_PAGE) return null

  const sizePill = (n: number) =>
    `rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
      n === per ? 'bg-primary-bg text-primary-strong' : 'text-muted hover:bg-surface hover:text-text'
    }`

  return (
    <div className="mt-8 flex flex-col items-center justify-between gap-4 border-t border-border pt-6 sm:flex-row">
      {/* Page-size selector — resets to page 1 (a new window over the same set). */}
      <div className="flex items-center gap-2 text-xs text-subtle">
        <span>Per page</span>
        <div className="flex items-center gap-0.5 rounded-lg bg-surface-elevated p-0.5">
          {PER_PAGE_OPTIONS.map((n) => (
            <Link key={n} href={buildHref(urlBase, { per: n, page: null })} className={sizePill(n)}>
              {n}
            </Link>
          ))}
        </div>
      </div>

      {/* Prev / Next + position. A disabled edge renders as a static, muted span (not a link). */}
      <div className="flex items-center gap-3 text-xs">
        {page > 1 ? (
          <Link href={buildHref(urlBase, { page: page - 1 })} className={buttonClasses('secondary', 'sm')}>
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
            Prev
          </Link>
        ) : (
          <span className={`${buttonClasses('secondary', 'sm')} pointer-events-none opacity-40`} aria-disabled>
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
            Prev
          </span>
        )}
        <span className="tabular-nums font-medium text-muted">
          Page {Math.min(page, totalPages)} of {totalPages}
        </span>
        {page < totalPages ? (
          <Link href={buildHref(urlBase, { page: page + 1 })} className={buttonClasses('secondary', 'sm')}>
            Next
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        ) : (
          <span className={`${buttonClasses('secondary', 'sm')} pointer-events-none opacity-40`} aria-disabled>
            Next
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </span>
        )}
      </div>
    </div>
  )
}

// The "Go Business" prompt at the foot of the directory (NAMING.md §"Business pages": "Go Business",
// never "upgrade to Pro"). An honest, feature-led sell in the camp-counselor voice: concrete usage,
// no hype, no em dashes (CONTENT-VOICE §10). Composed from the card shell + a primary CTA to /spaces/new.
const BUSINESS_FEATURES = [
  { Icon: Globe, label: 'Your own branded page' },
  { Icon: ShoppingBag, label: 'Shop and commerce' },
  { Icon: CalendarCheck, label: 'Bookings' },
  { Icon: BadgeCheck, label: 'Memberships' },
  { Icon: Ticket, label: 'Events and tickets' },
  { Icon: Contact, label: 'CRM for your people' },
  { Icon: QrCode, label: 'QR codes' },
  { Icon: Mail, label: 'Email' },
  { Icon: BarChart3, label: 'Insights' },
] as const

function StartBusinessCTA() {
  return (
    <section className="mt-12 overflow-hidden rounded-2xl border border-border bg-surface p-8 sm:p-10">
      <div className="max-w-2xl">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary-strong">Go Business</p>
        <h2 className="text-balance text-2xl font-bold text-text sm:text-3xl">Run your whole business here</h2>
        <p className="mt-3 text-base leading-relaxed text-muted">
          One page for everything you sell, everyone you serve, and every event you run. Your people find
          it in the same network they already browse, so getting listed is getting discovered.
        </p>
      </div>

      <ul className="mt-7 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        {BUSINESS_FEATURES.map(({ Icon, label }) => (
          <li key={label} className="flex items-center gap-2.5 text-sm text-text">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-bg text-primary-strong">
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            {label}
          </li>
        ))}
      </ul>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <Link href="/spaces/new" className={buttonClasses('primary', 'md')}>
          <Plus className="h-4 w-4" aria-hidden />
          Start a Business page
        </Link>
        <p className="text-sm text-subtle">One connected network, shared discovery. Free to start.</p>
      </div>
    </section>
  )
}

async function SpacesGrid({
  q,
  category,
  following,
  sort,
  page,
  per,
  viewerProfileId,
  urlBase,
}: {
  q?: string
  category?: string
  following: boolean
  sort: SpaceSort
  page: number
  per: number
  viewerProfileId: string | null
  urlBase: Parameters<typeof buildHref>[0]
}) {
  const { spaces, total } = await listNetworkedSpacesPage(
    { q, category, followerProfileId: viewerProfileId, onlyFollowed: following, sort },
    { limit: per, offset: (page - 1) * per },
  )

  if (total === 0) {
    const filtering = !!((q ?? '').trim() || (category ?? '').trim() || following)
    const categoryLabel = category ? spaceCategoryLabel(category) : null
    return (
      <>
        <EmptyState
          icon={Building2}
          variant={filtering ? 'no-results' : 'first-use'}
          title={
            following
              ? 'You are not following any Spaces yet.'
              : filtering
                ? 'No Spaces match your search.'
                : 'No Spaces yet.'
          }
          description={
            following
              ? 'Follow a Space from its profile and it shows up here.'
              : filtering
                ? categoryLabel
                  ? `No ${categoryLabel} Spaces matched. Try a different category or a wider search.`
                  : 'Try a different filter or a wider search.'
                : 'This is where practitioners, businesses, and organizations in the network will live. Check back soon.'
          }
        />
        <StartBusinessCTA />
      </>
    )
  }

  // The browse grid uses the container-query pattern (each card sizes to the grid, not the viewport)
  // so it stays portable across rail/no-rail widths (PAGE-FRAMEWORK ADR-295). When the requested page
  // overshoots the result set (a stale `?page=` after a filter change), the slice is empty though total
  // > 0; the pager's clamped "Page X of Y" points the way back.
  return (
    <div className="@container">
      <div className="grid grid-cols-1 gap-6 @lg:grid-cols-2 @2xl:grid-cols-3">
        {spaces.map((space) => (
          <SpaceCard key={space.id} space={space} />
        ))}
      </div>
      <DirectoryPager page={page} per={per} total={total} urlBase={urlBase} />
      <StartBusinessCTA />
    </div>
  )
}

export default async function SpacesDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string
    category?: string
    following?: string
    sort?: string
    per?: string
    page?: string
  }>
}) {
  const {
    q,
    category,
    following: followingParam,
    sort: sortParam,
    per: perParam,
    page: pageParam,
  } = await searchParams
  const following = followingParam === '1'
  const sort = normalizeSpaceSort(sortParam)
  const per = normalizePerPage(perParam)
  const page = normalizePage(pageParam)

  // The "Create a space" affordance is for signed-in members (the create action re-checks auth).
  // The viewer id also feeds the "Following" filter (a signed-out viewer follows nothing).
  const viewerProfileId = await getMyProfileId()

  // The shared base for every pager/size link — the current filters, so paging preserves them.
  const urlBase = { q, category, following: followingParam, sort: sortParam, per, page }

  return (
    <IndexTemplate
      title="Business Spaces"
      description="Every practitioner, business, and organization in the Frequency network. Find one, see what they offer, and connect."
      // The directory opens on a HERO band (the Space-profile hero grammar): the site photo with
      // the title, subtitle, and Create action overlaid on the ink scrim. Swap the image by
      // replacing public/images/site/business-directory-hero.jpg — no code change.
      heroImage="/images/site/business-directory-hero.jpg"
      heroOverlay
      // The one deliberately LARGER hero on the site: the directory keeps its taller band + bigger
      // title while every other index shares the standard overlay size.
      heroSize="large"
      action={
        viewerProfileId ? (
          <Link href="/spaces/new" className={buttonClasses('primary', 'md')}>
            <Plus className="h-4 w-4" aria-hidden />
            Create a space
          </Link>
        ) : undefined
      }
      toolbar={<SpacesToolbar />}
    >
      {/* Keyed on the filters + sort + page window so a new query remounts the boundary and shows the
          skeleton while the next result set streams in. */}
      <Suspense
        key={`${q ?? ''}:${category ?? ''}:${following ? '1' : ''}:${sort}:${per}:${page}`}
        fallback={<GridSkeleton />}
      >
        <SpacesGrid
          q={q}
          category={category}
          following={following}
          sort={sort}
          page={page}
          per={per}
          viewerProfileId={viewerProfileId}
          urlBase={urlBase}
        />
      </Suspense>
    </IndexTemplate>
  )
}
