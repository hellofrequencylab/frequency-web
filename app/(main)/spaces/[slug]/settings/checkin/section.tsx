import { Suspense } from 'react'
import { StatCard } from '@/components/ui/stat-card'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { FeatureLockedNotice } from '@/components/spaces/feature-locked-notice'
import { ensureCheckinNode, countCheckins } from '@/lib/spaces/checkin'
import { nodeUrl } from '@/lib/qr/links'
import { renderQrSvg } from '@/lib/qr/render'
import { CheckinCodeCard } from '@/components/spaces/checkin-code-card'
import { CheckinRoster } from '@/components/spaces/checkin-roster'
import { Users } from 'lucide-react'
import type { Space } from '@/lib/spaces/types'

// CHECK-IN section BODY. Its ONE caller is ./checkin-body.tsx, the `?panel=checkin` workspace. Offerings
// does not compose it: check in is an event mechanic, not a Space offering, so the section came off that
// page and the `checkin` function key is retired to `events` (LIVE-226, lib/spaces/functions.ts
// RETIRED_SPACE_FUNCTIONS). It was never event_space-only either, whatever this comment used to say:
// every Space type has had every function since ADR-517 Phase F.
//
// The route + auth gate stays on the caller. It reuses the EXISTING scan -> capture pipeline (the check-in
// code is an ordinary `qr` node); this section adds the door-side roster + the QR to print. The node is
// ensured server-side here when an EDITOR opens the surface (ensureCheckinNode is canEditProfile-gated;
// a previewer never mints a node). The `checkin` gate below resolves to the `events` switch + its
// editor min-role, so a manager who can run events can work the door.
//
// Copy obeys CONTENT-VOICE: plain labels, no narrated feelings, no em/en dashes.

export async function CheckinSection({
  space,
  viewerProfileId,
  staffViewing,
}: {
  space: Space
  viewerProfileId: string | null
  staffViewing: boolean
}) {
  const brandName = space.brandName ?? space.name

  // PER-SPACE FUNCTION GATE. Check in defaults to MODERATOR (the door is a moderator+ tool), so by
  // default an editor-only manager sees the locked state. A staff janitor keeps the read-only preview.
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  if (!staffViewing && !spaceFunctionAccess(space, 'checkin', caps.role)) {
    return (
      <FeatureLockedNotice
        brandName={brandName}
        slug={space.slug}
        type={space.type}
        label="Check in"
        reason={spaceFunctionAccess(space, 'checkin', 'admin') ? 'role' : 'disabled'}
        canManageMembers={caps.canManageMembers}
      />
    )
  }

  // Ensure (create-or-get) the Space's one check-in node, then render its QR with the EXISTING helpers
  // (read-only: nodeUrl builds the /n/<id> destination; renderQrSvg paints it inline). A staff
  // previewer reads an existing node but never mints one, so the card may be absent for them.
  const node = await ensureCheckinNode(space.id)
  const link = node ? nodeUrl(node.id, node.secret) : null
  const svg = link ? await renderQrSvg(link, 256) : null

  // The count for the StatCard is a head/count query (countCheckins) — NOT listCheckins(...).length, which
  // saturates at the 500-row roster cap and would re-fetch the roster the CheckinRoster below already reads.
  const checkinCount = await countCheckins(space.id)

  return (
    <div className="space-y-8">
      {/* The analytics number, plain and honest: total check-ins on this Space's code. */}
      <div className="grid grid-cols-2 gap-3 sm:max-w-xs">
        <StatCard bordered label="Checked in" value={checkinCount} icon={Users} />
      </div>

      {/* The QR to print. Rendered server-side from the existing helpers; the card only displays and
          offers copy / download (no edits to lib/qr). Absent only when no node could be made (e.g. a
          staff previewer before an editor has opened the surface). */}
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
        <SectionHeader title="Who checked in" count={checkinCount} />
        <Suspense fallback={<RosterSkeleton />}>
          <CheckinRoster spaceId={space.id} />
        </Suspense>
      </section>
    </div>
  )
}

// Dimension-matched skeleton for the streamed roster (no CLS, PAGE-FRAMEWORK §5.4).
function RosterSkeleton() {
  return (
    <div className="space-y-px rounded-card border border-border bg-surface p-2 lift-1">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-lg bg-surface-elevated/50" />
      ))}
    </div>
  )
}
