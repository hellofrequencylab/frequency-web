import Link from 'next/link'
import { ExternalLink, Pencil } from 'lucide-react'
import { MANAGED_ROUTES } from '@/lib/layout/page-chrome'
import { SectionHeader } from '@/components/ui/section-header'
import { TABLE_WRAP, HEAD_ROW, TH, BODY_ROW, VIEW_LINK, EDIT_BTN } from './shared'

// Pages-workspace layout modules for the IN-APP pages (ADR-261/262), one per managed AREA.
// Self-fetching, zero-prop RSCs bound in lib/widgets/registry.tsx and arranged through the
// on-page Layout editor. View opens the live page; Open & edit opens it in place with ?edit=1.
// No role gate beyond the workspace itself (admin+): in-app pages are visible to every operator
// who reaches /pages, so a Site Admin always has something to manage even without janitor.

function InAppSection({ area, label }: { area: 'Member' | 'Focus surfaces'; label: string }) {
  const routes = MANAGED_ROUTES.filter((r) => r.area === area)
  return (
    <section>
      <SectionHeader title={`In-app pages / ${label}`} />
      <p className="-mt-1 mb-4 max-w-2xl text-sm text-muted">
        Open any member-facing page with edit mode on. Staff edit it in place, right on the page.
      </p>
      <div className={`max-w-3xl ${TABLE_WRAP}`}>
        <table className="w-full text-sm">
          <thead>
            <tr className={HEAD_ROW}>
              <th className={TH}>Page</th>
              <th className={TH}>Route</th>
              <th className={`${TH} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {routes.map((r) => (
              <tr key={r.route} className={BODY_ROW}>
                <td className="px-4 py-3 font-medium text-text">{r.label}</td>
                <td className="px-4 py-3 font-mono text-xs text-subtle">{r.route}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-3">
                    <a href={r.route} target="_blank" rel="noreferrer" className={VIEW_LINK}>
                      <ExternalLink className="h-3.5 w-3.5" /> View
                    </a>
                    <Link href={`${r.route}?edit=1`} className={EDIT_BTN}>
                      <Pencil className="h-3.5 w-3.5" /> Open &amp; edit
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export async function PagesInAppMember() {
  return <InAppSection area="Member" label="Member" />
}

export async function PagesInAppFocus() {
  return <InAppSection area="Focus surfaces" label="Focus surfaces" />
}
