import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { FocusTemplate } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { StaffPreviewBanner } from '@/components/spaces/staff-preview-banner'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { ensureCheckinNode, listCheckins } from '@/lib/spaces/checkin'
import { nodeUrl } from '@/lib/qr/links'
import { renderQrSvg } from '@/lib/qr/render'
import { CheckinCodeCard } from '@/components/spaces/checkin-code-card'
import { CheckinRoster } from '@/components/spaces/checkin-roster'
import { Users } from 'lucide-react'

// OWNER CHECK-IN ROSTER (ENTITY-SPACES-BUILD §C, Phase 2: "Event Space check-in: point a code at a
// check-in node (reuses nodes/captures, free)"). A centered, no-rail Focus surface, the Event Space
// analog of the memberships owner editor. It reuses the EXISTING scan -> capture pipeline: the
// check-in code is an ordinary `qr` node whose scan runs the normal /n/<nodeId> claim flow; this
// surface adds the door-side roster + the QR to print.
//
// It resolves the Space, gates RENDER on canManage || staffViewing (404s otherwise, no existence
// leak), then renders:
//   1. a count StatCard (how many have checked in), plus
//   2. the check-in QR to print (read-only render via the existing lib/qr helpers), plus
//   3. the live roster of who checked in, newest first, streamed behind <Suspense>.
//
// STAFF PREVIEW (a janitor viewing a Space they don't manage): the Staff preview banner shows; every
// read is gated on canEditProfile inside lib/spaces/checkin.ts, so a staff viewer sees the structure
// but the node + roster read fail-safe. The check-in node is ensured server-side here when an EDITOR
// opens the surface (ensureCheckinNode is canEditProfile-gated; a previewer never mints a node).
//
// Copy obeys CONTENT-VOICE: plain labels, no narrated feelings, no em/en dashes. "Check in" is the
// established member-facing name (NAMING, the Zap-button "Check In" tile).

export const metadata = {
  title: 'Check in',
}

export default async function SpaceCheckinPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  // Resolve the Space, failing closed on a missing / not-visible Space (no existence leak).
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()

  // Gate RENDER on canManage (owner / admin / editor) OR staffViewing (a janitor previewing). 404
  // (not 403) for everyone else so the surface never confirms it exists. The reads stay gated on
  // canEditProfile inside the lib, so staff viewing is read-only end to end.
  const { canManage, staffViewing } = await resolveSpaceManageAccess(
    space,
    viewerProfileId,
    caller?.webRole,
  )
  if (!canManage && !staffViewing) notFound()

  const brandName = space.brandName ?? space.name

  // Ensure (create-or-get) the Space's one check-in node, then render its QR with the EXISTING helpers
  // (read-only: nodeUrl builds the /n/<id> destination; renderQrSvg paints it inline). A staff
  // previewer reads an existing node but never mints one, so the card may be absent for them.
  const node = await ensureCheckinNode(space.id)
  const link = node ? nodeUrl(node.id, node.secret) : null
  const svg = link ? await renderQrSvg(link, 256) : null

  // The count for the StatCard is read once here (a fast scan of this Space's check-in node captures).
  const checkins = await listCheckins(space.id)

  return (
    <FocusTemplate
      eyebrow={brandName}
      title="Check in"
      description="Print this code at your door. Each scan records a check-in, and everyone who checks in shows on the roster below."
      back={{ href: `/spaces/${space.slug}/settings`, label: `Manage ${brandName}` }}
      width="wide"
    >
      {staffViewing && <StaffPreviewBanner spaceName={brandName} />}

      <div className="space-y-8">
        {/* The analytics number, plain and honest: total check-ins on this Space's code. */}
        <div className="grid grid-cols-2 gap-3 sm:max-w-xs">
          <StatCard bordered label="Checked in" value={checkins.length} icon={Users} />
        </div>

        {/* The QR to print. Rendered server-side from the existing helpers; the card only displays
            and offers copy / download (no edits to lib/qr). Absent only when no node could be made
            (e.g. a staff previewer before an editor has opened the surface). */}
        <section>
          <SectionHeader title="Your check-in code" />
          {svg && link ? (
            <CheckinCodeCard svg={svg} link={link} />
          ) : (
            <EmptyState
              title="No check-in code yet."
              description="Open this surface as an editor to create your door code."
            />
          )}
        </section>

        <section>
          <SectionHeader title="Who checked in" count={checkins.length} />
          <Suspense fallback={<RosterSkeleton />}>
            <CheckinRoster spaceId={space.id} />
          </Suspense>
        </section>
      </div>
    </FocusTemplate>
  )
}

// Dimension-matched skeleton for the streamed roster (no CLS, PAGE-FRAMEWORK §5.4).
function RosterSkeleton() {
  return (
    <div className="space-y-px rounded-2xl border border-border bg-surface p-2 shadow-sm">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-lg bg-surface-elevated/50" />
      ))}
    </div>
  )
}
