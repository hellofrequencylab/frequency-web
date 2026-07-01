import Link from 'next/link'
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Briefcase,
  CalendarClock,
  CreditCard,
  GraduationCap,
  HandCoins,
  IdCard,
  LayoutTemplate,
  Mail,
  type LucideIcon,
  QrCode,
  ScanLine,
  Sparkles,
  Ticket,
  Trash2,
  Users,
} from 'lucide-react'
import { SectionHeader } from '@/components/ui/section-header'
import { DangerDelete } from '@/components/admin/danger-delete'
import { deleteSpace } from '@/lib/spaces/provision'
import type { SpaceSurface } from '@/lib/admin/entities/registry'
import type { SpaceFunctionKey } from '@/lib/spaces/functions'

// The render boundary for the Space owner console (ADR-441 EM1-3, reworked for the grouped Dashboard IA).
// The page (an RSC) resolves the Space + gates server-side and hands this the gated spine surfaces (in
// stable spine order) plus the Mode emphasis list; this layer binds each surface id to the EXISTING
// settings sub-page that already serves it, GROUPS the flat spine into scannable clusters, and tags the
// surfaces a Mode suggests. No feature is rebuilt: every section is a link into a working
// /spaces/[slug]/settings sub-page (or the CRM board / Mode settings), so this stays a pure
// harmonization of navigation onto the unified spine.
//
// DESIGN (this rework):
//   • Identity & basics LEADS, always, at the top — never demoted below the mode-emphasized modules
//     (the bug the old emphasis-reorder caused: it promoted bookings/CRM above the space's own identity).
//   • The 9-category spine is grouped into clear clusters (Identity & basics · Bookings & offerings ·
//     People & CRM · Reach & comms · Money & billing · Insights · Danger zone), each a titled cluster of
//     cards with a per-section icon, rather than one long flat list.
//   • Mode is a SECONDARY signal: a surface a Mode emphasizes gets a quiet "Suggested for your mode" tag
//     and sorts first WITHIN its group. Nothing is dropped; every gated surface still appears.
//
// This is a Server Component (no client state needed): the sections are links, and the one interactive
// control (Danger's delete) is the existing client <DangerDelete> rendered with a bound server action.

/** Map a surface id to the sub-page it opens, given the Space slug. Danger has no href (it renders
 *  its delete control inline); an unmapped id is skipped (defensive, should not happen).
 *
 *  EVERY href here must target a NON-redirecting sub-page. The /settings INDEX redirects every console
 *  type back to /manage (isConsoleSpaceType), so a section pointed at the bare index would loop
 *  /settings → /manage → the console. Basics therefore opens its own /settings/basics editor (the
 *  profile form), not the index. Exported PURE so the no-loop guarantee is unit-tested (console.test.ts). */
export function hrefForSurface(id: string, slug: string): string | null {
  const base = `/spaces/${slug}`
  switch (id) {
    case 'space.basics':
      // The dedicated basics editor, NOT the /settings index (which redirects console types to /manage,
      // looping "Open basics" straight back to this console).
      return `${base}/settings/basics`
    case 'space.mode':
      return `${base}/manage/mode`
    case 'space.layout':
      return `${base}/manage/layout`
    case 'space.place':
      return `${base}/settings/availability`
    case 'space.people':
      return `${base}/settings/members`
    case 'space.engage.crm':
      return `${base}/crm`
    case 'space.engage.donations':
      return `${base}/settings/donations`
    case 'space.engage.enroll':
      return `${base}/settings/enroll`
    case 'space.engage.memberships':
      return `${base}/settings/memberships`
    case 'space.engage.tickets':
      return `${base}/settings/tickets`
    case 'space.safety.checkin':
      return `${base}/settings/checkin`
    case 'space.reach':
      return `${base}/settings/qr`
    case 'space.comms':
      return `${base}/settings/email`
    case 'space.insights':
      // Analytics live alongside the QR codes surface today (no standalone insights sub-page yet).
      return `${base}/settings/qr`
    case 'space.billing':
      return `${base}/settings/billing`
    case 'space.danger':
      return null
    default:
      return null
  }
}

// ── Grouping + iconography (pure metadata) ───────────────────────────────────────────────────────────
//
// The console renders its sections in titled GROUPS rather than one flat list. A group is keyed by a
// stable id; every surface id is assigned to exactly one group (CONSOLE_GROUP_FOR). The groups render in
// CONSOLE_GROUPS order, with Identity & basics first (so the space's own identity always leads) and the
// Danger zone last. A surface whose id is not mapped falls back to 'identity' (defensive; never expected).

type GroupId = 'identity' | 'offerings' | 'people' | 'reach' | 'money' | 'insights' | 'danger'

interface ConsoleGroup {
  id: GroupId
  title: string
  /** One plain line under the group title (CONTENT-VOICE: no em dashes). */
  blurb: string
}

/** The group spine, in render order. Identity leads; Danger trails. */
const CONSOLE_GROUPS: readonly ConsoleGroup[] = [
  { id: 'identity', title: 'Identity and basics', blurb: 'Your name, brand, story, and how this space runs.' },
  { id: 'offerings', title: 'Bookings and offerings', blurb: 'What people can book, join, support, or attend.' },
  { id: 'people', title: 'People and CRM', blurb: 'Your team, your contacts, and who shows up.' },
  { id: 'reach', title: 'Reach and comms', blurb: 'Get your space in front of people and stay in touch.' },
  { id: 'money', title: 'Money and billing', blurb: 'Your plan and what each plan unlocks.' },
  { id: 'insights', title: 'Insights', blurb: 'See how your space is performing.' },
  { id: 'danger', title: 'Danger zone', blurb: 'Permanent actions for this space.' },
]

