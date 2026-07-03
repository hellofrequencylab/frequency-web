import Link from 'next/link'
import { Images, Search, LayoutGrid, List } from 'lucide-react'
import { AdminTemplate, AdminSection, RailGrid } from '@/components/templates'
import {
  splashTemplates,
  listLiveSplashes,
  listSplashUsages,
  type LiveSplash,
  type SplashUsage,
} from '@/lib/library/splash-registry'
import { SplashRail } from '@/components/admin/library/splash-rail'
import {
  SplashLane,
  type SplashTemplateCard,
  type LiveSplashCard,
} from '@/components/admin/library/splash-lane'

// The Loom Studio Splash lane view (docs/LOOM-PLATFORM.md §4, docs/PAGE-FRAMEWORK.md §10). Rendered
// when ?lane=splash. Server Component: it resolves the splash CATALOG (code templates + a schematic
// preview) and the GOVERNANCE list (live splashes across public.pages + qr_codes), then hands plain
// rows + preview nodes to the client lane. Staff-gated by the page (requireAdmin) that mounts it, and
// the registry reads RE-CHECK the staff gate (fail-closed).
//
// 🔴 §10 BOUNDARY: this lane never edits a splash block tree. Templates deep-link OUT to the real
// editor; live splashes carry an Edit link OUT (Puck micro-site editor / QR studio). No splash is a
// module route, no <PageModules> renders on a public splash, no splash is registered as an App.

const SPLASH_VIEWS: { value: 'cards' | 'list'; label: string; Icon: typeof LayoutGrid }[] = [
  { value: 'cards', label: 'Cards', Icon: LayoutGrid },
  { value: 'list', label: 'List', Icon: List },
]

const SECTIONS = ['templates', 'live', 'micro', 'qr'] as const
type Section = '' | (typeof SECTIONS)[number]

/** A flat, warm splash-landing schematic in the Loom design language (DAWN token fills only, no hex,
 *  no <text>): a hero band, a headline + subhead, and a single call-to-action button. Stands in for a
 *  splash template preview without pulling the marketing render graph server-side. */
function SplashSchematic() {
  return (
    <svg viewBox="0 0 240 150" className="h-full w-auto" role="img" aria-hidden focusable="false">
      <rect x="24" y="16" width="192" height="118" rx="18" className="fill-surface stroke-border-strong" strokeWidth="2" />
      {/* Hero band. */}
      <rect x="24" y="16" width="192" height="52" rx="18" className="fill-primary-bg" />
      <rect x="24" y="52" width="192" height="16" className="fill-primary-bg" />
      {/* Headline + subhead lines. */}
      <rect x="72" y="30" width="96" height="9" rx="4.5" className="fill-primary" />
      <rect x="88" y="45" width="64" height="5" rx="2.5" className="fill-border-strong" opacity="0.5" />
      {/* CTA button. */}
      <rect x="98" y="80" width="44" height="14" rx="7" className="fill-primary" />
      {/* Two content cards below the fold. */}
      <rect x="40" y="104" width="76" height="20" rx="10" className="fill-surface-elevated stroke-border" strokeWidth="1.5" />
      <rect x="124" y="104" width="76" height="20" rx="10" className="fill-surface-elevated stroke-border" strokeWidth="1.5" />
    </svg>
  )
}

/** Map a live splash to its where-referenced lookup key for the "Used in" index. Micro-site splashes
 *  are `public.pages` rows, so they resolve against the `page` context by slug. QR splashes are not
 *  tracked in the library_usages index (its contexts are page/space_brand/spotlight/email/other), so
 *  they have no lookup and show an empty "Used in". */
function liveUsageRef(live: LiveSplash): { refId: string; context: string } | null {
  if (live.source === 'micro-site' && live.id.startsWith('page:')) {
    return { refId: live.id.slice('page:'.length), context: 'page' }
  }
  return null
}

