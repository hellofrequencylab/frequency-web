import { headers } from 'next/headers'
import Link from 'next/link'
import { Flame, Library, Zap, Wand2, Users, ChevronLeft, ChevronRight, EyeOff, X } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import {
  searchLibraryPractices,
  listSubcategories,
  listCanonicalTags,
  getMemberPractices,
  getPracticeCreators,
  type PracticeSort,
} from '@/lib/practices'
import { getPillars, pillarsById } from '@/lib/pillars'
import { pillarIcon } from '@/lib/practices/pillar-icon'
import { getGlobalCapabilities } from '@/lib/core/load-capabilities'
import { AdoptPracticeButton } from '@/components/practice/adopt-practice-button'
import { PracticeAdminMenu } from '@/components/practice/practice-admin-menu'
import { EntityCard } from '@/components/cards/entity-card'
import { PracticeAuthor } from '@/components/practice/practice-author'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { demoModeEnabled } from '@/lib/platform-flags'
import { viewerHidesDemo } from '@/lib/demo-preference'

// Layout module (ADR-270/294): the faceted Practice LIBRARY — the full-width, paginated,
// filterable grid. It's a layout block like any other, but unlike the personal blocks it is
// URL-driven (Pillar / sub / tag / sort / page / search). searchParams are a PAGE prop that never
// reaches a nested module, so it reads the query from the `x-search` request header the proxy sets
// (proxy.ts). The page's toolbar (search box + sort) writes those params; this block reads them.

const PAGE_SIZE = 24

