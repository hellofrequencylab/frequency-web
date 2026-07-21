import Link from 'next/link'
import { ArrowRight, Compass, SlidersHorizontal, Sparkles, Trash2 } from 'lucide-react'
import { SectionHeader } from '@/components/ui/section-header'
import { DangerDelete } from '@/components/admin/danger-delete'
import { deleteSpace } from '@/lib/spaces/provision'
import type { SpaceModule } from '@/lib/admin/modules/space-modules'
import type { AdminSlot } from '@/lib/admin/modules/registry'
import { SPACE_HUB_SECTIONS, sectionForModule, type SpaceHubSection } from '@/lib/admin/modules/space-hub'
import type { SpaceFunctionKey } from '@/lib/spaces/functions'
import { hrefForSurface, panelHrefForModule } from '@/lib/spaces/surface-hrefs'

// hrefForSurface was LIFTED to the pure lib module (lib/spaces/surface-hrefs.ts) so the client-side
// admin rail's Space link-rows (components/layout/settings-panel.tsx) can reuse the SAME map without
// dragging this Server Component's server deps (deleteSpace, DangerDelete) into the client bundle.
// Re-exported so every existing caller keeps importing it from './console' unchanged.
export { hrefForSurface }

// The render boundary for the Space owner console (ADR-441 EM1-3; MODULAR-MENU.md — P1, ADR-544). The page
// (an RSC) resolves the Space + gates server-side and hands this the gated MODULE manifest (P0's
// SPACE_MODULES, resolved by spaceModuleManifest + the authoritative canUse gate) plus the Mode emphasis
// list; this layer GROUPS the flat manifest into scannable clusters and binds each module to its on-page
// panel (Stage-D5 `?panel=` behavior, preserved) or its deep-editing route. P1 renders the SPACE menu from
// the module manifest instead of the legacy space surface spine (retired in P4, ADR-547), so the SERVICE
// SPLIT (7 independent
// commerce modules: Booking / Memberships / Donations / Enrollment / Tickets / Check in / Store) and the
// CRM CONSOLIDATION (one CRM module absorbing Vera autonomy + Pipeline) go live in the console. No feature
// is rebuilt: every section is a link into a working panel or sub-page.
//
// DESIGN:
//   • Identity LEADS, always, at the top — never demoted below the mode-emphasized modules (the bug the
//     old emphasis-reorder caused: it promoted bookings/CRM above the space's own identity).
//   • The console clusters by module SLOT into the SAME 7 member-facing groups the admin rail uses
//     (ADR-520, via the shared SPACE_GROUP_META): Identity · Page · Audience · Offerings & money · Reach ·
//     Growth · Danger — each a titled cluster of compact rows with the module's own icon.
//   • Mode is a SECONDARY signal: a module a Mode emphasizes gets a quiet "Suggested for your mode" tag
//     and sorts first WITHIN its group. Nothing is dropped; every gated module still appears.
//
// This is a Server Component (no client state needed): the sections are links, and the one interactive
// control (Danger's delete) is the existing client <DangerDelete> rendered with a bound server action.

// ── Grouping (pure metadata) ─────────────────────────────────────────────────────────────────────────
//
// The hub renders the module manifest into the FOUR browse categories (lib/admin/modules/space-hub.ts):
// Resonance · Marketing · Offerings & Money · Content & Programs, plus the header-level Profile & Settings
// surface. `groupForModule` below is the LEGACY 7-slot console grouping, retained only for the drift-guard
// tests + any caller that still reads the coarse spine slot; the live hub uses `sectionForModule`.

/**
 * The legacy console group a module clusters into (PURE). Superseded for rendering by `sectionForModule`
 * (space-hub.ts), but kept for the console drift-guard tests. Folds the finer engineering spine slots:
 * Practices/Journeys/Airwaves → `place`; Page/Settings → `basics`; Email → `reach`; Billing → `insights`.
 */
export function groupForModule(module: SpaceModule): AdminSlot {
  if (module.id === 'space.practices' || module.id === 'space.journeys' || module.id === 'space.airwaves') {
    return 'place' // the Content cluster
  }
  switch (module.slot) {
    case 'safety':
    case 'layout':
      return 'basics'
    case 'comms':
      return 'reach'
    case 'billing':
      return 'insights'
    default:
      return module.slot
  }
}

