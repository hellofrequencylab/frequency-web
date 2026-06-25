import { requireLeadFloor } from '@/lib/admin/guard'
import { DashboardTemplate } from '@/components/templates'
import { PageModules } from '@/components/widgets/page-modules'

// The Leadership dashboard (/lead, label "Leadership", ADR-266): the CONSOLIDATED home for
// community leaders (host/guide/mentor) to manage everything they steward. It is now MODULE-DRIVEN
// (ADR-270/294): each area is a self-fetching, caller-scoped layout block in lib/widgets
// (lead-stats, lead-attention, lead-circles, lead-networks, lead-events, lead-journeys, lead-tools),
// laid out by <PageModules route="/lead"> and arrangeable from the on-page Settings → Layout panel.
// Every block scopes its reads to the caller's own profile (getCallerProfile) and self-hides when
// the leader has nothing of that type, so a host sees their circles, an event organizer sees their
// events, and so on — with no platform-wide read anywhere.

export const metadata = {
  title: 'Leadership',
  description: 'Lead your community: the circles, events, and Journeys you steward, what needs you, and your tools.',
}

export default async function LeadershipPage() {
  // Gate: community leaders only (host+). Pass the role through so the module resolver skips the
  // viewer lookup; each block re-scopes to the caller itself.
  const { role } = await requireLeadFloor()

  return (
    <DashboardTemplate
      eyebrow="Leadership"
      title="Lead your community"
      description="Everything you steward in one place: the circles you host, what needs you this week, your events and Journeys, and your leader tools. Open a circle to manage it, post, or run an event."
      width="wide"
    >
      <PageModules route="/lead" role={role} />
    </DashboardTemplate>
  )
}
