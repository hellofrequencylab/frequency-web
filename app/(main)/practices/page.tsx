import type { Metadata } from 'next'
import Link from 'next/link'
import { Flame, Sparkles, Library, Zap, Pencil, Wand2 } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { forkPracticeAction } from './actions'
import {
  listPublicPractices,
  listSubcategories,
  getMemberPractices,
  getRecentPracticeLogs,
  type Practice,
  type PracticeTag,
  type PracticeSort,
} from '@/lib/practices'
import { getPillars, pillarsById, type Pillar } from '@/lib/pillars'
import { LogPracticeButton } from '@/components/practice/log-practice-button'
import { AdoptPracticeButton } from '@/components/practice/adopt-practice-button'
import { CreatePracticeForm } from '@/components/practice/create-practice-form'
import { PillarBadge } from '@/components/practice/pillar-badge'
import { IndexTemplate } from '@/components/templates/index-template'
import { StatStrip } from '@/components/ui/page-header'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { DemoBadge } from '@/components/ui/demo-badge'
import { demoModeEnabled } from '@/lib/platform-flags'
import { viewerHidesDemo } from '@/lib/demo-preference'

export const metadata: Metadata = {
  title: 'Practices',
  description: 'Choose what you practice and log it to build your streak.',
}

// Small meta row under a practice: category chip · cadence · reward note.
function PracticeMeta({
  p,
}: {
  p: { category: string | null; cadence: string | null; reward_note: string | null }
}) {
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

// One library/owned practice, in the shared warm card shell. Not routed through
// EntityCard because practices have no public detail page yet (only /[id]/edit,
// owner-only) — so the whole card can't be a single link. The action slot holds
// the interactive controls (Edit / Log / Adopt / Customize), which the caller
// passes in. Demo practices are badged + receded, matching the EntityCard look.
function PracticeRow({
  p,
  byId,
  isDemo = false,
  subcategory = null,
  tags = [],
  actions,
}: {
  p: Practice
  byId: Map<string, Pillar>
  isDemo?: boolean
  subcategory?: { slug: string; name: string } | null
  tags?: PracticeTag[]
  actions: React.ReactNode
}) {
  return (
    <li
      className={`flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface px-5 py-4 shadow-sm transition-colors hover:border-primary-bg hover:shadow-md ${
        isDemo ? 'opacity-[0.72]' : ''
      }`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-base font-bold text-text">{p.title}</p>
          {p.domain_id && byId.has(p.domain_id) && <PillarBadge name={byId.get(p.domain_id)!.name} />}
          {subcategory && (
            <span className="rounded-full bg-primary-bg px-2 py-0.5 text-xs font-medium text-primary-strong">
              {subcategory.name}
            </span>
          )}
          {isDemo && <DemoBadge />}
        </div>
        {(p.summary ?? p.description) && (
          <p className="mt-0.5 line-clamp-2 text-sm leading-relaxed text-muted">
            {p.summary ?? p.description}
          </p>
        )}
        <PracticeMeta p={p} />
        {tags.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {tags.map((t) => (
              <span key={t.slug} className="rounded-full bg-surface-elevated px-2 py-0.5 text-xs text-subtle">
                #{t.label}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">{actions}</div>
    </li>
  )
}

function PillarFilterChip({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      scroll={false}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? 'bg-primary-bg text-primary-strong'
          : 'bg-surface-elevated text-muted hover:text-text'
      }`}
    >
      {label}
    </Link>
  )
}

// Build a shareable library URL from the active filter/sort state (no client JS).
function libHref({ pillar, sub, sort }: { pillar?: string | null; sub?: string | null; sort?: string }) {
  const q = new URLSearchParams()
  if (pillar) q.set('pillar', pillar)
  if (sub) q.set('sub', sub)
  if (sort && sort !== 'trending') q.set('sort', sort)
  const s = q.toString()
  return s ? `/practices?${s}` : '/practices'
}

export default async function PracticesPage({
  searchParams,
}: {
  searchParams: Promise<{ pillar?: string; sub?: string; sort?: string }>
}) {
  const { pillar: pillarParam, sub: subParam, sort: sortParam } = await searchParams
  const sort: PracticeSort = sortParam === 'top' || sortParam === 'new' ? sortParam : 'trending'

  const profileId = await getMyProfileId()
  const [library, mine, recent, pillars, subcategories] = await Promise.all([
    listPublicPractices(sort),
    profileId ? getMemberPractices(profileId) : Promise.resolve([]),
    profileId ? getRecentPracticeLogs(profileId, 60) : Promise.resolve([]),
    getPillars(),
    listSubcategories(),
  ])
  const byId = pillarsById(pillars)
  const mineIds = new Set(mine.map((p) => p.id))

  // Honour the header's Demo toggle for the public library: hide seeded demo
  // practices when global demo_mode is off OR this viewer turned demo off. The
  // `practices` table carries is_demo, but lib/practices doesn't select it, so we
  // resolve the demo ids in one cheap admin read and filter/badge the library by
  // them. (mine/recent are the member's own — never demo — so they're untouched.)
  const hideDemo = !(await demoModeEnabled()) || (await viewerHidesDemo())
  const { data: demoRows } = await createAdminClient()
    .from('practices')
    .select('id')
    .eq('is_demo', true)
  const demoIds = new Set((demoRows ?? []).map((r) => r.id as string))

  // Library filters by Pillar → sub-category (URL-driven, shareable, no client JS).
  const activePillar = pillars.find((p) => p.slug === pillarParam)?.id ?? null
  const pillarSubs = activePillar ? subcategories.filter((s) => s.domain_id === activePillar) : []
  const activeSubSlug = pillarSubs.some((s) => s.slug === subParam) ? subParam : null
  const unadopted = library
    .filter((p) => !mineIds.has(p.id))
    .filter((p) => !activePillar || p.domain_id === activePillar)
    .filter((p) => !activeSubSlug || p.subcategory?.slug === activeSubSlug)
    .filter((p) => !hideDemo || !demoIds.has(p.id))

  // Last 14 days as a simple activity strip (filled = logged a practice that day).
  const loggedDays = new Set(recent.map((r) => r.logged_for))
  const today = new Date()
  const last14 = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() - (13 - i))
    return d.toISOString().slice(0, 10)
  })
  const daysLogged = last14.filter((d) => loggedDays.has(d)).length

  // Library count for the stat strip — exclude demo when the viewer hides it so
  // the number matches what they actually see below.
  const libraryCount = hideDemo ? library.filter((p) => !demoIds.has(p.id)).length : library.length

  return (
    <IndexTemplate
      title="Practices"
      description="This is where the points come from. A practice is the thing you actually do — adopt one, then log it every day to earn zaps, climb the ranks, and keep your streak alive."
    >
      <StatStrip
        items={[
          { value: mine.length, label: 'Your practices' },
          { value: daysLogged, label: 'Days logged (14d)' },
          { value: libraryCount, label: 'In the library' },
        ]}
      />

      <div className="max-w-2xl space-y-8">
        {profileId && (recent.length > 0 || mine.length > 0) && (
          <section>
            <SectionHeader title="Your activity" />
            {/* Grouped on the canvas (no box) — a widget, not a distinct object. */}
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
                    className={`h-7 flex-1 rounded-lg ${
                      loggedDays.has(d) ? 'bg-primary' : 'border border-border bg-surface'
                    }`}
                  />
                ))}
              </div>
              {recent.length > 0 && (
                <ul className="mt-4 space-y-1.5 border-t border-border pt-4">
                  {recent.slice(0, 5).map((r, i) => (
                    <li key={i} className="flex items-center justify-between text-sm">
                      <span className="text-text">{r.title ?? 'A practice'}</span>
                      <span className="tabular-nums text-subtle">{r.logged_for}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}

        <section>
          <SectionHeader title="Your practices" count={mine.length} />
          {mine.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title="Nothing adopted yet"
              description="Pick a practice from the library below to start earning zaps and building a streak."
            />
          ) : (
            <ul className="space-y-3">
              {mine.map((p) => (
                <PracticeRow
                  key={p.id}
                  p={p}
                  byId={byId}
                  actions={
                    <>
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
                    </>
                  }
                />
              ))}
            </ul>
          )}
        </section>

        <section>
          <SectionHeader title="Practice library" count={libraryCount} />

          {/* Sort + filter the library (Trending/All-time/New · Pillar · sub-category). */}
          <div className="mb-3 space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs font-medium uppercase tracking-wide text-subtle">Sort</span>
              {(['trending', 'top', 'new'] as const).map((s) => (
                <PillarFilterChip
                  key={s}
                  label={s === 'trending' ? 'Trending' : s === 'top' ? 'All-time' : 'New'}
                  href={libHref({ pillar: pillarParam, sub: activeSubSlug, sort: s })}
                  active={sort === s}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <PillarFilterChip label="All Pillars" href={libHref({ sort })} active={!activePillar} />
              {pillars.map((pl) => (
                <PillarFilterChip
                  key={pl.slug}
                  label={pl.name}
                  href={libHref({ pillar: pl.slug, sort })}
                  active={pillarParam === pl.slug}
                />
              ))}
            </div>
            {pillarSubs.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                <PillarFilterChip label="All" href={libHref({ pillar: pillarParam, sort })} active={!activeSubSlug} />
                {pillarSubs.map((s) => (
                  <PillarFilterChip
                    key={s.slug}
                    label={s.name}
                    href={libHref({ pillar: pillarParam, sub: s.slug, sort })}
                    active={subParam === s.slug}
                  />
                ))}
              </div>
            )}
          </div>

          {profileId && (
            <div className="mb-3">
              <CreatePracticeForm />
            </div>
          )}
          {unadopted.length === 0 ? (
            <EmptyState
              icon={Library}
              title="You've adopted everything"
              description="Every practice in the library is on your list. Nicely done."
            />
          ) : (
            <ul className="space-y-3">
              {unadopted.map((p) => (
                <PracticeRow
                  key={p.id}
                  p={p}
                  byId={byId}
                  isDemo={demoIds.has(p.id)}
                  subcategory={p.subcategory}
                  tags={p.tags}
                  actions={
                    <>
                      {profileId && (
                        <form action={forkPracticeAction.bind(null, p.id)}>
                          <button
                            type="submit"
                            title="Make your own editable copy"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:bg-surface-elevated"
                          >
                            <Wand2 className="h-3.5 w-3.5" /> Customize
                          </button>
                        </form>
                      )}
                      <AdoptPracticeButton practiceId={p.id} adopted={false} />
                    </>
                  }
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </IndexTemplate>
  )
}
