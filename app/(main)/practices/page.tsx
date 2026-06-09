import Link from 'next/link'
import {
  Flame, Sparkles, Library, Zap, Pencil, Wand2, Users, Search,
  ChevronLeft, ChevronRight, EyeOff, X,
} from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import {
  searchLibraryPractices,
  countPublicPractices,
  listSubcategories,
  listCanonicalTags,
  getMemberPractices,
  getRecentPracticeLogs,
  type Practice,
  type PracticeSort,
} from '@/lib/practices'
import { getPillars, pillarsById, type Pillar } from '@/lib/pillars'
import { getGlobalCapabilities } from '@/lib/core/load-capabilities'
import { LogPracticeButton } from '@/components/practice/log-practice-button'
import { AdoptPracticeButton } from '@/components/practice/adopt-practice-button'
import { NewPracticeButton } from '@/components/studio/practice/new-practice-button'
import { PillarBadge } from '@/components/practice/pillar-badge'
import { PracticeAdminMenu } from '@/components/practice/practice-admin-menu'
import { EntityCard } from '@/components/cards/entity-card'
import { IndexTemplate } from '@/components/templates/index-template'
import { PageContents } from '@/components/templates/page-contents'
import { StatStrip } from '@/components/ui/page-header'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { demoModeEnabled } from '@/lib/platform-flags'
import { viewerHidesDemo } from '@/lib/demo-preference'
import { resolvePageContent, pageContentMetadata } from '@/lib/page-content'

// Coded defaults for the operator-editable header content (ADR-180).
const CONTENT_FALLBACK = {
  title: 'Practices',
  description: 'This is where the points come from — a growing community library. Adopt or claim a practice, then log it every day to earn zaps, climb the ranks, and keep your streak alive.',
}

// Operator-set title/description also drive <title> + og/twitter cards (PX.2);
// the fallback strings are the page's previous static metadata, unchanged.
export function generateMetadata() {
  return pageContentMetadata('/practices', {
    title: 'Practices',
    description: 'Browse the community practice library — adopt one and log it to build your streak.',
  })
}

const PAGE_SIZE = 24
const SORTS: { key: PracticeSort; label: string }[] = [
  { key: 'trending', label: 'Trending' },
  { key: 'top', label: 'All-time' },
  { key: 'new', label: 'New' },
  { key: 'az', label: 'A–Z' },
]

// --- "Your practices" row (the personal column keeps the readable list) -----
function PracticeMeta({ p }: { p: { category: string | null; cadence: string | null; reward_note: string | null } }) {
  if (!p.category && !p.cadence && !p.reward_note) return null
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      {p.category && (
        <span className="rounded-full bg-surface-elevated px-2 py-0.5 font-medium capitalize text-subtle">
          {p.category.replace(/-/g, ' ')}
        </span>
      )}
      {p.cadence && <span className="text-subtle">{p.cadence}</span>}
      {p.reward_note && (
        <span className="inline-flex items-center gap-1 font-medium text-warning">
          <Zap className="h-3 w-3 fill-warning" aria-hidden />
          {p.reward_note}
        </span>
      )}
    </div>
  )
}

