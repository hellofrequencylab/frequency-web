import type { Metadata } from 'next'
import { getCachedViewerProfile } from '@/lib/auth'
import { applyViewAs, viewingAsVisitor } from '@/lib/view-as'
import { getStaffMember } from '@/lib/staff'
import type { CommunityRole } from '@/lib/core/roles'
import { SiteMapBody, siteMapFor, websiteLinks } from '@/components/frequency/members/site-map/site-map-body'

// The member site map: every place the member chrome links to, grouped like the menus and gated
// like them (the footer's "Site map" door). Under Frequency it is the reference's page (Site
// Map.html); under DAWN the same list in an Index shell. The gate reads the same role the shell
// does (the view-as role, and no staff axis while previewing), so an operator previewing as a
// member sees a member's map. Not the XML sitemap, which is app/sitemap.ts at /sitemap.xml.

export const metadata: Metadata = {
  title: 'Site map',
  description: 'Every part of the member site in one place.',
  // A navigation page for members, not a search destination: kept out of the index, links followed.
  robots: { index: false, follow: true },
}

export default async function SiteMapPage() {
  const profile = await getCachedViewerProfile()
  const realRole = (profile?.community_role ?? 'member') as CommunityRole
  const [role, asVisitor, staff] = profile
    ? await Promise.all([applyViewAs(realRole), viewingAsVisitor(realRole), getStaffMember().catch(() => null)])
    : [null, true, null]
  const columns = siteMapFor({ role: asVisitor ? null : role, staffRole: staff?.role ?? null })
  const website = websiteLinks('frequency')
  return <SiteMapBody columns={columns} website={website} />
}
