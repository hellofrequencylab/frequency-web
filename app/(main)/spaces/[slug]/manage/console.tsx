import Link from 'next/link'
import { ArrowRight, Sparkles, Trash2 } from 'lucide-react'
import { SectionHeader } from '@/components/ui/section-header'
import { DangerDelete } from '@/components/admin/danger-delete'
import { deleteSpace } from '@/lib/spaces/provision'
import type { SpaceModule } from '@/lib/admin/modules/space-modules'
import type { AdminSlot } from '@/lib/admin/modules/registry'
import { SPACE_GROUP_META } from '@/lib/admin/modules/spine'
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
// The console renders its sections in the SAME 7 member-facing GROUPS the admin rail uses (ADR-520): it
// clusters each module by its group slot and labels the group from the shared SPACE_GROUP_META (Identity ·
// Info and Connect · Page · Audience · Offerings & money · Reach · Growth · Danger), so the two owner
// surfaces (this full-page console + the in-rail bar) never disagree on the IA. Groups render in
// SPACE_CONSOLE_GROUPS order (Identity leads so the space's own identity is first; Danger trails).

/** The 7 Space console groups, in render order — the SPACE_GROUP_META slots (ADR-520). Identity leads;
 *  Danger trails. Each group's header label + icon come from SPACE_GROUP_META. Every module folds into one
 *  of these seven via groupForModule, so nothing is orphaned. */
const SPACE_CONSOLE_GROUPS: readonly AdminSlot[] = [
  'basics', // Identity + Info and Connect + Settings
  'layout', // Page
  'people', // Audience (Members + CRM)
  'engage', // Offerings & money (the 7 split commerce modules)
  'reach', // Reach (QR + Email)
  'insights', // Growth (Insights + Plan and usage)
  'danger', // Danger
]

/**
 * The console group (one of the 7 SPACE_CONSOLE_GROUPS slots) a module clusters into. PURE. The module
 * catalog uses the finer engineering spine slots, so several fold together for the console's 7-group IA:
 * Identity & Branding (`place`) and the lower Settings section (`safety`) join the identity `basics`
 * group; Email (`comms`) joins `reach`; Plan and usage (`billing`) joins the Growth `insights` group. The
 * offerings modules already use `engage`, so they land in "Offerings & money" unchanged.
 */
export function groupForModule(module: SpaceModule): AdminSlot {
  switch (module.slot) {
    case 'place':
    case 'safety':
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

// ── Rows ─────────────────────────────────────────────────────────────────────────────────────────────
//
// The console is a DENSE, CONSOLIDATED board: compact one-line link ROWS (icon + label, no per-card
// description, no per-group blurb) laid out in tight titled groups across a multi-column grid, so the
// whole console fits WITHOUT the page scrolling. Each row opens the module's on-page panel (or its deep
// route); only the presentation is tightened. The `desc` rides in the row's title (hover) tooltip.

/** One module as a compact tappable ROW into its panel / sub-page: a small icon tile + the label (one
 *  line), an optional "Suggested" dot, and a quiet open chevron. The full description rides in the title
 *  attribute. */
function SectionRow({
  module,
  href,
  suggested,
}: {
  module: SpaceModule
  href: string
  suggested: boolean
}) {
  const Icon = module.Icon
  return (
    <li>
      <Link
        href={href}
        title={module.desc}
        className="group flex items-center gap-2.5 rounded-lg border border-border bg-surface px-2.5 py-2 shadow-sm outline-none transition-colors hover:border-border-strong hover:bg-surface-elevated focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary-bg text-primary-strong">
          <Icon className="h-3.5 w-3.5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">{module.label}</span>
        {suggested && (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary-bg px-1.5 py-0.5 text-2xs font-semibold text-primary-strong"
            title="Suggested for your mode"
          >
            <Sparkles className="h-3 w-3" aria-hidden />
            <span className="sr-only">Suggested for your mode</span>
          </span>
        )}
        <ArrowRight
          className="h-3.5 w-3.5 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-primary-strong motion-reduce:transition-none"
          aria-hidden
        />
      </Link>
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

/** One titled group: a compact SectionHeader, then a tight vertical list of its rows. Sits in a
 *  multi-column grid cell (break-inside-avoid keeps a group whole). No blurb — the console is
 *  consolidated to fit without scrolling. */
function GroupCluster({
  title,
  modules,
  slug,
  emphasis,
  canDelete,
  spaceId,
}: {
  title: string
  modules: SpaceModule[]
  slug: string
  emphasis: readonly SpaceFunctionKey[]
  canDelete: boolean
  spaceId: string
}) {
  return (
    <section className="break-inside-avoid">
      <SectionHeader title={title} />
      <ul className="-mt-1 space-y-1.5">
        {modules.map((module) => {
          if (module.id === 'space.danger') {
            return <DangerRow key={module.id} module={module} canDelete={canDelete} spaceId={spaceId} />
          }
          // P1: prefer the module's ON-PAGE panel when one exists (no regression to the Stage-D5 `?panel=`
          // behavior — Members / CRM / Store / QR / Email / Billing open inline in the profile body); a
          // module with no panel (the 7 split commerce services, Insights) falls through to its deep route.
          const href = panelHrefForModule(module, slug)
          if (!href) return null
          return (
            <SectionRow
              key={module.id}
              module={module}
              href={href}
              suggested={isSuggestedByMode(module, emphasis)}
            />
          )
        })}
      </ul>
    </section>
  )
}

export function SpaceManageConsole({
  slug,
  modules,
  emphasis,
  canDelete,
  spaceId,
}: {
  slug: string
  /** The gated module manifest, in catalog order (the page does NOT pre-reorder by Mode). */
  modules: SpaceModule[]
  /** The Mode's emphasized functions — a SECONDARY signal (tag + within-group order), never a gate. */
  emphasis: readonly SpaceFunctionKey[]
  /** Whether the Danger section renders its delete control (owner / staff); else header-only. */
  canDelete: boolean
  spaceId: string
}) {
  // Bucket the flat manifest by console GROUP (the 7-group IA, ADR-520), preserving incoming (catalog)
  // order within each bucket, then apply the Mode emphasis WITHIN each bucket only. Render the groups in
  // SPACE_CONSOLE_GROUPS order; a group with no modules for this Space renders nothing.
  const byGroup = new Map<AdminSlot, SpaceModule[]>()
  for (const mod of modules) {
    const g = groupForModule(mod)
    const list = byGroup.get(g) ?? []
    list.push(mod)
    byGroup.set(g, list)
  }

  // The groups flow across a multi-column grid (masonry-like via CSS columns) so the whole console
  // reads as one consolidated board that fits WITHOUT the page scrolling. break-inside-avoid on each
  // group keeps it whole within a column.
  return (
    <div className="gap-x-6 [column-gap:1.5rem] sm:columns-2 xl:columns-3">
      {SPACE_CONSOLE_GROUPS.map((slot) => {
        const inGroup = byGroup.get(slot)
        if (!inGroup || inGroup.length === 0) return null
        const meta = SPACE_GROUP_META[slot]
        if (!meta) return null
        // The Danger group keeps its single row; every other group orders within itself by emphasis.
        const ordered = slot === 'danger' ? inGroup : orderWithinGroupByEmphasis(inGroup, emphasis)
        return (
          <div key={slot} className="mb-5 break-inside-avoid">
            <GroupCluster
              title={meta.label}
              modules={ordered}
              slug={slug}
              emphasis={emphasis}
              canDelete={canDelete}
              spaceId={spaceId}
            />
          </div>
        )
      })}
    </div>
  )
}