function Chip({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      scroll={false}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active ? 'bg-primary-bg text-primary-strong' : 'bg-surface-elevated text-muted hover:text-text'
      }`}
    >
      {label}
    </Link>
  )
}

export async function PracticesLibrary() {
  // The page's facets live in the URL; read them from the header the proxy stamps.
  const sp = new URLSearchParams((await headers()).get('x-search') ?? '')
  const get = (k: string) => sp.get(k)?.trim() || ''

  const sortParam = get('sort')
  const sort: PracticeSort = sortParam === 'top' || sortParam === 'new' || sortParam === 'az' ? sortParam : 'trending'
  const page = Math.max(1, parseInt(get('page') || '1', 10) || 1)
  const qParam = get('q')

  const profileId = await getMyProfileId()
  const caps = await getGlobalCapabilities()
  const isAdmin = caps.has('admin.access')
  const showHidden = isAdmin && get('hidden') === '1'

  const [pillars, subcategories, tags, mine] = await Promise.all([
    getPillars(),
    listSubcategories(),
    listCanonicalTags(),
    profileId ? getMemberPractices(profileId) : Promise.resolve([]),
  ])
  const byId = pillarsById(pillars)
  const mineIds = new Set(mine.map((p) => p.id))

  const activePillar = pillars.find((p) => p.slug === get('pillar')) ?? null
  const pillarSubs = activePillar ? subcategories.filter((s) => s.domain_id === activePillar.id) : []
  const activeSub = pillarSubs.find((s) => s.slug === get('sub')) ?? null

  const hideDemo = !(await demoModeEnabled()) || (await viewerHidesDemo())

  const result = await searchLibraryPractices({
    q: qParam,
    pillarId: activePillar?.id ?? null,
    subId: activeSub?.id ?? null,
    tag: get('tag') || null,
    sort,
    page,
    pageSize: PAGE_SIZE,
    hideDemo,
    includeHidden: showHidden,
  })

  // Author attribution (ADR): the library rows carry `created_by` (a profile id) but not the
  // creator's handle/name. Resolve the distinct creators in ONE batch query rather than enriching
  // the shared search fn (searchLibraryPractices is also used by /discover). Rendered in the card
  // footer, which sits outside the card's main link, so a nested profile link is valid.
  const creators = await getPracticeCreators(result.rows.map((p) => p.created_by))

  const base = {
    q: qParam || undefined,
    pillar: get('pillar') || undefined,
    sub: get('sub') || undefined,
    tag: get('tag') || undefined,
    sort: sort !== 'trending' ? sort : undefined,
    hidden: showHidden ? '1' : undefined,
  }
  function href(over: Partial<typeof base> & { page?: number }): string {
    const m = { ...base, ...over }
    const u = new URLSearchParams()
    if (m.q) u.set('q', m.q)
    if (m.pillar) u.set('pillar', m.pillar)
    if (m.sub) u.set('sub', m.sub)
    if (m.tag) u.set('tag', m.tag)
    if (m.sort) u.set('sort', m.sort)
    if (m.hidden) u.set('hidden', m.hidden)
    if (over.page && over.page > 1) u.set('page', String(over.page))
    const s = u.toString()
    return s ? `/practices?${s}` : '/practices'
  }

  const from = (page - 1) * PAGE_SIZE
  const hasFilters = !!(qParam || activePillar || activeSub || get('tag'))

  return (
    <section id="practices-library" className="scroll-mt-20">
      <SectionHeader title="Practice library" count={result.total} />

      {/* Pillar → sub-category + tag facets */}
      <div className="mb-4 space-y-2">
        <div className="flex flex-wrap gap-1.5">
          <Chip label="All Pillars" href={href({ pillar: undefined, sub: undefined, page: undefined })} active={!activePillar} />
          {pillars.map((pl) => (
            <Chip key={pl.slug} label={pl.name} href={href({ pillar: pl.slug, sub: undefined, page: undefined })} active={activePillar?.slug === pl.slug} />
          ))}
        </div>
        {pillarSubs.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <Chip label="All" href={href({ sub: undefined, page: undefined })} active={!activeSub} />
            {pillarSubs.map((s) => (
              <Chip key={s.slug} label={s.name} href={href({ sub: s.slug, page: undefined })} active={activeSub?.slug === s.slug} />
            ))}
          </div>
        )}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <Chip label="All tags" href={href({ tag: undefined, page: undefined })} active={!get('tag')} />
            {tags.map((t) => (
              <Chip key={t.slug} label={`#${t.label}`} href={href({ tag: t.slug, page: undefined })} active={get('tag') === t.slug} />
            ))}
          </div>
        )}
        {hasFilters && (
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-subtle">
            <span>Filtered:</span>
            {qParam && (
              <Link href={href({ q: undefined, page: undefined })} className="inline-flex items-center gap-1 rounded-full bg-surface-elevated px-2 py-0.5 hover:text-text">
                “{qParam}” <X className="h-3 w-3" />
              </Link>
            )}
            <Link href="/practices" className="font-medium text-primary-strong hover:underline">Clear all</Link>
          </div>
        )}
      </div>

      {result.rows.length === 0 ? (
        <EmptyState
          icon={Library}
          title={hasFilters ? 'No practices match' : 'The library is empty'}
          description={hasFilters ? 'Try a different search, Pillar, or tag.' : 'Check back soon. Practices are on their way.'}
        />
      ) : (
        <>
          {/* Container-query sizing (the slot is an @container): the grid reflows to the COLUMN it
              lands in, not the viewport — two-up by a medium column, three across full width, and
              only a truly narrow rail slot drops to one. */}
          <ul className="grid grid-cols-1 gap-4 @sm:grid-cols-2 @4xl:grid-cols-3">
            {result.rows.map((p) => {
              const pillarSlug = p.domain_id ? byId.get(p.domain_id)?.slug ?? null : null
              const pillarName = p.domain_id ? byId.get(p.domain_id)?.name ?? null : null
              const context = [pillarName, p.subcategory?.name, p.category?.replace(/-/g, ' ')].filter(Boolean).join(' · ')
              const PillarIcon = pillarIcon(pillarSlug)
              const creator = p.created_by ? creators.get(p.created_by) ?? null : null
              const author = creator?.handle ? <PracticeAuthor creator={creator} /> : null
              const adopt = profileId ? <AdoptPracticeButton practiceId={p.id} adopted={mineIds.has(p.id)} fullWidth /> : null
              const footer =
                author || adopt ? (
                  <div className="space-y-2">
                    {author}
                    {adopt}
                  </div>
                ) : undefined
              return (
                <li key={p.id}>
                  <EntityCard
                    href={`/practices/${p.id}`}
                    anchor={
                      p.header_image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.header_image} alt="" className="h-11 w-11 rounded-lg object-cover" />
                      ) : (
                        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary-bg text-primary-strong">
                          <PillarIcon className="h-5 w-5" />
                        </div>
                      )
                    }
                    title={p.title}
                    badge={
                      <span className="flex items-center gap-1">
                        {p.is_template && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-warning-bg px-2 py-0.5 text-xs font-semibold text-warning">
                            <Wand2 className="h-3 w-3" /> Template
                          </span>
                        )}
                        {!p.is_public && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger">
                            <EyeOff className="h-3 w-3" /> Hidden
                          </span>
                        )}
                      </span>
                    }
                    context={context || undefined}
                    description={p.summary ?? p.description ?? undefined}
                    meta={
                      <>
                        {p.reward_note && (
                          <span className="inline-flex items-center gap-1 font-medium text-warning">
                            <Zap className="h-3 w-3 fill-warning" aria-hidden /> {p.reward_note}
                          </span>
                        )}
                        {p.cadence && <span>{p.cadence}</span>}
                        <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> {p.adopters}</span>
                        <span className="inline-flex items-center gap-1"><Flame className="h-3 w-3" /> {p.logs_total}</span>
                      </>
                    }
                    action={isAdmin ? <PracticeAdminMenu practiceId={p.id} isTemplate={p.is_template} isPublic={p.is_public} /> : undefined}
                    footer={footer}
                  />
                </li>
              )
            })}
          </ul>

          {result.pageCount > 1 && (
            <nav className="mt-6 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-sm">
              <span className="text-subtle">
                {(from + 1).toLocaleString()}–{(from + result.rows.length).toLocaleString()} of {result.total.toLocaleString()}
              </span>
              <div className="flex items-center gap-2">
                {page > 1 ? (
                  <Link href={href({ page: page - 1 })} className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-3 py-2 font-semibold text-text hover:bg-surface-elevated">
                    <ChevronLeft className="h-4 w-4" /> Prev
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-subtle opacity-50">
                    <ChevronLeft className="h-4 w-4" /> Prev
                  </span>
                )}
                <span className="whitespace-nowrap text-subtle">Page {page} of {result.pageCount}</span>
                {page < result.pageCount ? (
                  <Link href={href({ page: page + 1 })} className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-3 py-2 font-semibold text-text hover:bg-surface-elevated">
                    Next <ChevronRight className="h-4 w-4" />
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-subtle opacity-50">
                    Next <ChevronRight className="h-4 w-4" />
                  </span>
                )}
              </div>
            </nav>
          )}
        </>
      )}
    </section>
  )
}
