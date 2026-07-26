import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { resolveCircleCrm } from '@/lib/crm/leader-crm-access'
import { loadCircleCrmRoster } from '@/lib/circles/crm-roster'
import { DashboardTemplate } from '@/components/templates'
import { Skeleton } from '@/components/ui/skeleton'
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
//
// Speed is structural (PAGE-FRAMEWORK §5): the shell renders immediately; the roster read (and
// its roster-count StatCard) streams behind <Suspense>, same as Message Attendees.

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

  return (
    <DashboardTemplate
      eyebrow="Manage"
      title="Message Circle"
      description={`Everyone in ${circle.name} in one place. Pick a person to see their story, then send them a message.`}
      back={{ href: `/circles/${circle.slug}/manage`, label: 'Back to manage' }}
      width="default"
    >
      <Suspense fallback={<Skeleton className="h-96 rounded-2xl" />}>
        <CircleRosterSection circleId={circle.id} slug={circle.slug} />
      </Suspense>
    </DashboardTemplate>
  )
}

/** The suspended roster child: awaits the audience (active members plus the host, the owner
 *  ruling), then renders the roster-count StatCard and the ONE shared LeaderCrmViewer. */
async function CircleRosterSection({ circleId, slug }: { circleId: string; slug: string }) {
  const members = await loadCircleCrmRoster(circleId)

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Members" value={String(members.length)} />
      </div>
      <LeaderCrmViewer
        members={members}
        loadDetail={loadCircleCrmDetail.bind(null, slug)}
        openDm={openCircleMemberDm.bind(null, slug)}
        empty={{
          title: 'No members yet',
          description: 'When people join this circle they show up here, with everything about each one a click away.',
        }}
      />
    </>
  )
}