function MineRow({ p, byId, profileId }: { p: Practice; byId: Map<string, Pillar>; profileId: string }) {
  return (
    <li className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface px-5 py-4 shadow-sm transition-colors hover:border-primary-bg hover:shadow-md">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/practices/${p.id}`} className="text-base font-bold text-text hover:text-primary-strong hover:underline">
            {p.title}
          </Link>
          {p.domain_id && byId.has(p.domain_id) && <PillarBadge name={byId.get(p.domain_id)!.name} />}
        </div>
        {(p.summary ?? p.description) && (
          <p className="mt-0.5 line-clamp-1 text-sm leading-relaxed text-muted">{p.summary ?? p.description}</p>
        )}
        <PracticeMeta p={p} />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {p.created_by === profileId && (
          <Link
            href={`/practices/${p.id}/edit`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:bg-surface-elevated"
          >
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Link>
        )}
        <LogPracticeButton practiceId={p.id} />
        <AdoptPracticeButton practiceId={p.id} adopted />
      </div>
    </li>
  )
}

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

export default async function PracticesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string; pillar?: string; sub?: string; tag?: string; sort?: string; page?: string; hidden?: string
  }>
}) {
  const sp = await searchParams
  const sort: PracticeSort =
    sp.sort === 'top' || sp.sort === 'new' || sp.sort === 'az' ? sp.sort : 'trending'
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1)
  const qParam = sp.q?.trim() || ''

  const profileId = await getMyProfileId()
  const caps = await getGlobalCapabilities()
  const isAdmin = caps.has('admin.access')
  const showHidden = isAdmin && sp.hidden === '1'

  const [pillars, subcategories, tags, mine, recent] = await Promise.all([
    getPillars(),
    listSubcategories(),
    listCanonicalTags(),
    profileId ? getMemberPractices(profileId) : Promise.resolve([]),
    profileId ? getRecentPracticeLogs(profileId, 60) : Promise.resolve([]),
  ])
  const byId = pillarsById(pillars)
  const mineIds = new Set(mine.map((p) => p.id))

  // Pillar → sub-category facets (URL-driven, shareable).
  const activePillar = pillars.find((p) => p.slug === sp.pillar) ?? null
  const pillarSubs = activePillar ? subcategories.filter((s) => s.domain_id === activePillar.id) : []
  const activeSub = pillarSubs.find((s) => s.slug === sp.sub) ?? null

  const hideDemo = !(await demoModeEnabled()) || (await viewerHidesDemo())

  const [result, libraryTotal] = await Promise.all([
    searchLibraryPractices({
      q: qParam,
      pillarId: activePillar?.id ?? null,
      subId: activeSub?.id ?? null,
      tag: sp.tag ?? null,
      sort,
      page,
      pageSize: PAGE_SIZE,
      hideDemo,
      includeHidden: showHidden,
    }),
    countPublicPractices({ hideDemo }),
  ])

  // Activity strip (last 14 days).
  const loggedDays = new Set(recent.map((r) => r.logged_for))
  const today = new Date()
  const last14 = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() - (13 - i))
    return d.toISOString().slice(0, 10)
  })
  const daysLogged = last14.filter((d) => loggedDays.has(d)).length

  const base = {
    q: qParam || undefined,
    pillar: sp.pillar || undefined,
    sub: sp.sub || undefined,
    tag: sp.tag || undefined,
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
  const hasFilters = !!(qParam || activePillar || activeSub || sp.tag)

  // Operator-editable page header (ADR-180) — falls back to the coded defaults.
  const { title, description, heroImage, ctaLabel, ctaHref } =
    await resolvePageContent('/practices', CONTENT_FALLBACK)

  return (
    <IndexTemplate
      title={title}
      description={description}
      action={
        (profileId || (ctaLabel && ctaHref)) ? (
          <div className="flex items-center gap-2">
            {profileId && <NewPracticeButton />}
            {/* Operator-set CTA (PX.1) — shows only when both label + link are set. */}
            {ctaLabel && ctaHref && (
              <a
                href={ctaHref}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary-hover"
              >
                {ctaLabel}
              </a>
            )}
          </div>
        ) : undefined
      }
      toolbar={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Search (GET form — shareable, no client JS) */}
          <form action="/practices" method="get" className="relative w-full sm:max-w-xs">
            {sp.pillar && <input type="hidden" name="pillar" value={sp.pillar} />}
            {sp.sub && <input type="hidden" name="sub" value={sp.sub} />}
            {sp.tag && <input type="hidden" name="tag" value={sp.tag} />}
            {sort !== 'trending' && <input type="hidden" name="sort" value={sort} />}
            {showHidden && <input type="hidden" name="hidden" value="1" />}
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
            <input
              name="q"
              defaultValue={qParam}
              placeholder="Search practices…"
              className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm text-text placeholder:text-subtle focus:border-border-strong focus:outline-none"
            />
          </form>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-medium uppercase tracking-wide text-subtle">Sort</span>
            {SORTS.map((s) => (
              <Chip key={s.key} label={s.label} href={href({ sort: s.key === 'trending' ? undefined : s.key, page: undefined })} active={sort === s.key} />
            ))}
            {isAdmin && (
              <Link
                href={href({ hidden: showHidden ? undefined : '1', page: undefined })}
                className={`ml-1 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  showHidden ? 'bg-danger/10 text-danger' : 'bg-surface-elevated text-muted hover:text-text'
                }`}
                title="Admin: include hidden practices"
              >
                <EyeOff className="h-3.5 w-3.5" /> {showHidden ? 'Hidden shown' : 'Show hidden'}
              </Link>
            )}
          </div>
        </div>
      }
    >
      {/* Operator-set hero banner (PX.1) — renders only when set. */}
      {heroImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={heroImage}
          alt=""
          className="mb-6 h-44 w-full rounded-2xl border border-border object-cover sm:h-56"
        />
      )}

      <StatStrip
        items={[
          { value: mine.length, label: 'Your practices' },
          { value: daysLogged, label: 'Days logged (14d)' },
          { value: libraryTotal, label: 'In the library' },
        ]}
      />

      {/* Table of contents — jump between your stuff and the library. Built from
          whichever sections actually render (new members only see the library). */}
      <PageContents
        sections={[
          ...(profileId && (recent.length > 0 || mine.length > 0)
            ? [{ id: 'practices-activity', label: 'Your activity' }]
            : []),
          ...(profileId && mine.length > 0
            ? [{ id: 'practices-mine', label: 'Your practices', count: mine.length }]
            : []),
          { id: 'practices-library', label: 'Library', count: result.total },
        ]}
      />

      {/* Personal column: your activity + your practices (readable width). */}
      <div className="max-w-2xl space-y-8">
        {profileId && (recent.length > 0 || mine.length > 0) && (
          <section id="practices-activity" className="scroll-mt-20">
            <SectionHeader title="Your activity" />
            <div>
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-sm text-muted">
                  <Flame className="h-4 w-4 text-primary" />Last 14 days
                </span>
                <span className="text-sm font-semibold text-text">
                  {daysLogged} {daysLogged === 1 ? 'day' : 'days'} practiced
                </span>
              </div>
              <div className="flex gap-1.5">
                {last14.map((d) => (
                  <div
                    key={d}
                    title={d}
                    className={`h-7 flex-1 rounded-lg ${loggedDays.has(d) ? 'bg-primary' : 'border border-border bg-surface'}`}
                  />
                ))}
              </div>
            </div>
          </section>
        )}

        {profileId && mine.length > 0 && (
          <section id="practices-mine" className="scroll-mt-20">
            <SectionHeader title="Your practices" count={mine.length} />
            <ul className="space-y-3">
              {mine.map((p) => (
                <MineRow key={p.id} p={p} byId={byId} profileId={profileId} />
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* The library — full-width, paginated, filterable grid. */}
      <section id="practices-library" className="mt-8 scroll-mt-20">
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
              <Chip label="All tags" href={href({ tag: undefined, page: undefined })} active={!sp.tag} />
              {tags.map((t) => (
                <Chip key={t.slug} label={`#${t.label}`} href={href({ tag: t.slug, page: undefined })} active={sp.tag === t.slug} />
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
            description={hasFilters ? 'Try a different search, Pillar, or tag.' : 'Check back soon — practices are on their way.'}
          />
        ) : (
          <>
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {result.rows.map((p) => {
                const pillarName = p.domain_id ? byId.get(p.domain_id)?.name ?? null : null
                const context = [pillarName, p.subcategory?.name, p.category?.replace(/-/g, ' ')].filter(Boolean).join(' · ')
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
                            <Sparkles className="h-5 w-5" />
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
                      action={
                        (profileId || isAdmin) && (
                          <div className="flex items-center gap-1">
                            {profileId && <AdoptPracticeButton practiceId={p.id} adopted={mineIds.has(p.id)} />}
                            {isAdmin && <PracticeAdminMenu practiceId={p.id} isTemplate={p.is_template} isPublic={p.is_public} />}
                          </div>
                        )
                      }
                    />
                  </li>
                )
              })}
            </ul>

            {result.pageCount > 1 && (
              <nav className="mt-6 flex items-center justify-between gap-3 text-sm">
                <span className="text-subtle">
                  {(from + 1).toLocaleString()}–{(from + result.rows.length).toLocaleString()} of {result.total.toLocaleString()}
                </span>
                <div className="flex items-center gap-2">
                  {page > 1 ? (
                    <Link href={href({ page: page - 1 })} className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-3 py-1.5 font-semibold text-text hover:bg-surface-elevated">
                      <ChevronLeft className="h-4 w-4" /> Prev
                    </Link>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-subtle opacity-50">
                      <ChevronLeft className="h-4 w-4" /> Prev
                    </span>
                  )}
                  <span className="text-subtle">Page {page} of {result.pageCount}</span>
                  {page < result.pageCount ? (
                    <Link href={href({ page: page + 1 })} className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-3 py-1.5 font-semibold text-text hover:bg-surface-elevated">
                      Next <ChevronRight className="h-4 w-4" />
                    </Link>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-subtle opacity-50">
                      Next <ChevronRight className="h-4 w-4" />
                    </span>
                  )}
                </div>
              </nav>
            )}
          </>
        )}
      </section>
    </IndexTemplate>
  )
}