/** Which group each surface id belongs to. The console reads this to cluster the flat spine. */
const CONSOLE_GROUP_FOR: Record<string, GroupId> = {
  'space.basics': 'identity',
  'space.mode': 'identity',
  'space.layout': 'identity',
  'space.place': 'offerings',
  'space.engage.memberships': 'offerings',
  'space.engage.donations': 'offerings',
  'space.engage.enroll': 'offerings',
  'space.engage.tickets': 'offerings',
  'space.people': 'people',
  'space.engage.crm': 'people',
  'space.safety.checkin': 'people',
  'space.reach': 'reach',
  'space.comms': 'reach',
  'space.billing': 'money',
  'space.insights': 'insights',
  'space.danger': 'danger',
}

/** The per-section icon (lucide). Keeps the cards scannable at a glance. */
const ICON_FOR: Record<string, LucideIcon> = {
  'space.basics': IdCard,
  'space.mode': Sparkles,
  'space.layout': LayoutTemplate,
  'space.place': CalendarClock,
  'space.engage.memberships': BadgeCheck,
  'space.engage.donations': HandCoins,
  'space.engage.enroll': GraduationCap,
  'space.engage.tickets': Ticket,
  'space.people': Users,
  'space.engage.crm': Briefcase,
  'space.safety.checkin': ScanLine,
  'space.reach': QrCode,
  'space.comms': Mail,
  'space.billing': CreditCard,
  'space.insights': BarChart3,
  'space.danger': Trash2,
}

/** The group a surface belongs to (defensive default: identity). PURE. */
export function groupForSurface(id: string): GroupId {
  return CONSOLE_GROUP_FOR[id] ?? 'identity'
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
 * touches order now — it reorders within a group, never across groups, so Identity & basics can never be
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

// ── Cards ────────────────────────────────────────────────────────────────────────────────────────────

/** One spine section as a tappable card into its existing settings sub-page: icon tile + label +
 *  one-line description + a clear open affordance, with an optional "Suggested for your mode" tag. */
function SectionCard({
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
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm outline-none transition-colors hover:border-border-strong hover:bg-surface-elevated focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-sm font-semibold text-text">{surface.label}</span>
          {suggested && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary-bg px-2 py-0.5 text-2xs font-semibold text-primary-strong">
              <Sparkles className="h-3 w-3" aria-hidden />
              Suggested for your mode
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-xs text-muted">{surface.desc}</span>
      </span>
      <ArrowRight
        className="mt-2.5 h-4 w-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-primary-strong motion-reduce:transition-none"
        aria-hidden
      />
    </Link>
  )
}

/** The Danger zone's one non-link card: the existing delete control for an owner / staff viewer, or a
 *  calm header-only note otherwise (mirrors the legacy cockpit + the circle console Danger surface). */
function DangerCard({
  surface,
  canDelete,
  spaceId,
}: {
  surface: SpaceSurface
  canDelete: boolean
  spaceId: string
}) {
  return (
    <div className="rounded-2xl border border-danger/30 bg-surface p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-danger-bg text-danger">
          <Trash2 className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text">{surface.label}</p>
          <p className="mt-0.5 text-xs text-muted">{surface.desc}</p>
        </div>
      </div>
      {canDelete && (
        <div className="mt-4">
          <DangerDelete
            entity="space"
            warning="Permanently deletes this space and everything it owns: all its events (with their RSVPs and check-ins), members, circles, pages, and CRM. This cannot be undone."
            onDelete={deleteSpace.bind(null, spaceId)}
            redirectTo="/spaces"
            confirmText="DELETE"
          />
        </div>
      )}
    </div>
  )
}

/** One titled group cluster: a SectionHeader, a one-line blurb, then a responsive grid of its cards. */
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
    <section>
      <SectionHeader title={group.title} />
      <p className="-mt-2 mb-3 text-sm text-muted">{group.blurb}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {surfaces.map((surface) => {
          if (surface.id === 'space.danger') {
            return (
              <DangerCard key={surface.id} surface={surface} canDelete={canDelete} spaceId={spaceId} />
            )
          }
          const href = hrefForSurface(surface.id, slug)
          if (!href) return null
          return (
            <SectionCard
              key={surface.id}
              surface={surface}
              href={href}
              suggested={isSuggestedByMode(surface, emphasis)}
            />
          )
        })}
      </div>
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

  return (
    <>
      {CONSOLE_GROUPS.map((group) => {
        const inGroup = byGroup.get(group.id)
        if (!inGroup || inGroup.length === 0) return null
        // The Danger group keeps its single card; every other group orders within itself by emphasis.
        const ordered =
          group.id === 'danger' ? inGroup : orderWithinGroupByEmphasis(inGroup, emphasis)
        return (
          <GroupCluster
            key={group.id}
            group={group}
            surfaces={ordered}
            slug={slug}
            emphasis={emphasis}
            canDelete={canDelete}
            spaceId={spaceId}
          />
        )
      })}
    </>
  )
}
