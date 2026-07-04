import Link from 'next/link'
import {
  ArrowRight,
  BarChart3,
  Briefcase,
  Columns3,
  CreditCard,
  HandCoins,
  IdCard,
  LayoutTemplate,
  Mail,
  type LucideIcon,
  QrCode,
  ShieldCheck,
  Sparkles,
  Store,
  Trash2,
  Users,
} from 'lucide-react'
import { SectionHeader } from '@/components/ui/section-header'
import { DangerDelete } from '@/components/admin/danger-delete'
import { deleteSpace } from '@/lib/spaces/provision'
import type { SpaceSurface } from '@/lib/admin/entities/registry'
import type { SpaceFunctionKey } from '@/lib/spaces/functions'
import { hrefForSurface } from '@/lib/spaces/surface-hrefs'

// hrefForSurface was LIFTED to the pure lib module (lib/spaces/surface-hrefs.ts) so the client-side
// admin rail's Space link-rows (components/layout/settings-panel.tsx) can reuse the SAME map without
// dragging this Server Component's server deps (deleteSpace, DangerDelete) into the client bundle.
// Re-exported so console.test.ts + every existing caller keep importing it from './console' unchanged.
export { hrefForSurface }

// The render boundary for the Space owner console (ADR-441 EM1-3, reworked for the grouped Dashboard IA).
// The page (an RSC) resolves the Space + gates server-side and hands this the gated spine surfaces (in
// stable spine order) plus the Mode emphasis list; this layer binds each surface id to the EXISTING
// settings sub-page that already serves it, GROUPS the flat spine into scannable clusters, and tags the
// surfaces a Mode suggests. No feature is rebuilt: every section is a link into a working
// /spaces/[slug]/settings sub-page (or the CRM board / Mode settings), so this stays a pure
// harmonization of navigation onto the unified spine.
//
// DESIGN (this rework):
//   • Space LEADS, always, at the top — never demoted below the mode-emphasized modules (the bug the old
//     emphasis-reorder caused: it promoted bookings/CRM above the space's own identity).
//   • The 9-category spine is compressed into five tight clusters plus Danger (Space · People ·
//     Offerings · Reach · Billing and insights · Danger zone), each a titled cluster of compact cards
//     with a per-surface icon, rather than one long flat list.
//   • Mode is a SECONDARY signal: a surface a Mode emphasizes gets a quiet "Suggested for your mode" tag
//     and sorts first WITHIN its group. Nothing is dropped; every gated surface still appears.
//
// This is a Server Component (no client state needed): the sections are links, and the one interactive
// control (Danger's delete) is the existing client <DangerDelete> rendered with a bound server action.

// ── Grouping + iconography (pure metadata) ───────────────────────────────────────────────────────────
//
// The console renders its sections in titled GROUPS rather than one flat list. A group is keyed by a
// stable id; every surface id is assigned to exactly one group (CONSOLE_GROUP_FOR). The groups render in
// CONSOLE_GROUPS order, with Space first (so the space's own identity always leads) and the Danger zone
// last. A surface whose id is not mapped falls back to 'space' (defensive; never expected).
//
// This is the COMPRESSED IA: the seven prior clusters collapse into five tight top-level sections plus
// Danger. Space folds in identity + how it runs + the public page; People holds the team + contacts;
// Offerings gathers everything bookable, joinable, supportable, or attendable (check-in rides along with
// attendance); Reach pairs email + QR; Billing and insights pairs the plan with how the space performs.

type GroupId = 'space' | 'people' | 'offerings' | 'reach' | 'billing' | 'danger'

interface ConsoleGroup {
  id: GroupId
  title: string
  /** One plain line under the group title (CONTENT-VOICE: no em dashes). */
  blurb: string
}

