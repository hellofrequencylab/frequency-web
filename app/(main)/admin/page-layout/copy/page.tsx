import { Globe, Info } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { PageContentModule } from '@/components/admin/modules/page-content-module'
import { SITE_SCOPE, CONTENT_EDIT_ROUTES } from '@/lib/layout/editable-content'

export const dynamic = 'force-dynamic'

// The Site copy editor (staff, admin+) — the third tab of /admin/page-layout, and the ONE operator
// surface for the copy cascade's site rung (PROG-P6 (b), ADR-1284; the cascade itself is ADR-1122,
// lib/layout/content-cascade.ts).
//
// Every registered page resolves its intro copy, hero and call-to-action through page -> section
// -> site -> code. The page and section rungs are set from the page's own Settings panel, standing
// on the route. The site rung is the reserved `'*'` row: not a route, so no page can stand on it,
// and until this surface existed the resolver read a row nothing could write. This page renders the
// SAME editor module the Settings panel does, pointed at `SITE_SCOPE`, so the site row is written
// by the same action, under the same admin gate, with the same validation as any page row.
//
// Identity (title, description) never inherits, so the module offers neither here: the form shows
// exactly the fields the cascade carries down.

export default async function SiteCopyAdminPage() {
  await requireAdmin('admin')

  const pageRoutes = CONTENT_EDIT_ROUTES.filter((r) => !r.startsWith('/admin'))

  return (
    <AdminTemplate
      title="Site copy"
      eyebrow="Platform"
      icon={Globe}
      description="Set the intro copy, hero image, and call-to-action every page starts from. A section or a page that sets its own field wins over this; leave a field blank here and pages use their built-in copy."
      width="default"
    >
      <AdminSection>
        <div className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 text-body-sm text-muted">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-subtle" aria-hidden />
          <p>
            Pages inherit down the route tree: a page reads its own row, then each section above it,
            then this site row, then its built-in copy. Titles and descriptions never inherit, so
            they are set on the page itself. To set a single page or section, open its Settings
            panel on the page: {pageRoutes.join(' · ')}.
          </p>
        </div>
      </AdminSection>

      <AdminSection
        title="Site defaults"
        description="Saved to the reserved site row. Changes reach every page on the next request."
      >
        <div className="max-w-2xl">
          <PageContentModule route={SITE_SCOPE} />
        </div>
      </AdminSection>
    </AdminTemplate>
  )
}
