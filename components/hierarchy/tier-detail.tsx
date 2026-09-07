import Link from 'next/link'
import { Users, LayoutDashboard, Settings } from 'lucide-react'
import { HierarchyBreadcrumb } from './breadcrumb'
import { StatusBadge } from '@/components/groups/status-badge'
import { InlineText } from '@/components/admin/inline/inline-text'
import { OpenAdminBarButton } from '@/components/admin/open-admin-bar-button'
import { StatCard } from '@/components/ui/stat-card'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { ProgressTrack } from '@/components/ui/progress-track'
import type { Capability } from '@/lib/core/capabilities'
import type { TierKind } from '@/lib/hierarchy/tier-detail'

// TIER DETAIL — the ONE rendering of a hierarchy tier's detail page (HYG-046, ADR-1197).
//
// WHY THIS EXISTS. `/hubs/[slug]` and `/nexuses/[slug]` were hand-maintained twins: the same
// imports, the same back-link + breadcrumb frame, the same DetailTemplate lockup, the same scoped
// Insight band, the same child list, the same row. They were not copies kept in sync — they were
// copies that had DRIFTED, which is the worse failure mode, because a fix applied to one silently
// did not reach the other. Three drifts were live when this module was extracted:
//   · the Hub page batched caps + Insight access + children + hero into ONE round-trip (site-audit
//     PERF-6); the Nexus page still ran three serial awaits and never got the fix;
//   · the Hub page dropped archived children; the Nexus page listed archived Hubs and counted their
//     members, so `archiveHub` ("so it drops out of listings") was not true of the one listing of
//     Hubs the product has;
//   · the child rows had diverged in grammar (the name row wrapped on one and not the other), and
//     the Nexus meta line began with a bare "·" whenever a Hub had no Guide.
//
// WHAT LIVES WHERE. This module owns everything a reader SEES; `lib/hierarchy/tier-detail.ts`
// owns the one round-trip that feeds it. The page owns only what genuinely differs between the
// two tiers: its own entity query and the `TierDetailView` it builds from it.
//
// 🔴 THE PAGE STILL COMPOSES THE SHELL. `tierDetailHeader()` returns DetailTemplate's SLOTS, it
// does not render the template (PAGE-FRAMEWORK §3, and `scripts/check-templates.mjs` measures the
// literal tag in the page's own source). Do not "finish" this extraction by moving `<DetailTemplate>`
// in here — that reads as a page that owns no layout and takes the templates ratchet backwards.

/** One entry in the tier's child list: a Circle under a Hub, a Hub under a Nexus. */
export interface TierChildRow {
  id: string
  name: string
  /** Where the row links (`/circles/<slug>`, `/hubs/<slug>`). */
  href: string
  status: string
  /** Small chip beside the name (a Circle's in-person / online designator). */
  chip?: string | null
  /** The meta line under the name. Build it with `metaLine()` so an absent part cannot leave a
   *  dangling separator. */
  meta?: string | null
  /** Seats taken, for a child that carries a cap. Renders the count + its fill bar. */
  capacity?: { count: number; cap: number } | null
}

/** Everything the shared rendering needs. The page builds one of these and nothing else. */
export interface TierDetailView {
  kind: TierKind
  /** The entity's DB id (the admin-bar scope). */
  id: string
  name: string
  slug: string
  status: string
  /** The entity's own route, e.g. `/nexuses/north`. `manage` hangs off it. */
  href: string
  /** The viewer's caps, already resolved for this scope. */
  caps: Capability[]
  canManage: boolean
  /** Inline rename, already bound to the entity (id / slug / field). Null when the viewer
   *  cannot manage, which is the same gate the action re-checks server-side. */
  saveName: ((next: string) => Promise<void>) | null
  crumbs: { label: string; href?: string }[]
  /** The tier's steward: a Hub's Guide, a Nexus's Mentor. */
  lead: { role: string; name: string; handle: string } | null
  /** The one-line count under the identity (the tier decides how it counts). */
  summary: string
  /** The tier's own capacity bar, when the tier carries a cap (a Nexus does; a Hub does not). */
  capacity?: { value: number; max: number; label: string } | null
  /** Scoped Insight (ADR-225): true when this viewer leads THIS scope. */
  showsInsight: boolean
  /** Members reached across the children — the number the Insight band and the summary share. */
  totalMembers: number
  /** Plural heading for the child list ("Circles", "Hubs"). Also drives the empty state. */
  childLabel: string
  /** Singular, lowercase, for the "Avg per <noun>" stat ("circle", "hub"). */
  childNoun: string
  rows: TierChildRow[]
}

/** Join the parts of a row's meta line, dropping the empty ones. A Hub with no Guide used to
 *  render a leading "·" on the Nexus page; a separator is only earned by a part on each side. */
export function metaLine(...parts: (string | null | undefined | false)[]): string | null {
  const kept = parts.filter((p): p is string => typeof p === 'string' && p.length > 0)
  return kept.length > 0 ? kept.join(' · ') : null
}

/** The tier's hierarchy trail (region → outpost → parent tier → itself), with the rungs the entity
 *  does not have dropped. A bare string is a plain label; pass an object to make a rung a link. */
export function tierCrumbs(
  ...parts: ({ label: string; href?: string } | string | null | undefined | false)[]
): { label: string; href?: string }[] {
  return parts
    .filter((p): p is { label: string; href?: string } | string => Boolean(p))
    .map((p) => (typeof p === 'string' ? { label: p } : p))
}