/** The group spine, in render order. Space leads; Danger trails. */
const CONSOLE_GROUPS: readonly ConsoleGroup[] = [
  { id: 'space', title: 'Space', blurb: 'Your identity, how it runs, and your public page.' },
  { id: 'people', title: 'People', blurb: 'Your members, your team, and who shows up.' },
  { id: 'offerings', title: 'Offerings', blurb: 'Everything people can book, join, support, or attend.' },
  { id: 'reach', title: 'Reach', blurb: 'Get your space in front of people and stay in touch.' },
  { id: 'billing', title: 'Billing and insights', blurb: 'Your plan, what it unlocks, and how the space is performing.' },
  { id: 'danger', title: 'Danger zone', blurb: 'Permanent actions for this space.' },
]

/** Which group each surface id belongs to. The console reads this to cluster the flat spine. */
const CONSOLE_GROUP_FOR: Record<string, GroupId> = {
  'space.basics': 'space',
  'space.mode': 'space',
  'space.layout': 'space',
  'space.people': 'people',
  'space.engage.crm': 'people',
  'space.autonomy': 'people',
  'space.pipeline': 'people',
  'space.offerings': 'offerings',
  'space.services': 'offerings',
  'space.comms': 'reach',
  'space.reach': 'reach',
  'space.billing': 'billing',
  'space.insights': 'billing',
  'space.danger': 'danger',
}

/** The per-section icon (lucide). Keeps the cards scannable at a glance. */
const ICON_FOR: Record<string, LucideIcon> = {
  'space.basics': IdCard,
  'space.mode': Sparkles,
  'space.layout': LayoutTemplate,
  'space.offerings': HandCoins,
  'space.services': Store,
  'space.people': Users,
  'space.engage.crm': Briefcase,
  'space.autonomy': ShieldCheck,
  'space.pipeline': Columns3,
  'space.reach': QrCode,
  'space.comms': Mail,
  'space.billing': CreditCard,
  'space.insights': BarChart3,
  'space.danger': Trash2,
}

/** The group a surface belongs to (defensive default: space). PURE. */
export function groupForSurface(id: string): GroupId {
  return CONSOLE_GROUP_FOR[id] ?? 'space'
}

/**
 * Is this surface SUGGESTED by the Space's Mode? A surface whose `requiredFunction` appears in the
 * Mode's emphasis list gets the quiet "Suggested for your mode" tag and sorts first within its group.
 * Basics / Mode / Danger (no `requiredFunction`) are never tagged. PURE, so the page can test it.
 */
export function isSuggestedByMode(
  surface: SpaceSurface,
  emphasis: readonly SpaceFunctionKey[],
): boolean {
  return surface.requiredFunction !== null && emphasis.includes(surface.requiredFunction)
}

/**
 * Order surfaces WITHIN a single group by Mode emphasis: a surface the Mode emphasizes sorts ahead of
 * one it does not, ties keep their incoming spine order (a stable sort). This is the ONLY place Mode
 * touches order now — it reorders within a group, never across groups, so the Space group can never be
 * demoted below a mode-emphasized module. PURE.
 */
export function orderWithinGroupByEmphasis(
  surfaces: SpaceSurface[],
  emphasis: readonly SpaceFunctionKey[],
): SpaceSurface[] {
  if (emphasis.length === 0) return surfaces
  const rank = (s: SpaceSurface): number => {
    if (!s.requiredFunction) return Number.MAX_SAFE_INTEGER
    const i = emphasis.indexOf(s.requiredFunction)
    return i === -1 ? Number.MAX_SAFE_INTEGER : i
  }
  return surfaces
    .map((s, idx) => ({ s, idx }))
    .sort((a, b) => {
      const ra = rank(a.s)
      const rb = rank(b.s)
      if (ra !== rb) return ra - rb
      return a.idx - b.idx
    })
    .map((w) => w.s)
}

// ── Rows ─────────────────────────────────────────────────────────────────────────────────────────────
//
// The console is a DENSE, CONSOLIDATED board: compact one-line link ROWS (icon + label, no per-card
// description, no per-group blurb) laid out in tight titled groups across a multi-column grid, so the
// whole console fits WITHOUT the page scrolling. Each row still opens the SAME settings sub-page it did
// before; only the presentation is tightened. The `desc` stays as the row's title (hover) tooltip so the
// one-liner is still there on demand without spending vertical space.

