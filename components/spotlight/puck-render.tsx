import { BlockRender } from '@/lib/page-editor/block-render'
import type { SpotlightData } from '@/lib/spotlight/data'
import { config } from '@/lib/page-editor/config'
import { spotlightRenderMeta, spotlightPuckDoc } from '@/lib/spotlight/puck/resolve'
import { SpotlightShell } from './spotlight-shell'

// THE PUBLIC SPOTLIGHT, RENDERED THROUGH PUCK (Phase 3). Now the REVERSIBLE FALLBACK render: after the
// ADR-508 U3 cutover the live route renders the module engine (MemberProfileModules) instead, but this
// component is preserved intact so a revert is a one-line swap in app/spotlight/[handle]/page.tsx. The
// member's identity header + theme + background + join CTA are the shared SpotlightShell; this only
// supplies the BLOCK BODY — a <BlockRender> of the Puck document bridged from the stored SpotlightLayout.
//
// The stored SpotlightLayout is bridged into a Puck document by the pure converter (spotlightLayoutToPuck)
// — a MIGRATION-FREE bridge, so every existing spotlight keeps working. The server-resolved values (stat
// numbers, Top Friend faces) ride Puck `metadata`, NEVER the stored blocks, so a tampered meta blob can't
// fake them. <BlockRender> ships NO editor runtime; the shared `config` is client-safe.

export function SpotlightPuckRender({
  data,
  showJoinCta = false,
}: {
  data: SpotlightData
  showJoinCta?: boolean
}) {
  // The member's block body + its server-resolved metadata, from the ONE shared resolver every surface
  // uses (ADR-500 Phase C). `seedWhenEmpty` = the standalone page seeds the designed link-tree preset for
  // a published-but-unbuilt Spotlight, so it never renders as a bare card.
  const puckData = spotlightPuckDoc(data, { seedWhenEmpty: true })!
  const meta = spotlightRenderMeta(data)

  return (
    <SpotlightShell data={data} showJoinCta={showJoinCta}>
      <div className="space-y-4 [&_section]:!py-0">
        <BlockRender config={config} data={puckData} metadata={{ spotlight: meta }} />
      </div>
    </SpotlightShell>
  )
}
