'use client'

import { useEffect, useState, type ComponentType, type ReactNode } from 'react'
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
import {
  SPINE_ORDER,
  SPINE_META,
  PERSONAL_META,
  groupIntoSpine,
  summaryFor,
  shouldFlatten,
} from '@/lib/admin/modules/spine'
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

// The SETTINGS CONTENT — the registry-selected manager modules (Page settings, Circle Quest, page
// content) plus the operator "Page" group (Layout / SEO / Status), resolved from the pathname.
// Extracted from SettingsDrawer so BOTH the desktop slide-over (SettingsDrawer) and the mobile
// full-screen sheet (MobileSettingsSheet) render the SAME content from one source. Each surface
// owns only its own chrome (header / positioning); the body is this hook.
//
// LP4 / ADMIN-RAIL Phase 3: this hook now returns a STRUCTURED model — the modules grouped into the
// 9-category spine (lib/admin/modules/spine) so the AdminBar body can render a browse-first drill-down
// (HOME categories → CATEGORY detail → search). A thin `content` adapter keeps today's flat stacked
// markup for the collapse case (a single populated category = pixel-identical to the old panel).

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

// Fallback summaries for categories that are populated ONLY by an inline extra (no catalog app), so the
// spine's `summaryFor` returns ''. Voice canon: no em dashes.
const EXTRA_SUMMARY: Partial<Record<AdminSlot, string>> = {
  layout: 'Blocks and order',
  danger: 'Cancel and delete',
  basics: 'Page content',
  engage: 'Challenges and quests',
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

/** One Space surface as a compact link-row into its EXISTING `/settings/*` sub-page (ENTITY-MANAGEMENT /
 *  PR C, option (a) rendering): the rail deep-links, it never inlines the editor. Danger (no sub-page) and
 *  any unmapped id fall back to the `/manage` console, where the delete control lives, so every row is a
 *  working link. Mirrors the console's SectionRow chrome (tokens only). */
function SpaceSurfaceRow({ app, slug }: { app: App; slug: string }) {
  const href = hrefForSurface(app.id, slug) ?? `/spaces/${slug}/manage`
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

/** One populated spine category, ready to render as a browse row + a detail screen. */
export interface AdminCategory {
  slot: AdminSlot
  label: string
  Icon: LucideIcon
  /** One-line row summary (icon · label · summary · ›). */
  summary: string
  /** The detail body — the slot's module cards plus any folded inline extra. */
  body: ReactNode
  /** The catalog app ids that landed in this slot (empty for an extra-only category). */
  appIds: string[]
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

/** The STRUCTURED settings model the AdminBar body renders (docs/ADMIN-RAIL.md Phase 3). */
export interface SettingsPanelModel {
  /** Whether there is anything to render at all (each chrome hides an empty bar). */
  hasContent: boolean
  /** Collapse to the flat panel (<=1 drill target) vs. show the browse home + drill-down. */
  flat: boolean
  /** The populated spine categories, in fixed spine order. */
  categories: AdminCategory[]
  /** The operator "Page" group (Layout / SEO / Status), separate from the entity spine. */
  pageGroup: ReactNode | null
  /** Every scoped app, for the fuzzy search index. */
  searchApps: SearchableApp[]
  /** Attainable-but-locked apps (Phase 5 / P3): rendered as a lock + reason, never an editor. */
  lockedApps: LockedRow[]
  /** Thin adapter: today's flat stacked markup, rendered verbatim in the collapse case so the flat
   *  panel stays pixel-identical to before. */
  content: ReactNode
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
  // A Space renders its surfaces as link-rows (option (a)); every other scope renders its module cards.
  const mgmtAppById = new Map(mgmtApps.map((a) => [a.id, a]))
  const nodesForAppIds = (appIds: string[]): ReactNode[] => {
    if (isSpace && spaceSlug) {
      return appIds.flatMap((id) => {
        const app = mgmtAppById.get(id)
        return app ? [<SpaceSurfaceRow key={id} app={app} slug={spaceSlug} />] : []
      })
    }
    return appIds.flatMap((id) => {
      const C = MODULE_COMPONENTS[id]
      return C ? [<C key={id} />] : []
    })
  }

  // Personal first, then management — SPINE_ORDER leads with 'account', so groupIntoSpine emits the
  // "You" category above the management spine.
  const apps = [...personalApps, ...mgmtApps]
  const hasSettings = mgmtApps.length > 0
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
  //    event danger→danger, page-content→basics). Built once; referenced by BOTH the flat `content`
  //    adapter and the drill-down category bodies so they never diverge. ──
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

  // The page-settings column — the MANAGEMENT surfaces for this scope, ordered by spine (personal apps
  // are rendered separately in the "You" block below, never here). Module cards for an entity scope; the
  // Space's link-rows for a Space scope (nodesForAppIds branches). Only shown in the flat/collapse case.
  const orderedMgmtIds: string[] = groupIntoSpine(mgmtApps).flatMap((g) => g.appIds)
  const settingsBlock = hasSettings ? (
    <div className="min-w-0">
      <p className="mb-3 text-2xs font-semibold uppercase tracking-wide text-subtle">Page settings</p>
      <div className={isSpace ? 'space-y-1.5' : 'space-y-6'}>{nodesForAppIds(orderedMgmtIds)}</div>
    </div>
  ) : null

  // The personal "You" block — the personal module forms under a "You" header. Rendered at the TOP of
  // the flat panel (when the panel collapses) so a plain member opens straight into their own
  // settings; in the browse home the "You" category row carries the same forms as its drill target.
  const personalModules: { id: string; C: ComponentType }[] = personalApps.flatMap((a) => {
    const C = MODULE_COMPONENTS[a.id]
    return C ? [{ id: a.id, C }] : []
  })
  const personalBlock: ReactNode = personalModules.length ? (
    <div className="min-w-0">
      <p className="mb-3 text-2xs font-semibold uppercase tracking-wide text-subtle">{PERSONAL_META.label}</p>
      <div className="space-y-6">
        {personalModules.map(({ id, C }) => (
          <C key={id} />
        ))}
      </div>
    </div>
  ) : null

  // ── The drill-down categories: every spine slot with an app OR a folded extra, in spine order. ──
  const categories: AdminCategory[] = SPINE_ORDER.flatMap((slot) => {
    const group = spineGroups.find((g) => g.slot === slot)
    const appIds = group?.appIds ?? []
    const extras = extrasBySlot[slot] ?? []
    if (appIds.length === 0 && extras.length === 0) return []
    const meta = SPINE_META[slot]
    const summary = summaryFor(slot, apps) || EXTRA_SUMMARY[slot] || `${appIds.length + extras.length} settings`
    const body = (
      <div className={isSpace ? 'space-y-1.5' : 'space-y-6'}>
        {nodesForAppIds(appIds)}
        {extras.map((node, i) => (
          <div key={`extra-${i}`}>{node}</div>
        ))}
      </div>
    )
    return [{ slot, label: meta.label, Icon: meta.Icon, summary, body, appIds }]
  })

  // The operator "Page" group — a separate drill target, never one of the entity spine categories.
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

  const hasContent = categories.length > 0 || !!pageGroup
  // The personal "You" category never drives the collapse decision (it always rides along, inline in
  // the flat panel and as the lead row in the browse home). Flatten on the MANAGEMENT targets only, so
  // a single-category manager stays flat exactly as before Phase 4 — with the "You" block added on top.
  // A locked row is a browse-home affordance, so its presence keeps the home list (never collapse).
  const managementCategories = categories.filter((c) => c.slot !== 'account')
  const flat = shouldFlatten(managementCategories, { hasExtras: !!pageGroup }) && lockedApps.length === 0

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
    return { hasContent: false, flat: true, categories: [], pageGroup: null, searchApps: [], lockedApps: [], content: null }
  }

  // Whether any MANAGEMENT/operator content sits below the "You" block in the flat panel — drives the
  // hairline that sets the personal section apart from the rest.
  const hasBelowPersonal =
    hasSettings || !!questModule || !!contentModule || !!pageGroup || isEvent || showCircleLayout || showEventLayout

  // ── The thin `content` adapter — the personal "You" block on top, then today's flat stacked
  //    management markup verbatim, for the collapse case. ──
  const content = (
    <div className="space-y-5">
      {personalBlock}
      {personalBlock && hasBelowPersonal && <hr className="border-border" />}
      {isCircle ? (
        <div className="space-y-6">
          {settingsBlock}
          {questModule && <div className="min-w-0">{questModule}</div>}
          {showCircleLayout && circleLayoutNode}
        </div>
      ) : (
        <div className="space-y-6">
          {settingsBlock}
          {questModule && <div className="min-w-0">{questModule}</div>}
          {contentModule && <div className="min-w-0">{contentModule}</div>}
          {showEventLayout && eventLayoutNode}
          {/* Cancel + Delete live at the very bottom, BELOW the Layout picker — the
              destructive controls sit under everything else in the drawer. */}
          {dangerBlock}
        </div>
      )}

      {/* The operator page-globals group, set apart by a hairline. Suppressed on entity scopes. */}
      {pageGroup && (hasSettings || !!questModule || !!contentModule) && <hr className="border-border" />}
      {pageGroup}
    </div>
  )

  return { hasContent: true, flat, categories, pageGroup, searchApps, lockedApps, content }
}
