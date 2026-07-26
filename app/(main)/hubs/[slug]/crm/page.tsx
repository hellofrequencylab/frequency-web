import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { resolveHubCrm } from '@/lib/crm/leader-crm-access'
import { loadPlaceTreeCrmRoster } from '@/lib/circles/crm-roster'
import { DashboardTemplate } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { LeaderCrmViewer } from '@/components/people/leader-crm-viewer'
import { loadHubCrmDetail, openHubMemberDm } from './actions'

// The HUB member-communication surface (CRM Everywhere plan Phase 4 sibling / ADR-827, owner
// directive: the communication module is uniform on every primary admin dashboard). The same
// master-detail member viewer as Message Circle, scoped to the active members of every circle in
// this hub's subtree, with the leader-trimmed detail and the scoped-DM Message button.
//
// SECURITY: gated server-side on `hub.manage` (guide, parent mentor, janitor — the same gate as
// /hubs/[slug]/manage) through the shared resolver the colocated actions re-run per request.
// notFound() for anyone else; we never reveal the route.

// NAMING: provisional. "Message Members" is not canon-ruled yet for hub/nexus (NAMING.md rules
// circle = "Message Circle"); revisit when the owner names the hub/nexus surfaces.
export const metadata: Metadata = {
  title: 'Message Members',
  description: 'See every member across your hub and message any of them.',
}

export default async function HubCrmPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  // Resolve + GATE in one shared step: slug -> hub -> hub.manage.
  const hub = await resolveHubCrm(slug)
  if (!hub) notFound()

  // The audience: active members of every circle in the hub's subtree (display read capped;
  // the viewer filters client-side over what it holds).
  const members = await loadPlaceTreeCrmRoster({ kind: 'hub', id: hub.id })

  return (
    <DashboardTemplate
      eyebrow="Manage"
      title="Message Members"
      description={`Everyone across the circles of ${hub.name} in one place. Pick a member to see their story, then send them a message.`}
      back={{ href: `/hubs/${hub.slug}/manage`, label: 'Back to manage' }}
      width="wide"
      stats={<StatCard label="Members" value={String(members.length)} />}
    >
      <LeaderCrmViewer
        members={members}
        loadDetail={loadHubCrmDetail.bind(null, hub.slug)}
        openDm={openHubMemberDm.bind(null, hub.slug)}
        empty={{
          title: 'No members yet',
          description: 'When people join circles in this hub they show up here, with everything about each one a click away.',
        }}
      />
    </DashboardTemplate>
  )
}
