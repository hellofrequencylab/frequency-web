import { requireAdmin } from '@/lib/admin/guard'
import { PageLayoutTabs } from './page-layout-tabs'

// Shared shell for the Page layout manager (staff, admin+). Wraps both sub-routes — the Chrome
// (right-rail) manager at /admin/page-layout and the Apps (per-scope override) manager at
// /admin/page-layout/apps — with one tab strip, so an operator moves between them in place. The
// gate is applied here (defense in depth) and again in each page. Width matches AdminTemplate's
// default so the tabs line up with the page heading below them.

export default async function PageLayoutSectionLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin('admin')
  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageLayoutTabs />
      {children}
    </div>
  )
}
