import { getMemberProfileModules } from '@/lib/spotlight/data'
import { resolveRows } from '@/lib/entity-blocks/layout'
import { renderMemberBlockNodes } from '@/components/widgets/member-profile/member-profile-modules'
import { LiveProfileGrid } from '@/components/entity-blocks/live-profile-grid'

// THE OWNER'S LIVE PAGE PREVIEW (ADR-516 Phase C; ADR-522). On the member's OWN profile this renders their
// entity-grid layout through the LiveProfileGrid, seeded from the persisted rows. Every candidate member
// block is rendered ONCE here, server-side, into a keyed node map; the client grid arranges those nodes by
// the shared ProfileLayoutContext, so the in-rail builder's edits repaint this region INSTANTLY (no
// round-trip) and, on the member's next visit, the debounced save has reconciled the server truth.
//
// This is the WYSIWYG surface the builder edits (the same-route slide-over sits over it). It is the member
// (self) preview only — the public Spotlight still renders through Puck (ADR-508), nothing live changes.
// DECOUPLED FROM THE PUBLISH GATE (ADR-522): reads through getMemberProfileModules so the grid shows for
// EVERY owner regardless of tier / meta.spotlight.published — the visitor view (ProfileSpotlightBlocks)
// renders the SAME resolved grid, so owner-preview and visitor-view match. FAIL-SAFE: a missing / inactive
// member renders nothing, and resolveRows falls back to the default starter when the saved grid is empty.

export async function OwnerProfileLayoutPreview({ handle }: { handle: string }) {
  let data: Awaited<ReturnType<typeof getMemberProfileModules>> = null
  try {
    data = await getMemberProfileModules(handle)
  } catch {
    data = null
  }
  if (!data) return null

  const nodes = renderMemberBlockNodes(data, data.grid)
  const rows = resolveRows(data.grid, 'member')
  const hidden = data.grid?.hidden ?? []

  return (
    <div className="@container/profile">
      <LiveProfileGrid
        nodes={nodes}
        initialRows={rows}
        initialHidden={hidden}
        initialContent={data.grid?.content ?? {}}
        initialStyle={data.grid?.style ?? {}}
      />
    </div>
  )
}
