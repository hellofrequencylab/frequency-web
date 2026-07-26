import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { resolveCircleCrm } from '@/lib/crm/leader-crm-access'
import { loadCircleCrmRoster } from '@/lib/circles/crm-roster'
import { DashboardTemplate } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { LeaderCrmViewer } from '@/components/people/leader-crm-viewer'
import { loadCircleCrmDetail, openCircleMemberDm } from './actions'

// MESSAGE CIRCLE (CRM Everywhere plan 4.2 / ADR-827, owner ruling 2026-07-26). The circle's
// communication surface: the SAME master-detail member viewer as the platform Resonance CRM,
// scoped to this circle's active members, with the leader-trimmed detail pane and a Message
// button that opens a 1:1 thread through the scoped-DM policy gate.
//
// SECURITY: gated server-side on `circle.moderate` through the shared resolver
// (lib/crm/leader-crm-access — the same slug resolution + capability path the colocated actions
// re-run per request). A viewer who cannot moderate this circle gets notFound(); we never reveal
// the route. The admin client bypasses RLS, so this gate — not RLS — is the authority.

export const metadata: Metadata = {
  title: 'Message Circle',
  description: 'See every member of your circle and message any of them.',
}

export default async function CircleCrmPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  // Resolve + GATE in one shared step: slug -> circle (archived excluded) -> circle.moderate.
  const circle = await resolveCircleCrm(slug)
  if (!circle) notFound()

  // The audience per the owner ruling: active members of the circle (plus its host).
  const members = await loadCircleCrmRoster(circle.id)

  return (
    <DashboardTemplate
      eyebrow="Manage"
      title="Message Circle"
      description={`Everyone in ${circle.name} in one place. Pick a member to see their story, then send them a message.`}
      back={{ href: `/circles/${circle.slug}/manage`, label: 'Back to manage' }}
      width="wide"
      stats={
        <>
          <StatCard label="Members" value={String(members.length)} />
          <StatCard label="Capacity" value={circle.memberCap > 0 ? `${circle.memberCount} of ${circle.memberCap}` : String(circle.memberCount)} />
        </>
      }
    >
      <LeaderCrmViewer
        members={members}
        loadDetail={loadCircleCrmDetail.bind(null, circle.slug)}
        openDm={openCircleMemberDm.bind(null, circle.slug)}
        empty={{
          title: 'No members yet',
          description: 'When people join this circle they show up here, with everything about each one a click away.',
        }}
      />
    </DashboardTemplate>
  )
}
