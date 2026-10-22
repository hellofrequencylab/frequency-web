import { Suspense } from 'react'
import { StatCard } from '@/components/ui/stat-card'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { FeatureLockedNotice } from '@/components/spaces/feature-locked-notice'
import { ensureCheckinNode, countCheckins } from '@/lib/spaces/checkin'
import { signedNodeUrl, signedPlacardUrl } from '@/lib/qr/node-code'
import { renderQrSvg } from '@/lib/qr/render'
import { CheckinCodeCard } from '@/components/spaces/checkin-code-card'
import { CheckinRoster } from '@/components/spaces/checkin-roster'
import { RegularsSection } from './regulars-section'
import { ScannersSection } from './scanners-section'
import { MemberCardsSection } from './member-cards-section'
import { CheckinViews } from './checkin-views'
import { asCheckinView } from '@/lib/spaces/offerings'
import { Users } from 'lucide-react'
import { MyCardSection } from '@/components/member-cards/my-card-section'
import { memberCardsEnabled } from '@/lib/member-cards/store'
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
  view,
}: {
  space: Space
  viewerProfileId: string | null
  staffViewing: boolean
  /** `?view=`: `door` (the default) or `card`, the cards on their own page (LIVE-1297). */
  view?: string
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

  // THE CARDS VIEW (LIVE-1297): the viewer's one Crew card and the Space's own card, on their own page
  // under Check in. Neither needs the door node, so this renders before one is ensured. Role based: only
  // a real manager (not a staff preview) sees their own Crew card; the Space card follows its owner gate.
  if (asCheckinView(view) === 'card') {
    const ownCard = viewerProfileId && !staffViewing && memberCardsEnabled()
    return (
      <div className="space-y-8">
        <CheckinViews active="card" />
        {ownCard ? (
          <section className="space-y-3">
            <SectionHeader title="Your Crew card" />
            <p className="text-body-sm text-muted">The same card and editor as on My card.</p>
            <Suspense fallback={<RosterSkeleton />}>
              <MyCardSection profileId={viewerProfileId} />
            </Suspense>
          </section>
        ) : null}
        <Suspense fallback={<RosterSkeleton />}>
          <MemberCardsSection space={space} staffViewing={staffViewing} />
        </Suspense>
      </div>
    )
  }

  // Ensure (create-or-get) the Space's one check-in node, then render its QR with the EXISTING helpers
  // (read-only: signedNodeUrl builds the signed /n/<id> destination; renderQrSvg paints it inline). A staff
  // previewer reads an existing node but never mints one, so the card may be absent for them.
  const node = await ensureCheckinNode(space.id)
  // The tag holds the placard link: the same signed link plus `&m=nfc`, so a tap counts apart from a scan.
  const link = node ? signedNodeUrl(node.id) : null
  const nfcLink = node ? signedPlacardUrl(node.id) : null
  const svg = link ? await renderQrSvg(link, 256) : null

  // The count for the StatCard is a head/count query (countCheckins) — NOT listCheckins(...).length, which
  // saturates at the 500-row roster cap and would re-fetch the roster the CheckinRoster below already reads.
  const checkinCount = await countCheckins(space.id)

  return (
    <div className="space-y-8">
      <CheckinViews active="door" />

      {/* The analytics number, plain and honest: total check-ins on this Space's code. */}
      <div className="grid grid-cols-2 gap-3 sm:max-w-xs">
        <StatCard bordered label="Checked in" value={checkinCount} icon={Users} />
      </div>

      {/* The QR to print. Rendered server-side from the existing helpers; the card only displays and
          offers copy / download (no edits to lib/qr). Absent only when no node could be made (e.g. a
          staff previewer before an editor has opened the surface). */}
      <section>
        <SectionHeader title="Your check-in code" />
        {svg && link && nfcLink ? (
          <CheckinCodeCard svg={svg} link={link} nfcLink={nfcLink} />
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

      {/* REGULARS (LIVE-940): the stamp card that rides this door code. Streams after the roster. */}
      <Suspense fallback={<RosterSkeleton />}>
        <RegularsSection space={space} staffViewing={staffViewing} />
      </Suspense>

      {/* COUNTER SCANNERS (LIVE-1125): NFC card readers that check members in on this same door node. */}
      <Suspense fallback={<RosterSkeleton />}>
        <ScannersSection space={space} staffViewing={staffViewing} />
      </Suspense>
    </div>
  )
}

// Dimension-matched skeleton for the streamed roster (no CLS, PAGE-FRAMEWORK §5.4).
function RosterSkeleton() {
  return (
    <div className="space-y-px rounded-card border border-border bg-surface p-2 lift-1">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-control bg-surface-elevated/50" />
      ))}
    </div>
  )
}
