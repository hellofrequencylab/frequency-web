'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowRight, LayoutGrid, type LucideIcon } from 'lucide-react'
import { meetsAccess } from '@/lib/nav-areas'
import { isModuleRoute } from '@/lib/widgets/module-routes'
import { LayoutEditor } from '@/components/admin/page-settings/layout-editor'
import { EventDangerZone } from '@/components/admin/modules/event-danger-zone'
import { CircleQuestModule } from '@/components/admin/modules/circle-quest-module'
import { PageContentModule } from '@/components/admin/modules/page-content-module'
import { MODULE_COMPONENTS } from '@/components/admin/modules/module-map'
import { PERSONAL_MODULE_IDS, type AdminSlot } from '@/lib/admin/modules/registry'
import { SPINE_ORDER, SPINE_META, groupIntoSpine } from '@/lib/admin/modules/spine'
import { adminScopeFor, type AdminScope } from '@/lib/layout/page-chrome'
import type { OpenAdminBarDetail } from '@/components/admin/open-admin-bar'
import { appsForScope, lockedAppsForScope } from '@/lib/apps/for-scope'
import { mergeAppOverrides, effectiveMinRole } from '@/lib/apps/overrides'
import { APPS } from '@/lib/apps/catalog'
import type { App, AppViewer } from '@/lib/apps/types'
import { usePageAdmin } from '@/components/layout/page-admin-context'
import { CONTENT_EDIT_ROUTES } from '@/lib/layout/editable-content'
import { isStaff, atLeastRole } from '@/lib/core/roles'
import { PageSettingsModule } from '@/components/admin/page-settings/page-settings-module'
import { hrefForSurface } from '@/lib/spaces/surface-hrefs'
import { hrefForEntitySurface } from '@/lib/admin/entity-surface-hrefs'

// The SETTINGS CONTENT — the registry-selected manager modules (Page settings, Circle Quest, page
// content) plus the operator "Page" group (Layout / SEO / Status), resolved from the pathname.
// Extracted from SettingsDrawer so BOTH the desktop slide-over (SettingsDrawer) and the mobile
// full-screen sheet (MobileSettingsSheet) render the SAME content from one source. Each surface
// owns only its own chrome (header / positioning); the body is this hook.
//
// Inline-first rail (ADR-514): this hook returns a STRUCTURED model — the modules grouped into the
// 9-category spine (lib/admin/modules/spine) as a single FLAT list of `sections` the AdminBar body
// renders all at once ("everything in view"). Each app renders per its editor `render` classification:
// an `inline` config surface mounts its editor component; a `link` feature workflow draws a compact
// link-row out to its own page. The search box filters this flat list (no two-level drill-down).

// A caps-BLIND selection viewer that passes every editor App's own gate. LP4 makes the manage-module
// list CATALOG-DRIVEN (appsForScope over the App catalog) instead of a path-sniffing scope table, but
// keeps selection caps-blind — each module still self-gates server-side, and the coarse `manager`
// gate below decides whether the bar shows at all. Resolving against a viewer that holds every editor
// capability makes the resolved id set byte-for-byte the modulesForScopeKind(kind, 'sidebar') set it
// replaces (proven in lib/apps/for-scope.test.ts). Used only until the provider threads the viewer's
// REAL resolved caps (the B2 follow-up).
const SELECTION_VIEWER: AppViewer = {
  caps: new Set(
    APPS.flatMap((a) => (a.surfaces.editor && a.gate.system === 'capability' ? [a.gate.capability] : [])),
  ),
}

// The entity scope kinds — a page in one of these carries its identity through its own manage
// modules, so the generic operator "Page" group is dropped there (see useSettingsPanel). `space` joins
// them (ENTITY-MANAGEMENT / PR C): a Space profile owns its identity through its own 9-spine surfaces.
const ENTITY_KINDS: ReadonlySet<string> = new Set([
  'circle', 'hub', 'nexus', 'event', 'practice', 'channel', 'profile', 'space',
])

/** Extract the Space slug from a `/spaces/<slug>/...` path. The rail's Space link-rows deep-link into
 *  `/spaces/<slug>/settings/*` via hrefForSurface, and the AdminBar detail carries the DB id (not the
 *  slug) on `scope.id`, so the slug is read from the live path. Null off a Space route. */
function spaceSlugFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/spaces\/([^/]+)/)
  return m ? m[1] : null
}

