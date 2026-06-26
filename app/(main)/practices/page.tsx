import Link from 'next/link'
import { Search, EyeOff } from 'lucide-react'
import { getMyProfileId, getCallerProfile } from '@/lib/auth'
import { atLeastRole } from '@/lib/core/roles'
import { BETA_OPEN_ACCESS } from '@/lib/core/beta'
import { type PracticeSort } from '@/lib/practices'
import { getGlobalCapabilities } from '@/lib/core/load-capabilities'
import { NewPracticeButton } from '@/components/studio/practice/new-practice-button'
import { IndexTemplate } from '@/components/templates/index-template'
import { PageContents } from '@/components/templates/page-contents'
import { PageModules } from '@/components/widgets/page-modules'
import { resolvePageContent, pageContentMetadata } from '@/lib/page-content'
import { getPageHeaderImage } from '@/lib/page-settings/store'

// Practices (ADR-270/294). The whole interior is module-driven: the personal blocks (stats ·
// activity · Pillar balance · your practices) AND the faceted Practice Library are layout modules
// arranged by the operator (Settings ▾ → Page → Layout). The library is URL-driven; it reads the
// page's facets from the `x-search` request header (proxy.ts), since searchParams are a page prop a
// nested module never receives. This page keeps only the header + the search/sort toolbar (which
// WRITE those facets into the URL) and then renders <PageModules>.

// Coded defaults for the operator-editable header content (ADR-180).
const CONTENT_FALLBACK = {
  title: 'Practices',
  description: 'This is where the Zaps come from: a growing community library. Adopt or claim a practice, then log it every day to earn Zaps and keep your streak alive.',
}

// Operator-set title/description also drive <title> + og/twitter cards (PX.2);
// the fallback strings are the page's previous static metadata, unchanged.
export function generateMetadata() {
  return pageContentMetadata('/practices', {
    title: 'Practices',
    description: 'Browse the community practice library, adopt one, and log it to build your streak.',
  })
}

const SORTS: { key: PracticeSort; label: string }[] = [
  { key: 'trending', label: 'Trending' },
  { key: 'top', label: 'All-time' },
  { key: 'new', label: 'New' },
  { key: 'az', label: 'A-Z' },
]

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
  const qParam = sp.q?.trim() || ''

  const profileId = await getMyProfileId()
  const caller = await getCallerProfile()
  const caps = await getGlobalCapabilities()
  const isAdmin = caps.has('admin.access')
  const showHidden = isAdmin && sp.hidden === '1'
  // Authoring a library practice is a Crew+ act (ADR-109): a plain Member may adopt/claim/log
  // but never create. Hide the entry point for Members; the server action is the real gate.
  // BETA open access (lib/core/beta.ts): any signed-in member may author (kept pending for Host+
  // review), so the entry point shows for everyone signed in while the flag is on.
  const canCreatePractice = !!caller && (BETA_OPEN_ACCESS || atLeastRole(caller.community_role, 'crew'))

  // The toolbar writes the facets the library module reads back from the URL.
  const base = {
    q: qParam || undefined,
    pillar: sp.pillar || undefined,
    sub: sp.sub || undefined,
    tag: sp.tag || undefined,
    sort: sort !== 'trending' ? sort : undefined,
    hidden: showHidden ? '1' : undefined,
  }
  function href(over: Partial<typeof base>): string {
    const m = { ...base, ...over }
    const u = new URLSearchParams()
    if (m.q) u.set('q', m.q)
    if (m.pillar) u.set('pillar', m.pillar)
    if (m.sub) u.set('sub', m.sub)
    if (m.tag) u.set('tag', m.tag)
    if (m.sort) u.set('sort', m.sort)
    if (m.hidden) u.set('hidden', m.hidden)
    const s = u.toString()
    return s ? `/practices?${s}` : '/practices'
  }

  // Operator-editable page header (ADR-180) — falls back to the coded defaults.
  const { title, description, heroImage: contentHero, ctaLabel, ctaHref } =
    await resolvePageContent('/practices', CONTENT_FALLBACK)
  // The wide header banner can be set from EITHER the Settings header image (page_settings) OR the
  // older page-content hero (ADR-180). Prefer the new uploader, then fall back to the page-content
  // hero so an image set there actually shows (it was being dropped — the page read only the
  // page_settings field), mirroring how /journeys resolves its banner.
  const heroImage = (await getPageHeaderImage('/practices')) ?? contentHero

  return (
    <IndexTemplate
      title={title}
      description={description}
      action={
        (canCreatePractice || (ctaLabel && ctaHref)) ? (
          <div className="flex items-center gap-2">
            {canCreatePractice && <NewPracticeButton />}
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
              <Chip key={s.key} label={s.label} href={href({ sort: s.key === 'trending' ? undefined : s.key })} active={sort === s.key} />
            ))}
            {isAdmin && (
              <Link
                href={href({ hidden: showHidden ? undefined : '1' })}
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
      trail={[
        { href: '/network', label: 'Community' },
        { href: '/practices', label: 'Practices' },
      ]}
      heroImage={heroImage}
    >
      {/* Jump between your stuff and the library. The personal entries point at module-driven
          blocks that render only for a signed-in member with data; a dangling anchor is harmless
          when a block returns null. */}
      <PageContents
        sections={[
          ...(profileId
            ? [
                { id: 'practices-activity', label: 'Your activity' },
                { id: 'practices-mine', label: 'Your practices' },
              ]
            : []),
          { id: 'practices-library', label: 'Library' },
        ]}
      />

      {/* The whole interior — personal blocks AND the faceted library — is module-driven and
          arranged by the operator. Each block self-fetches and sizes to the slot it lands in. */}
      <div className="space-y-8">
        <PageModules route="/practices" />
      </div>
    </IndexTemplate>
  )
}