export async function SplashLaneView({
  q = '',
  section: rawSection = '',
  view: rawView = '',
}: {
  q?: string
  section?: string
  view?: string
}) {
  const templatesAll = splashTemplates()
  // Resolve the "Used in" index (public.library_usages) for each code template by its sourceSlug.
  // Template lookups are known synchronously from the code catalog, so they fan out ALONGSIDE the
  // live read; the live-splash lookups depend on the resolved live rows, so they follow.
  const [liveAll, templateUsagesList] = await Promise.all([
    listLiveSplashes(),
    Promise.all(
      templatesAll.map((t) =>
        t.sourceSlug ? listSplashUsages(t.sourceSlug, 'page') : Promise.resolve<SplashUsage[]>([]),
      ),
    ),
  ])
  const liveUsagesList = await Promise.all(
    liveAll.map((l) => {
      const ref = liveUsageRef(l)
      return ref ? listSplashUsages(ref.refId, ref.context) : Promise.resolve<SplashUsage[]>([])
    }),
  )
  const usagesByTemplateId = new Map<string, SplashUsage[]>()
  templatesAll.forEach((t, i) => usagesByTemplateId.set(t.id, templateUsagesList[i] ?? []))
  const usagesByLiveId = new Map<string, SplashUsage[]>()
  liveAll.forEach((l, i) => usagesByLiveId.set(l.id, liveUsagesList[i] ?? []))

  const query = q.trim().toLowerCase()
  const section: Section = (SECTIONS as readonly string[]).includes(rawSection) ? (rawSection as Section) : ''
  const view = SPLASH_VIEWS.find((v) => v.value === rawView)?.value ?? 'cards'

  // Counts are over the UNFILTERED sets (the rail always shows the full picture).
  const counts = {
    templates: templatesAll.length,
    micro: liveAll.filter((l) => l.source === 'micro-site').length,
    qr: liveAll.filter((l) => l.source === 'qr').length,
  }

  // Search narrows both halves; the section folder decides which halves the lane renders.
  const matchTemplate = (t: (typeof templatesAll)[number]) =>
    !query || `${t.title} ${t.description}`.toLowerCase().includes(query)
  const matchLive = (l: (typeof liveAll)[number]) =>
    !query || `${l.title} ${l.target ?? ''} ${l.status}`.toLowerCase().includes(query)

  const templates: SplashTemplateCard[] = templatesAll
    .filter(matchTemplate)
    .map((t) => ({ ...t, preview: <SplashSchematic />, usages: usagesByTemplateId.get(t.id) ?? [] }))
  const live: LiveSplashCard[] = liveAll
    .filter(matchLive)
    .map((l) => ({ ...l, usages: usagesByLiveId.get(l.id) ?? [] }))

  const show =
    section === 'templates' ? 'templates'
    : section === 'live' ? 'live'
    : section === 'micro' ? 'micro'
    : section === 'qr' ? 'qr'
    : 'all'

  const activeLabel =
    section === 'templates' ? 'Templates'
    : section === 'micro' ? 'Micro-site splashes'
    : section === 'qr' ? 'QR splashes'
    : section === 'live' ? 'Live splashes'
    : 'All splashes'

  const visibleCount =
    (show === 'all' || show === 'templates' ? templates.length : 0) +
    (show === 'all' || show === 'live' ? live.length
      : show === 'qr' ? live.filter((l) => l.source === 'qr').length
      : show === 'micro' ? live.filter((l) => l.source === 'micro-site').length
      : 0)

  const hrefWith = (patch: Record<string, string | undefined>) => {
    const cur: Record<string, string> = { lane: 'splash' }
    if (q) cur.q = q
    if (section) cur.section = section
    if (view !== 'cards') cur.view = view
    const merged = { ...cur, ...patch }
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(merged)) {
      if (v === undefined || v === '') continue
      params.set(k, v)
    }
    return `/admin/library?${params.toString()}`
  }

  return (
    <AdminTemplate
      title="Loom Studio"
      icon={Images}
      eyebrow="Splash"
      description="Browse the splash catalog and govern the live ones. Editing opens the real editor: the page editor for a micro-site, the QR studio for a QR splash."
      width="wide"
    >
      <AdminSection>
        <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="flex items-baseline gap-2">
            <h2 className="font-display text-lg uppercase text-text">{activeLabel}</h2>
            <span className="text-sm text-subtle">
              {visibleCount} item{visibleCount === 1 ? '' : 's'}
            </span>
          </div>

          {/* Search (GET form). Hidden inputs preserve the active folder + view. */}
          <form className="flex flex-1 flex-wrap items-center justify-end gap-2" action="/admin/library" method="get">
            <input type="hidden" name="lane" value="splash" />
            {section && <input type="hidden" name="section" value={section} />}
            {view !== 'cards' && <input type="hidden" name="view" value={view} />}
            <span className="relative min-w-[180px] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
              <input
                type="search"
                name="q"
                defaultValue={q}
                placeholder="Search splashes…"
                className="w-full rounded-2xl border border-border bg-surface py-2 pl-9 pr-3 text-sm"
              />
            </span>
            <button
              type="submit"
              className="rounded-2xl border border-border-strong px-4 py-2 text-sm font-semibold text-text hover:bg-surface-elevated"
            >
              Apply
            </button>

            <div className="ml-1 flex items-center rounded-2xl border border-border p-0.5">
              {SPLASH_VIEWS.map(({ value, label, Icon }) => (
                <Link
                  key={value}
                  href={hrefWith({ view: value === 'cards' ? undefined : value })}
                  aria-label={`${label} view`}
                  aria-current={view === value ? 'true' : undefined}
                  className={`rounded-[14px] p-1.5 ${
                    view === value ? 'bg-primary text-on-primary' : 'text-subtle hover:bg-surface-elevated'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </Link>
              ))}
            </div>
          </form>
        </div>

        <RailGrid
          menu={<SplashRail counts={counts} active={{ section }} base={{ q, view }} />}
        >
          <SplashLane templates={templates} live={live} show={show} view={view} />
        </RailGrid>
      </AdminSection>
    </AdminTemplate>
  )
}