/** The per-Space FUNCTION a module gates on, or null for an always-on shell module (Identity / Page /
 *  Settings / Store / Danger). The single seam Mode emphasis reads. PURE. */
function functionForModule(module: SpaceModule): SpaceFunctionKey | null {
  return module.gate.kind === 'feature' ? module.gate.fn : null
}

/**
 * Is this module SUGGESTED by the Space's Mode? A module whose gate function appears in the Mode's
 * emphasis list gets the quiet "Suggested for your mode" tag and sorts first within its group. An
 * always-on module (no gate function) is never tagged. PURE, so the page can test it.
 */
export function isSuggestedByMode(
  module: SpaceModule,
  emphasis: readonly SpaceFunctionKey[],
): boolean {
  const fn = functionForModule(module)
  return fn !== null && emphasis.includes(fn)
}

/**
 * Order modules WITHIN a single group by Mode emphasis: a module the Mode emphasizes sorts ahead of one it
 * does not, ties keep their incoming (catalog) order via a stable sort. This is the ONLY place Mode
 * touches order — it reorders within a group, never across groups, so the Space group can never be
 * demoted below a mode-emphasized module. PURE.
 */
export function orderWithinGroupByEmphasis(
  modules: SpaceModule[],
  emphasis: readonly SpaceFunctionKey[],
): SpaceModule[] {
  if (emphasis.length === 0) return modules
  const rank = (m: SpaceModule): number => {
    const fn = functionForModule(m)
    if (!fn) return Number.MAX_SAFE_INTEGER
    const i = emphasis.indexOf(fn)
    return i === -1 ? Number.MAX_SAFE_INTEGER : i
  }
  return modules
    .map((m, idx) => ({ m, idx }))
    .sort((a, b) => {
      const ra = rank(a.m)
      const rb = rank(b.m)
      if (ra !== rb) return ra - rb
      return a.idx - b.idx
    })
    .map((w) => w.m)
}

// ── Access marking (Included / Freemium / Premium) ─────────────────────────────────────────────────────
//
// Each card carries a small BADGE (ADR-782) so the plan story is legible: what every Space gets, what is
// free with a cap, and what needs a paid plan. This is presentation only — it does NOT gate (gating lives
// in lib/pricing/gates.ts + the function registry). Token-clean (no hardcoded color). During the open beta
// every tool is usable regardless of badge; the badge previews the post-launch model.

type AccessLevel = NonNullable<SpaceModule['access']>

const ACCESS_META: Record<AccessLevel, { label: string; className: string; gloss: string }> = {
  included: {
    label: 'Included',
    className: 'border-border bg-surface-elevated text-subtle',
    gloss: 'Free for every space',
  },
  freemium: {
    label: 'Freemium',
    className: 'border-primary/30 bg-primary-bg text-primary-strong',
    gloss: 'Free with a cap a paid plan lifts',
  },
  premium: {
    label: 'Premium',
    className: 'border-signal/30 bg-signal-bg text-signal-strong',
    gloss: 'A paid plan or add-on',
  },
}

/** The access level a module advertises, defaulting to `included` when unset. PURE. */
function accessLevel(module: SpaceModule): AccessLevel {
  return module.access ?? 'included'
}