/** The back-link + hierarchy trail every tier page sits inside. */
export function TierDetailFrame({
  crumbs,
  children,
}: {
  crumbs: { label: string; href?: string }[]
  children: React.ReactNode
}) {
  return (
    <div>
      <Link
        href="/circles"
        className="inline-flex items-center gap-1 text-meta text-subtle hover:text-muted mb-4 transition-colors"
      >
        ← Circles
      </Link>

      <HierarchyBreadcrumb crumbs={crumbs} className="mb-4" />

      {children}
    </div>
  )
}

/** DetailTemplate's identity slots for a tier. Spread into the template the PAGE composes:
 *  `<DetailTemplate {...hero} {...tierDetailHeader(view)}>`. */
export function tierDetailHeader(view: TierDetailView) {
  const rename = view.canManage ? view.saveName : null
  return {
    title: rename ? (
      <InlineText
        value={view.name}
        save={rename}
        inputClassName="w-full rounded-lg border border-border-strong bg-surface px-2 py-0.5 text-lead sm:text-page-title font-bold text-text outline-none focus:ring-2 focus:ring-border-strong/30"
      />
    ) : (
      view.name
    ),
    badges: <StatusBadge status={view.status} />,
    // Owner/operator entries, stacked: Edit (Settings drawer) then Manage (console).
    // Gated on <tier>.manage — the same capability every settings action re-checks server-side.
    actions: view.canManage ? (
      <div className="flex flex-col items-stretch gap-2 sm:items-end">
        <OpenAdminBarButton
          scope={{ kind: view.kind, id: view.id }}
          caps={view.caps}
          label={`Edit ${view.kind}`}
          icon={<Settings className="h-4 w-4" />}
        />
        <Link
          href={`${view.href}/manage`}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-body-sm font-semibold text-text transition-colors hover:border-border-strong hover:bg-surface-elevated"
        >
          <LayoutDashboard className="h-4 w-4 text-subtle" />
          Manage {view.kind}
        </Link>
      </div>
    ) : undefined,
    subtitle: (
      <>
        {view.lead && (
          <span>
            {view.lead.role}:{' '}
            <Link
              href={`/people/${view.lead.handle}`}
              className="text-primary-strong hover:underline"
            >
              {view.lead.name}
            </Link>
          </span>
        )}
        <span className="mt-1 flex items-center gap-1.5">
          <Users className="w-4 h-4" />
          {view.summary}
        </span>
        {view.capacity && (
          <ProgressTrack
            value={view.capacity.value}
            max={view.capacity.max}
            animate
            className="mt-2 max-w-xs"
            label={view.capacity.label}
          />
        )}
      </>
    ),
  }
}

/** One child row. The single grammar both tiers use: name · status · optional chip, a meta line,
 *  and an optional capacity bar. */
function TierChildLink({ row }: { row: TierChildRow }) {
  const cap = row.capacity
  const pct = cap && cap.cap > 0 ? Math.min(100, Math.round((cap.count / cap.cap) * 100)) : 0
  const full = cap ? cap.count >= cap.cap : false

  return (
    <Link
      href={row.href}
      className="group flex items-center gap-3 rounded-control px-4 py-3 transition-colors hover:bg-surface-elevated/60 motion-reduce:transition-none"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-body-sm font-semibold text-text">{row.name}</span>
          <StatusBadge status={row.status} />
          {row.chip && (
            <span className="text-meta px-1.5 py-0.5 rounded-md bg-surface-elevated text-muted font-medium">
              {row.chip}
            </span>
          )}
        </div>
        {row.meta && <p className="text-meta text-subtle mt-0.5">{row.meta}</p>}
        {cap && (
          <div className="mt-1.5 flex items-center gap-2">
            <span className="text-meta text-subtle tabular-nums">
              {cap.count} / {cap.cap}
            </span>
            <ProgressTrack
              value={pct}
              tone={full ? 'danger' : 'primary'}
              size="sm"
              className="w-20"
              label={`${cap.count} of ${cap.cap} seats taken`}
            />
          </div>
        )}
      </div>
      <span className="text-subtle transition-colors group-hover:text-text">→</span>
    </Link>
  )
}

/** The tier page body: the scoped Insight band, then the child list. Rendered as the
 *  DetailTemplate's children by the page. */
export function TierDetailBody({ view }: { view: TierDetailView }) {
  const count = view.rows.length
  return (
    <>
      {/* ── Insight (scoped) — in-scope analytics for the tier's steward, ADR-225 ── */}
      {view.showsInsight && (
        <section className="mb-8">
          <SectionHeader title="Insight" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCard label="Members" value={view.totalMembers.toLocaleString()} icon={Users} />
            <StatCard label={view.childLabel} value={count.toLocaleString()} />
            <StatCard
              label={`Avg per ${view.childNoun}`}
              value={count > 0 ? Math.round(view.totalMembers / count).toLocaleString() : '0'}
            />
          </div>
        </section>
      )}

      {/* ── Children ───────────────────────────────── */}
      <section>
        <SectionHeader title={view.childLabel} count={count} />
        {count === 0 ? (
          <EmptyState title={`No ${view.childLabel.toLowerCase()} yet.`} />
        ) : (
          <div className="space-y-1">
            {view.rows.map((row) => (
              <TierChildLink key={row.id} row={row} />
            ))}
          </div>
        )}
      </section>
    </>
  )
}
