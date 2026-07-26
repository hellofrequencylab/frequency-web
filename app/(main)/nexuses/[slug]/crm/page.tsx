import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { resolveNexusCrm } from '@/lib/crm/leader-crm-access'
import { loadPlaceTreeCrmRoster } from '@/lib/circles/crm-roster'
import { DashboardTemplate } from '@/components/templates'
import { Skeleton } from '@/components/ui/skeleton'
import { StatCard } from '@/components/ui/stat-card'
import { LeaderCrmViewer } from '@/components/people/leader-crm-viewer'
import { loadNexusCrmDetail, openNexusMemberDm } from './actions'

// The NEXUS member-communication surface (CRM Everywhere plan Phase 4 sibling / ADR-827, owner
// directive: the communication module is uniform on every primary admin dashboard). The same
// master-detail member viewer as Message Circle, scoped to the active members of every circle in
// this nexus's subtree (its hubs and their circles), with the leader-trimmed detail and the
// scoped-DM Message button.
//
// SECURITY: gated server-side on `nexus.manage` (mentor, janitor — the same gate as
// /nexuses/[slug]/manage) through the shared resolver the colocated actions re-run per request.
// notFound() for anyone else; we never reveal the route.
//
// Speed is structural (PAGE-FRAMEWORK §5): the shell renders immediately; the roster read (and
// its roster-count StatCard) streams behind <Suspense>, same as Message Attendees.

// NAMING: provisional. "Message Members" is not canon-ruled yet for hub/nexus (NAMING.md rules
// circle = "Message Circle"); revisit when the owner names the hub/nexus surfaces.
export const metadata: Metadata = {
  title: 'Message Members',
  description: 'See every member across your nexus and message any of them.',
}

export default async function NexusCrmPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  // Resolve + GATE in one shared step: slug -> nexus -> nexus.manage.
  const nexus = await resolveNexusCrm(slug)
  if (!nexus) notFound()

  return (
    <DashboardTemplate
      eyebrow="Manage"
      title="Message Members"
      description={`Everyone across the hubs and circles of ${nexus.name} in one place. Pick a person to see their story, then send them a message.`}
      back={{ href: `/nexuses/${nexus.slug}/manage`, label: 'Back to manage' }}
      width="default"
    >
      <Suspense fallback={<Skeleton className="h-96 rounded-2xl" />}>
        <NexusRosterSection nexusId={nexus.id} slug={nexus.slug} />
      </Suspense>
    </DashboardTemplate>
  )
}

/** The suspended roster child: awaits the audience (active members of every circle in the
 *  nexus's subtree, display read capped; the viewer filters client-side over what it holds), then
 *  renders the roster-count StatCard and the ONE shared LeaderCrmViewer. */
async function NexusRosterSection({ nexusId, slug }: { nexusId: string; slug: string }) {
  const members = await loadPlaceTreeCrmRoster({ kind: 'nexus', id: nexusId })

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Members" value={String(members.length)} />
      </div>
      <LeaderCrmViewer
        members={members}
        loadDetail={loadNexusCrmDetail.bind(null, slug)}
        openDm={openNexusMemberDm.bind(null, slug)}
        empty={{
          title: 'No members yet',
          description: 'When people join circles in this nexus they show up here, with everything about each one a click away.',
        }}
      />
    </>
  )
}