/** A small access pill (Included / Freemium / Premium). `compact` drops the text to a dot on nested rows. */
function AccessBadge({ level }: { level: AccessLevel }) {
  const meta = ACCESS_META[level]
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-2xs font-semibold ${meta.className}`}
      title={meta.gloss}
    >
      {meta.label}
    </span>
  )
}

/** The one-line legend above the board so the three markings are self-explaining. */
function AccessLegend() {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
      {(['included', 'freemium', 'premium'] as const).map((level) => (
        <span key={level} className="inline-flex items-center gap-1.5">
          <AccessBadge level={level} />
          <span>{ACCESS_META[level].gloss}</span>
        </span>
      ))}
    </div>
  )
}

// ── Rows ─────────────────────────────────────────────────────────────────────────────────────────────
//
// The console is a DENSE, CONSOLIDATED board: compact one-line link ROWS (icon + label, no per-card
// description, no per-group blurb) laid out in tight titled groups across a multi-column grid, so the
// whole console fits WITHOUT the page scrolling. Each row opens the module's on-page panel (or its deep
// route); only the presentation is tightened. The `desc` rides in the row's title (hover) tooltip. A card
// with sub-modules (`parent`) renders them as nested sub-rows beneath it, so one surface = one card.

/** One module as a compact tappable ROW into its panel / sub-page: a small icon tile + the label (one
 *  line), an optional "Suggested" dot, and a quiet open chevron. The full description rides in the title
 *  attribute. */
function SectionRow({
  module,
  href,
  suggested,
  nested = false,
  children,
}: {
  module: SpaceModule
  href: string
  suggested: boolean
  /** A sub-module row (rendered under its parent card): indented, lighter, smaller icon tile. */
  nested?: boolean
  /** Nested sub-module rows, rendered in a sub-list beneath this card (a card with `parent` children). */
  children?: React.ReactNode
}) {
  const Icon = module.Icon
  return (
    <li className={nested ? 'ml-3.5 border-l border-border pl-2.5' : undefined}>
      <Link
        href={href}
        title={module.desc}
        className={`group flex items-center gap-2.5 rounded-lg border border-border shadow-sm outline-none transition-colors hover:border-border-strong hover:bg-surface-elevated focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none ${nested ? 'bg-surface/60 px-2 py-1.5' : 'bg-surface px-2.5 py-2'}`}
      >
        <span className={`flex shrink-0 items-center justify-center rounded-md bg-primary-bg text-primary-strong ${nested ? 'h-6 w-6' : 'h-7 w-7'}`}>
          <Icon className={nested ? 'h-3 w-3' : 'h-3.5 w-3.5'} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate font-medium text-text ${nested ? 'text-xs' : 'text-sm'}`}>{module.label}</span>
          {!nested && module.freeNote && (
            <span className="mt-0.5 block truncate text-2xs text-muted">{module.freeNote}</span>
          )}
        </span>
        {suggested && (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary-bg px-1.5 py-0.5 text-2xs font-semibold text-primary-strong"
            title="Suggested for your mode"
          >
            <Sparkles className="h-3 w-3" aria-hidden />
            <span className="sr-only">Suggested for your mode</span>
          </span>
        )}
        <AccessBadge level={accessLevel(module)} />
        <ArrowRight
          className="h-3.5 w-3.5 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-primary-strong motion-reduce:transition-none"
          aria-hidden
        />
      </Link>
      {children ? <ul className="mt-1.5 space-y-1.5">{children}</ul> : null}
    </li>
  )
}

/** The Danger zone's one non-link row: the delete control for an owner / staff viewer, or a calm
 *  header-only note otherwise (mirrors the legacy cockpit + the circle console Danger surface). */
function DangerRow({
  module,
  canDelete,
  spaceId,
}: {
  module: SpaceModule
  canDelete: boolean
  spaceId: string
}) {
  return (
    <li className="rounded-lg border border-danger/30 bg-surface px-2.5 py-2 shadow-sm">
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-danger-bg text-danger">
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">{module.label}</span>
      </div>
      {canDelete && (
        <div className="mt-2">
          <DangerDelete
            entity="space"
            warning="Permanently deletes this space and everything it owns: all its events (with their RSVPs and check-ins), members, circles, pages, and CRM. This cannot be undone."
            onDelete={deleteSpace.bind(null, spaceId)}
            redirectTo="/spaces"
            confirmText="DELETE"
          />
        </div>
      )}
    </li>
  )
}

/** The category nav for the hub — the four browse sections as underline tabs (the Classifieds category-menu
 *  pattern), `?section=` in the URL so it is server-rendered + shareable. Profile & Settings is a header
 *  affordance, not a tab. */
