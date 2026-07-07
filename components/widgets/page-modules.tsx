import { Suspense, type ReactNode } from 'react'
import type { CommunityRole } from '@/lib/core/roles'
import { loadLayoutForRoute } from '@/lib/page-settings/store'
import { resolveSlots, resolveSlotHeaders } from '@/lib/page-settings/layout'
import { getViewerCommunityRole } from '@/lib/page-settings/viewer-role'
import { moduleIdsForScope } from '@/lib/widgets/modules'
import { componentFor } from '@/lib/widgets/registry'
import { SectionHeader } from '@/components/ui/section-header'
import type { TemplateId } from '@/lib/widgets/templates'

// The renderer for the per-route module-assignment engine (ADR-270/271/272). Resolves the
// interior TEMPLATE + per-slot module ids for a route across the scope cascade (exact → section
// → global, most-specific wins), drops any a viewer's role can't see (per-module gate), and lays
// them out in the chosen template's grid — each self-fetching RSC isolated in its own <Suspense>
// so a slow module never blocks the page or its siblings. Pass `role` to skip the viewer lookup.
// The route's MODULE SET is route-scoped (ADR-294, moduleIdsForScope) so a page only renders its
// own blocks; pass `moduleIds` to override. Fail-safe by construction: loadLayoutForRoute returns
// an empty config on any error and an empty resolution renders nothing, so the host page stays clean.
export async function PageModules({
  route,
  role,
  moduleIds,
  spaceId,
}: {
  route: string
  role?: CommunityRole
  /** Override the route's module set; defaults to moduleIdsForScope(route). */
  moduleIds?: readonly string[]
  /** Resolve the layout for THIS space (the per-entity layer, ENTITY-SPACES-BUILD §B.4). Defaults
   *  to the root space, so single-tenant callers (every existing surface) are unchanged. */
  spaceId?: string | null
}) {
  const config = await loadLayoutForRoute(route, spaceId)
  const viewerRole = role ?? (await getViewerCommunityRole())
  const bySlot = resolveSlots(config, moduleIds ?? moduleIdsForScope(route), viewerRole)
  // Owner-toggled row headers (ADR-562), keyed by slot id — rendered above a row that has content.
  const headerBySlot = resolveSlotHeaders(config)

  const total = Object.values(bySlot).reduce((n, ids) => n + ids.length, 0)
  if (total === 0) return null

  const slot = (id: string): ReactNode => {
    const ids = bySlot[id]
    if (!ids || ids.length === 0) return null
    // A row header renders only above a row that has visible content, so a header never appears
    // over an empty row. Semantic heading via the kit's SectionHeader (token classes, no hex).
    const header = headerBySlot[id]
    return (
      <>
        {header && <SectionHeader key={`${id}-header`} title={header} />}
        {ids.map((moduleId) => {
          const Component = componentFor(moduleId)
          if (!Component) return null
          return (
            <Suspense key={moduleId} fallback={null}>
              <Component />
            </Suspense>
          )
        })}
      </>
    )
  }

  return <TemplateGrid template={config.template} slot={slot} />
}

// The interior grid per template. Each slot is its OWN container context (`@container`, Tailwind
// v4) and stacks its modules with `space-y-4`; a block inside can then size itself to the slot it
// lands in — wide in `main`, compact in `side` — via container-query variants (`@lg:` etc.), so a
// block "auto-resizes based on where it is placed" without knowing the template. Columns collapse
// to one on small screens. Adding a template = one case here + a meta entry in
// lib/widgets/templates.ts.
function TemplateGrid({ template, slot }: { template: TemplateId; slot: (id: string) => ReactNode }) {
  switch (template) {
    case 'main-side':
      // The SIDE column stacks ABOVE main on small screens (order-first) but sits to the RIGHT on
      // lg+: a phone sees the high-signal side blocks (e.g. an event's Join box + facts) before the
      // long main flow, while desktop keeps the wide-main / narrow-side reading order.
      // Split is 3:2 (60/40) — a wider side than a 2:1, so substantial side content (RSVP box,
      // facts, map) gets comfortable room while main stays the dominant reading column.
      return (
        <div className="grid gap-6 lg:grid-cols-5 lg:gap-8">
          <div className="@container space-y-4 lg:col-span-3">{slot('main')}</div>
          <div className="@container order-first space-y-4 lg:order-none lg:col-span-2">{slot('side')}</div>
        </div>
      )
    case 'two-col':
      return (
        <div className="space-y-6">
          <div className="@container space-y-4">{slot('top')}</div>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="@container space-y-4">{slot('col-1')}</div>
            <div className="@container space-y-4">{slot('col-2')}</div>
          </div>
        </div>
      )
    case 'three-col':
      return (
        <div className="space-y-6">
          <div className="@container space-y-4">{slot('top')}</div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div className="@container space-y-4">{slot('col-1')}</div>
            <div className="@container space-y-4">{slot('col-2')}</div>
            <div className="@container space-y-4">{slot('col-3')}</div>
          </div>
        </div>
      )
    case 'header-side':
      // Same 3:2 (60/40) main/side split as main-side, under a full-width header.
      return (
        <div className="space-y-6">
          <div className="@container space-y-4">{slot('header')}</div>
          <div className="grid gap-6 lg:grid-cols-5 lg:gap-8">
            <div className="@container space-y-4 lg:col-span-3">{slot('main')}</div>
            <div className="@container space-y-4 lg:col-span-2">{slot('side')}</div>
          </div>
        </div>
      )
    case 'header-two-col':
      return (
        <div className="space-y-6">
          <div className="@container space-y-4">{slot('header')}</div>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="@container space-y-4">{slot('col-1')}</div>
            <div className="@container space-y-4">{slot('col-2')}</div>
          </div>
        </div>
      )
    case 'header-main-side-footer':
      // Full-width header, the same 3:2 main/side split as header-side, and a full-width footer
      // under both. Each region is its own @container so a block sizes to where it lands.
      return (
        <div className="space-y-6">
          <div className="@container space-y-4">{slot('header')}</div>
          <div className="grid gap-6 lg:grid-cols-5 lg:gap-8">
            <div className="@container space-y-4 lg:col-span-3">{slot('main')}</div>
            <div className="@container space-y-4 lg:col-span-2">{slot('side')}</div>
          </div>
          <div className="@container space-y-4">{slot('footer')}</div>
        </div>
      )
    default:
      return <div className="@container space-y-4">{slot('main')}</div>
  }
}
