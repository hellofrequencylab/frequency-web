import { Info, LayoutPanelLeft } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import {
  MANAGED_ROUTES,
  railFor,
  loadChromeOverrides,
  type ManagedRoute,
  type Rail,
} from '@/lib/layout/page-chrome'
import { RouteChromeRow } from '@/components/admin/page-layout/route-chrome-row'

export const dynamic = 'force-dynamic'

// The Page layout manager (janitor-only) — back-end management of the PAGE TEMPLATE /
// CHROME structure (docs/PAGE-FRAMEWORK.md §3/§8). It lists the meaningful surfaces from
// the code chrome map (lib/layout/page-chrome.ts MANAGED_ROUTES) alongside each one's
// CURRENT effective rail (the code default merged with any saved override), each editable.
//
// v1 STORES intent: overrides are saved into page_chrome_overrides and surfaced here, but
// the live shell does not read them YET — adopting resolvePageChrome in the shell is a
// flagged follow-up. So today this configures the intended chrome; the visible effect on
// member pages lands when the shell switches over.

const AREA_ORDER: ManagedRoute['area'][] = ['Member', 'Focus surfaces', 'Operator']

const AREA_HINT: Record<ManagedRoute['area'], string> = {
  Member: 'The community surfaces members browse. Most keep the Global community rail.',
  'Focus surfaces': 'Single-task, full-width work surfaces. These default to No rail.',
  Operator: 'The /admin operator workspace, framed by its own top-nav (No rail).',
}

export default async function PageLayoutAdminPage() {
  await requireAdmin('janitor')

  // Fail-safe: an empty map (code defaults) on any error or pre-migration.
  const overrides = await loadChromeOverrides()

  const byArea = AREA_ORDER.map((area) => ({
    area,
    routes: MANAGED_ROUTES.filter((r) => r.area === area),
  })).filter((g) => g.routes.length > 0)

  const overrideCount = MANAGED_ROUTES.filter((r) => r.route in overrides).length

  return (
    <AdminTemplate
      title="Page layout"
      eyebrow="Platform"
      icon={LayoutPanelLeft}
      description="Frame each route's shell chrome: which right rail (if any) wraps it. Global is the community rail, Scoped is an in-body scope rail, and No rail is a full-width Focus surface. Override the built-in default per route, or reset to follow the code."
      width="default"
    >
      <AdminSection>
        <div className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-subtle" aria-hidden />
          <p>
            Overrides are stored now and take effect when the shell starts reading them (a
            planned follow-up). Until then this configures the intended chrome for each route;
            the visible change on member pages lands once the shell adopts the resolver.
            {overrideCount > 0 && (
              <>
                {' '}
                <span className="font-medium text-text">
                  {overrideCount} {overrideCount === 1 ? 'route is' : 'routes are'} overridden.
                </span>
              </>
            )}
          </p>
        </div>
      </AdminSection>

      {byArea.map(({ area, routes }) => (
        <AdminSection key={area} title={area} description={AREA_HINT[area]}>
          <div className="space-y-3">
            {routes.map((r) => {
              const codeRail: Rail = railFor(r.route)
              const override = (overrides[r.route] ?? null) as Rail | null
              return (
                <RouteChromeRow
                  key={r.route}
                  route={r.route}
                  label={r.label}
                  codeRail={codeRail}
                  initialOverride={override}
                />
              )
            })}
          </div>
        </AdminSection>
      ))}
    </AdminTemplate>
  )
}