function HubNav({
  slug,
  section,
  sectionHref,
}: {
  slug: string
  section: SpaceHubSection
  /** How a tab links to another section. Default = the standalone `/manage?section=` page; the in-place
   *  Manage panel passes an override so the tabs soft-nav under the profile header instead (no reload). */
  sectionHref?: (key: SpaceHubSection) => string
}) {
  const href = sectionHref ?? ((key: SpaceHubSection) => `/spaces/${slug}/manage?section=${key}`)
  // Pill nav (the shared commerce/classifieds facet style, MarketplaceFacets): a rounded, filled-when-active
  // row instead of the underline strip, so the Manage areas read as one hub the same way Classifieds does.
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Manage areas">
      {SPACE_HUB_SECTIONS.map((s) => {
        const on = s.key === section
        return (
          <Link
            key={s.key}
            href={href(s.key)}
            scroll={false}
            aria-current={on ? 'page' : undefined}
            className={
              'rounded-full px-3 py-1.5 text-sm font-medium transition-colors ' +
              (on
                ? 'bg-primary text-on-primary'
                : 'border border-border text-muted hover:bg-surface-elevated hover:text-text')
            }
          >
            {s.label}
          </Link>
        )
      })}
    </nav>
  )
}

/** A flat grid of feature cards for one category — every feature is a top-level card WITHIN the category
 *  space (no nested sub-menus, owner directive). Ordered by Mode emphasis, then catalog order. */
function FeatureGrid({
  modules,
  slug,
  emphasis,
}: {
  modules: SpaceModule[]
  slug: string
  emphasis: readonly SpaceFunctionKey[]
}) {
  const ordered = orderWithinGroupByEmphasis(modules, emphasis)
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {ordered.map((module) => {
        const href = panelHrefForModule(module, slug)
        if (!href) return null
        return <SectionRow key={module.id} module={module} href={href} suggested={isSuggestedByMode(module, emphasis)} />
      })}
    </ul>
  )
}

