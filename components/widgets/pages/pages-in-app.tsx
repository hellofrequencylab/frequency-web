import { ExternalLink } from 'lucide-react'
import { MANAGED_ROUTES } from '@/lib/layout/page-chrome'
import { isModuleRoute } from '@/lib/widgets/module-routes'
import { SectionHeader } from '@/components/ui/section-header'
import { TABLE_WRAP, HEAD_ROW, TH, BODY_ROW, VIEW_LINK } from './shared'

// The IN-APP pages of the Pages workspace (ADR-261/262): every managed member surface, one list,
// the focused surfaces (boards, timers, the scanner) grouped at the end. Self-fetching, zero-prop RSC
// bound in lib/widgets/registry.tsx. No role gate beyond the workspace itself (admin+).
//
// WHAT AN OPERATOR EDITS HERE, AND WHERE. An in-app page has no block document; its body is a
// template plus, on a module route, <PageModules> (PAGE-FRAMEWORK: never the block editor on an
// authenticated route). What staff tune is the page's Settings group, opened from the Settings
// button ON the page: the header (title, subtitle, header image), SEO and visibility on every page,
// plus Layout (which modules show, and their order) on a module route. So the row says exactly that
// and offers View; it used to offer "Open & edit" with the `edit` query parameter set, which no page in this list reads
// (`useEditMode` is read on event pages only), which opened the page with nothing switched on.
//
// A patterned row (`/spaces/_/crm` and friends) stands for one page per Space: there is no single
// page to open, so it carries its pattern and no View link.

const AREAS = [
  { area: 'Member', label: 'Member pages' },
  { area: 'Focus surfaces', label: 'Focus surfaces' },
] as const

function editsFor(route: string): string {
  return isModuleRoute(route) ? 'Layout, header, SEO' : 'Header, SEO'
}

export async function PagesInApp() {
  return (
    <section>
      <SectionHeader title="In-app pages" count={MANAGED_ROUTES.filter((r) => r.area !== 'Operator').length} />
      <p className="-mt-1 mb-4 max-w-2xl text-body-sm text-muted">
        Member pages. Open one and use its Settings button to edit the header, SEO and, on a page built from
        modules, the layout.
      </p>
      <div className={`max-w-3xl ${TABLE_WRAP}`}>
        <table className="w-full text-body-sm">
          <thead>
            <tr className={HEAD_ROW}>
              <th className={TH}>Page</th>
              <th className={TH}>Route</th>
              <th className={TH}>Edit on the page</th>
              <th className={`${TH} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {AREAS.map(({ area, label }) => {
              const routes = MANAGED_ROUTES.filter((r) => r.area === area)
              if (routes.length === 0) return null
              return (
                <GroupRows key={area} label={label} routes={routes} />
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function GroupRows({ label, routes }: { label: string; routes: readonly (typeof MANAGED_ROUTES)[number][] }) {
  return (
    <>
      <tr className={BODY_ROW}>
        <th scope="rowgroup" colSpan={4} className={`${TH} bg-surface-elevated/60 text-meta text-subtle`}>
          {label}
        </th>
      </tr>
      {routes.map((r) => {
        const patterned = !!r.match
        return (
          <tr key={r.route} className={BODY_ROW}>
            <td className="px-4 py-3 font-medium text-text">{r.label}</td>
            <td className="px-4 py-3 font-mono text-meta text-subtle">
              {r.route}
              {patterned && <span className="ml-2 font-sans text-muted">one per Space</span>}
            </td>
            <td className="px-4 py-3 text-muted">{editsFor(r.route)}</td>
            <td className="px-4 py-3">
              <div className="flex items-center justify-end gap-3">
                {!patterned && (
                  <a href={r.route} target="_blank" rel="noreferrer" className={VIEW_LINK}>
                    <ExternalLink className="h-3.5 w-3.5" /> View
                  </a>
                )}
              </div>
            </td>
          </tr>
        )
      })}
    </>
  )
}
