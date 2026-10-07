import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { readWebsitePublished } from '@/lib/spaces/website'
import { readProgramOverview } from '@/lib/spaces/leadership'
import { siteAdminHandoffPath } from '@/lib/sites/site-admin-pass'
import { DashboardTemplate } from '@/components/templates'
import { buttonClasses } from '@/components/ui/button'
import { StaffPreviewBanner } from '@/components/spaces/staff-preview-banner'
import { OverviewEditor } from './overview-editor'

// THE LEADERSHIP PAGE (LIVE-862, reworked LIVE-864), in the Space console. The Executive Overview and the
// Yearly Calendar are admin pages ON THE WEBSITE (owner ruling 2026-10-07: "Those are Admin display pages
// on the site"), drawn in the design system's look at <site>/admin/overview and /admin/calendar. This page
// is where a manager opens them (each button goes through the handoff that lets them in) and writes the
// overview they show.
//
// SECURITY: gated exactly like every console page. The Space must be visible to the caller and the caller a
// manager (resolveSpaceManageAccess: owner / admin / editor), or a platform janitor previewing read-only.
// Everyone else gets notFound(), so the route does not reveal itself. The overview's one write re-gates in
// its action.

export const metadata: Metadata = {
  title: 'Leadership',
  description: 'Open your executive overview and yearly calendar, and write the overview.',
  robots: { index: false, follow: false },
}

export default async function SpaceLeadershipPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ edit?: string }>
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams])
  const caller = await getCallerProfile()
  const space = await getVisibleSpaceBySlug(slug, caller?.id ?? null)
  if (!space) notFound()

  const { canManage, staffViewing } = await resolveSpaceManageAccess(space, caller?.id ?? null, caller?.webRole)
  if (!canManage && !staffViewing) notFound()

  const brandName = space.brandName?.trim() || space.name
  const published = readWebsitePublished(space.preferences)
  const markdown = readProgramOverview(space.preferences)

  return (
    <DashboardTemplate
      eyebrow="Manage space"
      title="Leadership"
      description={`The executive overview and the yearly calendar for ${brandName} are admin pages on your website. Only your space's managers can open them.`}
      back={{ href: `/spaces/${space.slug}/manage`, label: 'Manage space' }}
    >
      {staffViewing && !canManage && <StaffPreviewBanner spaceName={brandName} />}
      <div className="space-y-6">
        {published ? (
          <div className="flex flex-wrap gap-3">
            <a href={siteAdminHandoffPath(space.slug, 'overview')} className={buttonClasses('primary', 'sm')}>
              Open the executive overview
            </a>
            <a href={siteAdminHandoffPath(space.slug, 'calendar')} className={buttonClasses('secondary', 'sm')}>
              Open the yearly calendar
            </a>
          </div>
        ) : (
          <p className="text-body-sm text-muted">Publish your website to open these pages on it.</p>
        )}
        {canManage && (
          <section className="space-y-3">
            <h2 className="text-card-title font-semibold text-text">The overview</h2>
            <OverviewEditor slug={space.slug} initial={markdown} startOpen={query.edit === '1' || !markdown} />
          </section>
        )}
      </div>
    </DashboardTemplate>
  )
}