/** One spine section as a compact tappable ROW into its settings sub-page: a small icon tile + the label
 *  (one line), an optional "Suggested" dot, and a quiet open chevron. The full description rides in the
 *  title attribute. */
function SectionRow({
  surface,
  href,
  suggested,
}: {
  surface: SpaceSurface
  href: string
  suggested: boolean
}) {
  const Icon = ICON_FOR[surface.id] ?? IdCard
  return (
    <li>
      <Link
        href={href}
        title={surface.desc}
        className="group flex items-center gap-2.5 rounded-lg border border-border bg-surface px-2.5 py-2 shadow-sm outline-none transition-colors hover:border-border-strong hover:bg-surface-elevated focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary-bg text-primary-strong">
          <Icon className="h-3.5 w-3.5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">{surface.label}</span>
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
  surface,
  canDelete,
  spaceId,
}: {
  surface: SpaceSurface
  canDelete: boolean
  spaceId: string
}) {
  return (
    <li className="rounded-lg border border-danger/30 bg-surface px-2.5 py-2 shadow-sm">
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-danger-bg text-danger">
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">{surface.label}</span>
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
  group,
  surfaces,
  slug,
  emphasis,
  canDelete,
  spaceId,
}: {
  group: ConsoleGroup
  surfaces: SpaceSurface[]
  slug: string
  emphasis: readonly SpaceFunctionKey[]
  canDelete: boolean
  spaceId: string
}) {
  return (
    <section className="break-inside-avoid">
      <SectionHeader title={group.title} />
      <ul className="-mt-1 space-y-1.5">
        {surfaces.map((surface) => {
          if (surface.id === 'space.danger') {
            return <DangerRow key={surface.id} surface={surface} canDelete={canDelete} spaceId={spaceId} />
          }
          const href = hrefForSurface(surface.id, slug)
          if (!href) return null
          return (
            <SectionRow
              key={surface.id}
              surface={surface}
              href={href}
              suggested={isSuggestedByMode(surface, emphasis)}
            />
          )
        })}
      </ul>
    </section>
  )
}

export function SpaceManageConsole({
  slug,
  surfaces,
  emphasis,
  canDelete,
  spaceId,
}: {
  slug: string
  /** The gated spine surfaces, in stable spine order (the page does NOT pre-reorder by Mode). */
  surfaces: SpaceSurface[]
  /** The Mode's emphasized functions — a SECONDARY signal (tag + within-group order), never a gate. */
  emphasis: readonly SpaceFunctionKey[]
  /** Whether the Danger section renders its delete control (owner / staff); else header-only. */
  canDelete: boolean
  spaceId: string
}) {
  // Bucket the flat spine into its groups, preserving incoming (spine) order within each bucket, then
  // apply the Mode emphasis WITHIN each bucket only. Render the groups in CONSOLE_GROUPS order; a group
  // with no surfaces for this Space type renders nothing.
  const byGroup = new Map<GroupId, SpaceSurface[]>()
  for (const surface of surfaces) {
    const g = groupForSurface(surface.id)
    const list = byGroup.get(g) ?? []
    list.push(surface)
    byGroup.set(g, list)
  }

  // The groups flow across a multi-column grid (masonry-like via CSS columns) so the whole console
  // reads as one consolidated board that fits WITHOUT the page scrolling. break-inside-avoid on each
  // group keeps it whole within a column.
  return (
    <div className="gap-x-6 [column-gap:1.5rem] sm:columns-2 xl:columns-3">
      {CONSOLE_GROUPS.map((group) => {
        const inGroup = byGroup.get(group.id)
        if (!inGroup || inGroup.length === 0) return null
        // The Danger group keeps its single row; every other group orders within itself by emphasis.
        const ordered = group.id === 'danger' ? inGroup : orderWithinGroupByEmphasis(inGroup, emphasis)
        return (
          <div key={group.id} className="mb-5 break-inside-avoid">
            <GroupCluster
              group={group}
              surfaces={ordered}
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
