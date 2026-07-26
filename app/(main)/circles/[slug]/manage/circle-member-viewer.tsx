import { LeaderCrmViewer } from '@/components/people/leader-crm-viewer'
import { loadCircleCrmRoster } from '@/lib/circles/crm-roster'
import { loadCircleCrmDetail, openCircleMemberDm } from '../crm/actions'

// THE MESSAGE CIRCLE VIEWER (CRM Everywhere plan 4.2 / ADR-827). The circle's message center,
// embedded at the top of the Manage hub's Home tab (ADR-828 standardization; formerly the body
// of the standalone /crm page, which now redirects to the hub): it awaits the roster (active
// members plus the host, the owner ruling) so the page shell paints immediately, then renders
// the ONE shared LeaderCrmViewer. The member count lives in the Home stat strip, not a StatCard
// here. The detail loader is the gate-checked loadCircleCrmDetail bound to the slug
// (leader-trimmed altitude), and the Message button is the scoped-DM server action; both
// re-check circle.moderate per request, so the page's render gate is UX only.

export async function CircleMemberViewer({ circleId, slug }: { circleId: string; slug: string }) {
  const members = await loadCircleCrmRoster(circleId)

  return (
    <LeaderCrmViewer
      members={members}
      loadDetail={loadCircleCrmDetail.bind(null, slug)}
      openDm={openCircleMemberDm.bind(null, slug)}
      empty={{
        title: 'No members yet',
        description:
          'When people join this circle they show up here, with everything about each one a click away.',
      }}
      searchPlaceholder="Search members"
    />
  )
}
