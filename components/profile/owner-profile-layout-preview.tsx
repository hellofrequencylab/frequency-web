import { getPublishedSpotlight } from '@/lib/spotlight/data'
import { resolveRows } from '@/lib/entity-blocks/layout'
import { renderMemberBlockNodes } from '@/components/widgets/member-profile/member-profile-modules'
import { LiveProfileGrid } from '@/components/entity-blocks/live-profile-grid'

// THE OWNER'S LIVE PAGE PREVIEW (ADR-516 Phase C). On the member's OWN profile this renders their
// entity-grid layout through the LiveProfileGrid, seeded from the persisted rows. Every candidate member
// block is rendered ONCE here, server-side, into a keyed node map; the client grid arranges those nodes by
// the shared ProfileLayoutContext, so the in-rail builder's edits repaint this region INSTANTLY (no
// round-trip) and, on the member's next visit, the debounced save has reconciled the server truth.
//
// This is the WYSIWYG surface the builder edits (the same-route slide-over sits over it). It is the member
// (self) preview only — the public Spotlight still renders through Puck (ADR-508), nothing live changes.
// FAIL-SAFE: a member with no published Spotlight (no resolvable block data) renders nothing, and the
// builder in the rail still works on its own.

export async function OwnerProfileLayoutPreview({ handle }: { handle: string }) {
  let data: Awaited<ReturnType<typeof getPublishedSpotlight>> = null
  try {
    data = await getPublishedSpotlight(handle)
  } catch {
    data = null
  }
  if (!data) return null

  const nodes = renderMemberBlockNodes(data)
  const rows = resolveRows(data.grid, 'member')
  const hidden = data.grid?.hidden ?? []

  return (
    <div className="@container/profile">
      <LiveProfileGrid nodes={nodes} initialRows={rows} initialHidden={hidden} />
    </div>
  )
}