/** One editor surface as a compact link-row OUT to its own management page (inline-first rail, ADR-514).
 *  A surface classified `render: 'link'` is a FEATURE WORKFLOW (Members / CRM / Offerings / QR / Email /
 *  Insights / Billing / Danger, …) that the bar deep-links into rather than inlining — config surfaces
 *  render inline instead. Entity-agnostic: it takes a resolved `href` (Space link-rows resolve it via
 *  hrefForSurface; core/personal entities are all inline in this PR, so no core href map exists yet).
 *  Mirrors the console's SectionRow chrome (tokens only, no hex). */
function SurfaceLinkRow({ app, href }: { app: App; href: string }) {
  const Icon = app.surfaces.editor?.Icon
  return (
    <Link
      href={href}
      title={app.description}
      className="group flex items-center gap-2.5 rounded-lg border border-border bg-surface px-2.5 py-2 outline-none transition-colors hover:border-border-strong hover:bg-surface-elevated focus-visible:ring-2 focus-visible:ring-primary/50 motion-reduce:transition-none"
    >
      {Icon && (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary-bg text-primary-strong">
          <Icon className="h-3.5 w-3.5" aria-hidden />
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">{app.label}</span>
      <ArrowRight
        className="h-3.5 w-3.5 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-primary-strong motion-reduce:transition-none"
        aria-hidden
      />
    </Link>
  )
}

/** Whether this path is an entity-detail scope (vs the operator `global` scope or a takeover). */
function isEntityScope(pathname: string): boolean {
  const scope = adminScopeFor(pathname)
  return !!scope && ENTITY_KINDS.has(scope.kind)
}

// The sidebar ("manage") apps for a scope, resolved from the App CATALOG (LP4 / ADR-503). Each
// self-resolves from the pathname and re-gates server-side, so caps-blind selection is safe.
function settingsAppsFor(scope: AdminScope | null, viewer: AppViewer): App[] {
  if (!scope) return []
  return appsForScope(scope, viewer, 'editor')
}

function questModuleFor(pathname: string) {
  if (/^\/circles\/[^/]+/.test(pathname)) return <CircleQuestModule />
  return null
}

/** The shared "Layout" tuner block (operator-only), parameterized by the page noun so the copy reads
 *  naturally on either a circle or an event. Rendered both in the flat `content` and the Layout
 *  drill-down category, so they never diverge. */
function layoutBlock(noun: 'circle' | 'event'): ReactNode {
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center gap-2">
        <LayoutGrid className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
        <span className="text-sm font-semibold text-text">Layout</span>
      </div>
      <p className="mb-2 text-xs text-muted">
        Choose which blocks show inside the {noun} page and their order. Tunes the page, never the app shell.
      </p>
      <LayoutEditor />
    </div>
  )
}

/** True at the lg breakpoint (>= 1024px). Lets the desktop SettingsDrawer and the
 *  MobileSettingsSheet each render at only ONE breakpoint, so the settings modules never
 *  double-mount in a hidden twin. SSR-safe: starts false, resolves on mount. */
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const update = () => setIsDesktop(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return isDesktop
}

/** One populated spine section, rendered inline in the flattened bar (inline-first rail, ADR-514): a
 *  lightweight header (SPINE_META label + Icon) followed by that slot's nodes — inline editors and/or
 *  feature-workflow link-rows, interspersed in spine order, all in view at once. */
export interface AdminSection {
  slot: AdminSlot
  label: string
  Icon: LucideIcon
  /** The slot's rendered nodes: inline editor components, link-rows, and any folded inline extra. */
  nodes: ReactNode[]
}

/** A lightweight, searchable row for the fuzzy "Search settings" filter (P1/P6 — one catalog source
 *  for browse + search). Covers ALL scoped apps (manage + page blocks). */
export interface SearchableApp {
  id: string
  label: string
  description?: string
  category: AdminSlot | 'element'
  Icon?: LucideIcon
}

/** An attainable-but-locked row (Phase 5 / P3): an App the viewer could plausibly unlock, shown as a
 *  lock + one-line reason (+ optional CTA), NEVER a working editor. Fail-closed by construction. */
export interface LockedRow {
  id: string
  label: string
  reason: string
  cta?: { label: string; href: string }
}

/** The STRUCTURED settings model the AdminBar body renders (docs/ADMIN-RAIL.md — inline-first rail,
 *  ADR-514). A single flat, spine-ordered list of sections, everything in view; the search box filters
 *  it. No two-level drill-down. */
export interface SettingsPanelModel {
  /** Whether there is anything to render at all (each chrome hides an empty bar). */
  hasContent: boolean
  /** The populated spine sections, in fixed spine order — rendered as headers + their nodes, all open. */
  sections: AdminSection[]
  /** The operator "Page" group (Layout / SEO / Status), separate from the entity spine. */
  pageGroup: ReactNode | null
  /** Every scoped app, for the fuzzy search index. */
  searchApps: SearchableApp[]
  /** Attainable-but-locked apps (Phase 5 / P3): rendered as a lock + reason, never an editor. */
  lockedApps: LockedRow[]
}

/** Resolve the settings model for the current route + viewer, shared by the desktop drawer and the
 *  mobile sheet. `hasContent` lets each chrome decide whether to render at all. */
export function useSettingsPanel(detail?: OpenAdminBarDetail): SettingsPanelModel {
  const { role, staffRole, webRole, caps: providerCaps, appOverrides } = usePageAdmin()
  const pathname = usePathname()

  // Per-scope operator overrides for this page's admin scope (docs/ADMIN-RAIL.md Phase 6). FAIL-SAFE:
  // absent ⇒ `{}` ⇒ the catalog defaults (identical to before overrides). Applied to the resolved
  // management Apps below via mergeAppOverrides (drop disabled + reorder by position) then the per-App
  // min_role render gate (reuse atLeastRole against the viewer's community role, fail-closed).
  const overrides = appOverrides ?? {}
  const applyOverrides = (list: App[]): App[] =>
    mergeAppOverrides(list, overrides).filter((a) => {
      const floor = effectiveMinRole(a.id, overrides)
      return floor == null || atLeastRole(role, floor)
    })

  // Prefer the scope the trigger already resolved (detail.scope carries the entity's DB id) over the
  // pathname; with no detail this is exactly adminScopeFor(pathname), as before.
  const rawScope = detail?.scope ?? adminScopeFor(pathname)
  // A Space scope carries its TYPE (from the Customize trigger detail) so appsForScope can resolve the
  // Space's editor Apps by `{ on:'spaceType', type }` (Space authority is SpaceRole + per-Space function,
  // not a Capability). A path-derived Space scope has no type, so the panel resolves Space Apps ONLY when
  // opened from the typed trigger — the shell's generic cog is suppressed on Space profiles anyway.
  const scope: AdminScope | null =
    rawScope && rawScope.kind === 'space' && detail?.spaceType
      ? { ...rawScope, spaceType: detail.spaceType }
      : rawScope
  const isSpace = scope?.kind === 'space'
  const spaceSlug = isSpace ? spaceSlugFromPath(pathname) : null

  // What this viewer can administer: page MANAGERS (host+ / staff — each module re-gates
  // server-side) and platform OPERATORS (web_role admin/janitor, who get the page-level group).
  const manager = meetsAccess('host', role) || staffRole != null
  const isOperator = isStaff(webRole)

  // The viewer for catalog selection. Precedence (docs/ADMIN-RAIL.md Phase 1):
  //   1. detail.caps — the page resolved the REAL caps for this scope.
  //   2. providerCaps on the GLOBAL scope only — the shell threads getGlobalCapabilities().
  //   3. SELECTION_VIEWER — the caps-blind fallback reproducing the prior modulesForScopeKind set.
  const viewer: AppViewer = detail?.caps
    ? { caps: new Set(detail.caps) }
    : isSpace
      ? // A Space carries NO community caps; its editor Apps gate on the per-Space functions the trigger
        // resolved (spaceFunctionAccess over the viewer's space role, staff preview seeing all). The
        // always-on floor (Basics / Page / Mode / Services / Danger, gate 'none') shows regardless, so the
        // owner never opens an empty rail (the fail-safe).
        { caps: new Set(), canUseSpaceFn: (fn) => (detail?.spaceFns ?? []).includes(fn) }
      : providerCaps && scope?.kind === 'global'
        ? { caps: providerCaps }
        : SELECTION_VIEWER

  // Any signed-in viewer (role != null; a visitor preview is null, matching that preview). The
  // personal "You" set makes the editor set non-empty for every authed member → the bar is always
  // available (ADMIN-RAIL.md Phase 4). Fail-closed: signed-out ⇒ role null ⇒ no personal apps.
  const authed = role != null

  // Personal "You" apps — global-scope, member-level; a member's OWN account settings. Resolved
  // INDEPENDENT of the page scope (they are the same on every page) and caps-blind via
  // SELECTION_VIEWER (each self-gates + re-checks server-side, exactly like the manage modules).
  const personalGlobalApps = authed
    ? appsForScope({ kind: 'global' }, SELECTION_VIEWER, 'editor').filter((a) => PERSONAL_MODULE_IDS.has(a.id))
    : []
  // Honor operator App-overrides on the personal set too. Previously the personal apps skipped
  // applyOverrides entirely, and since they are the ONLY editable App set at global scope, the global
  // App-overrides manager (/admin/page-layout/apps, which defaults to scope=global) was a complete
  // no-op: disable / reorder / min_role changes saved and badged "Override", but nothing changed for
  // any viewer. Apply the overlay when the panel's scope IS global — there `appOverrides` are the
  // matching global-scope overrides these personal apps belong to; on an entity page the personal set
  // stays unoverridden rather than pick up a wrong-scope override. (Threading the global overrides
  // onto entity-scope pages so a globally-disabled personal app also hides there is a follow-up.)
  const personalApps = scope?.kind === 'global' ? applyOverrides(personalGlobalApps) : personalGlobalApps

  // The management (page-scoped) editor apps, with any personal app filtered out so the global
  // scope's personal set never doubles as a management category on a global-scope page. Operator
  // overrides (Phase 6) are applied here: disabled Apps drop, `position` reorders, and the per-App
  // min_role floor gates against the viewer's role (no-op today until overrides are threaded + saved).
  // Space bypasses the community `manager` gate: a Space owner may be a plain community member, so its
  // authority is the SpaceRole ladder (encoded in the trigger's spaceFns + the always-on floor), not the
  // host+/staff community gate. The Customize trigger is owner-gated at the source, and each surface's
  // sub-page re-checks its own gate server-side. Space Apps are never personal, so no PERSONAL filter.
  const mgmtApps = isSpace
    ? applyOverrides(settingsAppsFor(scope, viewer))
    : manager
      ? applyOverrides(settingsAppsFor(scope, viewer).filter((a) => !PERSONAL_MODULE_IDS.has(a.id)))
      : []
  // Personal first, then management — SPINE_ORDER leads with 'account', so groupIntoSpine emits the
  // "You" section above the management spine.
  const apps = [...personalApps, ...mgmtApps]
  const appById = new Map(apps.map((a) => [a.id, a]))

  // THE single render decision point (inline-first rail, ADR-514). Per app, branch on its editor
  // `render` classification, NOT on the entity kind: a `link` surface is a feature workflow drawn as a
  // compact link-row OUT to its own page; an `inline` surface mounts its editor component in the bar.
  // This lets a Space mix inline config editors (Basics / Mode / Page) with link-rows (Members / CRM /
  // Offerings / …). Each inline module self-gates server-side and renders null when unauthorized.
  const nodesForAppIds = (appIds: string[]): ReactNode[] =>
    appIds.flatMap((id) => {
      const app = appById.get(id)
      if (!app) return []
      if (app.surfaces.editor?.render === 'link') {
        // Space link-rows resolve their href via hrefForSurface (Danger + unmapped fall back to the
        // /manage console, so every row is a working link). Core/personal link surfaces resolve via
        // hrefForEntitySurface (ADR-514 Phase C/D): today that is the personal "You" feature workflows
        // (Account and privacy, Billing) → their /settings/* page; every core entity stays `inline`, so
        // no core-entity id resolves here yet. An unresolved href draws nothing (fail-safe).
        const href = spaceSlug
          ? hrefForSurface(id, spaceSlug) ?? `/spaces/${spaceSlug}/manage`
          : hrefForEntitySurface(id, scope)
        return href ? [<SurfaceLinkRow key={id} app={app} href={href} />] : []
      }
      const C = MODULE_COMPONENTS[id]
      return C ? [<C key={id} />] : []
    })

  const spineGroups = groupIntoSpine(apps)

  const isCircle = manager && /^\/circles\/[^/]+/.test(pathname)
  const questModule = manager ? questModuleFor(pathname) : null
  // The full page-content editor (title / description / hero / CTA). ADMIN routes are excluded.
  const contentModule =
    manager &&
    !pathname.startsWith('/admin') &&
    (CONTENT_EDIT_ROUTES as readonly string[]).includes(pathname) &&
    meetsAccess('admin', role) ? (
      <PageContentModule />
    ) : null

  // The generic "Page" group is for operator CONTENT pages. An entity-detail page owns its identity
  // through its OWN settings block above, so the generic group is dropped on every entity scope.
  const entityScope = isEntityScope(pathname)
  const showPageSettings = isOperator && !entityScope

  // Module-driven detail pages (circle / event) get the Layout editor (operator-only, network-wide).
  const showCircleLayout = isCircle && isOperator && isModuleRoute(pathname)
  const isEvent = manager && /^\/events\/[^/]+/.test(pathname)
  const showEventLayout = isEvent && isOperator && isModuleRoute(pathname)

  // ── Inline extras, folded into their natural spine slot (quest→engage, layout→layout,
  //    event danger→danger, page-content→basics). Interspersed with the slot's apps in spine order. ──
  const questBlock: ReactNode = questModule ? <div className="min-w-0">{questModule}</div> : null
  const contentBlock: ReactNode = contentModule ? <div className="min-w-0">{contentModule}</div> : null
  const circleLayoutNode: ReactNode = showCircleLayout ? layoutBlock('circle') : null
  const eventLayoutNode: ReactNode = showEventLayout ? layoutBlock('event') : null
  const dangerBlock: ReactNode = isEvent ? (
    <div className="min-w-0">
      <EventDangerZone />
    </div>
  ) : null

  const extrasBySlot: Partial<Record<AdminSlot, ReactNode[]>> = {}
  const addExtra = (slot: AdminSlot, node: ReactNode) => {
    if (!node) return
    ;(extrasBySlot[slot] ??= []).push(node)
  }
  addExtra('engage', questBlock)
  addExtra('basics', contentBlock)
  addExtra('layout', circleLayoutNode)
  addExtra('layout', eventLayoutNode)
  addExtra('danger', dangerBlock)

  // ── The flat, spine-ordered sections (inline-first rail, ADR-514): every spine slot with an app OR a
  //    folded extra becomes ONE section — a header (SPINE_META label + Icon) followed by that slot's
  //    nodes, inline editors and/or link-rows interspersed in spine order. Personal "You" leads (account
  //    slot is first in SPINE_ORDER), then the management spine. All rendered at once, all in view. ──
  const sections: AdminSection[] = SPINE_ORDER.flatMap((slot) => {
    const group = spineGroups.find((g) => g.slot === slot)
    const appIds = group?.appIds ?? []
    const extras = extrasBySlot[slot] ?? []
    if (appIds.length === 0 && extras.length === 0) return []
    const meta = SPINE_META[slot]
    const nodes: ReactNode[] = [
      ...nodesForAppIds(appIds),
      ...extras.map((node, i) => <div key={`extra-${slot}-${i}`}>{node}</div>),
    ]
    return [{ slot, label: meta.label, Icon: meta.Icon, nodes }]
  })

  // The operator "Page" group — rendered below the sections, set apart by a hairline. Suppressed on
  // every entity scope (an entity owns its identity through its own sections above).
  const pageGroup: ReactNode = showPageSettings ? <PageSettingsModule hideBasics={!!contentModule} /> : null

  // ── Phase 5 (P3): attainable-but-locked management apps for this scope + REAL viewer — an App the
  //    viewer can't act on yet but could plausibly unlock (a plan-gated Space function). Rendered as a
  //    lock + reason, never an editor; personal apps are caps-gated and so are never attainable-locked.
  //    Empty over the live catalog today (no gate opts in), so this never falsely lights or crowds the
  //    bar — it wires the render pattern fail-safely (docs/ADMIN-RAIL.md Phase 5). ──
  const lockedApps: LockedRow[] = authed
    ? lockedAppsForScope(scope, viewer).map((l) => ({
        id: l.app.id,
        label: l.app.label,
        reason: l.reason,
        ...(l.cta ? { cta: l.cta } : {}),
      }))
    : []

  const hasContent = sections.length > 0 || !!pageGroup

  // Every scoped app (personal + manage + page blocks), mapped to a lightweight search row (P1/P6).
  const searchApps: SearchableApp[] = [
    ...personalApps,
    ...(manager || isOperator || isSpace
      ? applyOverrides(appsForScope(scope, viewer).filter((a) => !PERSONAL_MODULE_IDS.has(a.id)))
      : []),
  ].map((a) => ({
    id: a.id,
    label: a.label,
    description: a.description,
    category: a.category,
    Icon: a.surfaces.editor?.Icon,
  }))

  if (!hasContent) {
    return { hasContent: false, sections: [], pageGroup: null, searchApps: [], lockedApps: [] }
  }

  return { hasContent: true, sections, pageGroup, searchApps, lockedApps }
}