export function SpaceManageConsole({
  slug,
  modules,
  emphasis,
  section,
  dashboardEmbed,
  crmEmbed,
  marketingEmbed,
  canDelete,
  spaceId,
  sectionHref,
}: {
  slug: string
  /** The gated module manifest, in catalog order. */
  modules: SpaceModule[]
  /** The Mode's emphasized functions — a SECONDARY signal (tag + within-category order), never a gate. */
  emphasis: readonly SpaceFunctionKey[]
  /** The active hub tab (from `?section=`). */
  section: SpaceHubSection
  /** How the tabs link between sections. Omitted = the standalone `/manage?section=` page; the in-place
   *  Manage panel passes an override so the tabs soft-nav under the profile header (no reload). */
  sectionHref?: (key: SpaceHubSection) => string
  /** The command-center Home surface (revenue + members + needs-attention + activity + upcoming), built
   *  server-side and shown on the default `dashboard` tab (ADR-796). */
  dashboardEmbed?: React.ReactNode
  /** The embedded CRM roster node, built server-side by the page and shown atop the Resonance tab so the
   *  hub opens on the space's live Resonance CRM (owner directive). */
  crmEmbed?: React.ReactNode
  /** The embedded Marketing surface (email dashboard + pill sub-nav), built server-side and shown on the
   *  Marketing tab so it mirrors the admin CRM Marketing page exactly (owner directive). */
  marketingEmbed?: React.ReactNode
  /** Whether the Profile & Settings tab's Danger zone renders its delete control (owner / staff). */
  canDelete: boolean
  spaceId: string
}) {
  const blurb = SPACE_HUB_SECTIONS.find((s) => s.key === section)?.blurb
  // The Profile & Settings tab renders the settings surface (identity · Team · Reviews · Plan & Billing ·
  // Danger); every other tab renders its flat feature cards, with the Resonance CRM roster atop Resonance.
  const inSection = modules.filter((m) => sectionForModule(m) === section)

  return (
    <div>
      <HubNav slug={slug} section={section} sectionHref={sectionHref} />
      <div className="mt-5">
        {/* Resonance + Marketing render their own full surfaces (with their own headers / sub-nav); no hub
            blurb there. Every other tab keeps its short blurb above the feature cards. */}
        {blurb && section !== 'dashboard' && section !== 'resonance' && section !== 'marketing' && (
          <p className="mb-4 max-w-2xl text-sm text-muted">{blurb}</p>
        )}
        {section === 'dashboard' ? (
          dashboardEmbed
        ) : section === 'resonance' ? (
          // Community leads with the member viewer (health + master-detail roster), then surfaces the
          // rest of the CRM as cards: the board (People · Pipeline · Cockpit · Import, opened in the
          // `?panel=crm` workspace), the Inbox, Lead capture, Capture links, and Shared with team. Without
          // these, Pipeline + Cockpit had NO home inside Community (only `/crm` or a deep URL); the cards
          // give every CRM sub-function a visible entry point here.
          <div className="space-y-8">
            {crmEmbed}
            {inSection.length > 0 && (
              <div>
                <SectionHeader title="CRM tools" />
                <FeatureGrid modules={inSection} slug={slug} emphasis={emphasis} />
              </div>
            )}
          </div>
        ) : section === 'marketing' ? (
          marketingEmbed
        ) : section === 'settings' ? (
          <SpaceSettingsSurface slug={slug} modules={modules} canDelete={canDelete} spaceId={spaceId} />
        ) : (
          <>
            {inSection.length > 0 ? (
              <FeatureGrid modules={inSection} slug={slug} emphasis={emphasis} />
            ) : (
              <p className="text-sm text-subtle">Nothing here yet for this space.</p>
            )}
            <div className="mt-6">
              <AccessLegend />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/** The header-level PROFILE & SETTINGS surface (ADR-785): the space's identity/brand/visibility shell plus
 *  Team, Reviews, Plan & usage, and the Danger zone — everything that is configuration rather than daily
 *  operation. Rendered by the Profile & Settings route, not the browse hub. */
export function SpaceSettingsSurface({
  slug,
  modules,
  canDelete,
  spaceId,
}: {
  slug: string
  modules: SpaceModule[]
  canDelete: boolean
  spaceId: string
}) {
  const settingsModules = modules.filter((m) => sectionForModule(m) === 'settings')
  const cards = settingsModules.filter((m) => m.id !== 'space.danger')
  const danger = settingsModules.find((m) => m.id === 'space.danger')
  return (
    <div className="space-y-6">
      {/* MENU & FEATURES (ADR-796): the discoverable entry to the Module Manager, where the owner turns on
          the advanced tools (Enrollment, Check in, Airwaves, Loom, Automation, and the rest) that
          progressive disclosure keeps folded by default, and tidies their menu. Without this card the
          Module Manager was only reachable by typing /manage/modules by hand from the in-place console. */}
      <Link
        href={`/spaces/${slug}/manage/modules`}
        className="group flex items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-3 shadow-sm outline-none transition-colors hover:border-border-strong hover:bg-surface-elevated focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-bg text-primary-strong">
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-text">Menu and features</span>
          <span className="mt-0.5 block text-xs text-muted">Turn on more tools or tidy which ones show in your menu.</span>
        </span>
        <ArrowRight
          className="h-4 w-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-primary-strong motion-reduce:transition-none"
          aria-hidden
        />
      </Link>
      {/* MODE & FOCUS (audit fix): a full, working surface (switch Mode/Focus, preview what it turns on,
          override facets) that had NO entry point from the console/hub/search — reachable only from a few
          offering empty-state prompts. This card is its discoverable home, so an owner can find where to
          change what their space emphasizes. */}
      <Link
        href={`/spaces/${slug}/manage/mode`}
        className="group flex items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-3 shadow-sm outline-none transition-colors hover:border-border-strong hover:bg-surface-elevated focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-bg text-primary-strong">
          <Compass className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-text">Mode and focus</span>
          <span className="mt-0.5 block text-xs text-muted">Choose what your space leads with, and what its main button opens.</span>
        </span>
        <ArrowRight
          className="h-4 w-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-primary-strong motion-reduce:transition-none"
          aria-hidden
        />
      </Link>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {cards.map((module) => {
          const href = panelHrefForModule(module, slug)
          if (!href) return null
          return <SectionRow key={module.id} module={module} href={href} suggested={false} />
        })}
      </ul>
      {danger && (
        <section>
          <SectionHeader title="Danger zone" />
          <ul className="-mt-1">
            <DangerRow module={danger} canDelete={canDelete} spaceId={spaceId} />
          </ul>
        </section>
      )}
    </div>
  )
}
