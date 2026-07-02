import { BlockRender } from '@/lib/page-editor/block-render'
import { config } from '@/lib/page-editor/config'
import { SectionHeader } from '@/components/ui/section-header'
import type { Data } from '@/lib/page-editor/types'
import { getPublishedSpotlight } from '@/lib/spotlight/data'
import { spotlightRenderMeta, spotlightPuckDoc } from '@/lib/spotlight/puck/resolve'
import type { SpotlightRenderMeta } from '@/lib/spotlight/puck/metadata'

// CROSS-SURFACE PHASE B (ADR-500) — the ADDITIVE bridge from the member's Spotlight
// (their bio-link, stored at profiles.meta.spotlight) into the in-app profile.
//
// The SAME content the standalone Spotlight page renders (components/spotlight/
// puck-render.tsx) also appears here, on the member's people/[handle] profile, in the
// in-app profile style: same database, distinct surface. This is a self-contained
// section the profile ADDS below its identity/stats band — it does NOT replace or
// restyle the bespoke profile, which stays the primary render.
//
// What it borrows from the Spotlight render bridge: the block-body part only, through the ONE
// shared resolver every surface uses (lib/spotlight/puck/resolve.ts, ADR-500 Phase C) — so the
// stat numbers + Top Friend faces on Puck `metadata` (never stored, so a tampered meta blob can't
// fake them) and the layout→Puck bridge are guaranteed IDENTICAL to the standalone Signal page.
// It deliberately DROPS Spotlight's own identity header (avatar/name/bio) and its full-screen theme
// wrapper — the profile already shows an identity band — keeping only the block body inside a
// normal profile card.
//
// FAIL-SAFE: most members have no published Spotlight yet, so this renders nothing by default.
// Unlike the standalone page, it passes seedWhenEmpty:false, so a published-but-unbuilt Spotlight
// resolves to a null doc and the section is omitted (this surface only appears when the member has
// actually built something). Any error also returns null, so the section can never break the
// profile. `config` is client-safe; getPublishedSpotlight is server-side, fine in this Server Component.

export async function ProfileLinksSection({ handle }: { handle: string }) {
  // Fetch + resolve inside the try (a failed read must never break the profile); the JSX is
  // constructed AFTER, outside the try/catch (react-hooks/error-boundaries).
  let resolved:
    | { puckData: Data; meta: SpotlightRenderMeta; firstName: string }
    | null = null
  try {
    const data = await getPublishedSpotlight(handle)
    // seedWhenEmpty:false → a published-but-unbuilt Spotlight yields a null doc, so we show nothing.
    const puckData = data ? spotlightPuckDoc(data) : null
    if (data && puckData) {
      const name = data.profile.display_name?.trim() || data.profile.handle
      resolved = {
        puckData,
        meta: spotlightRenderMeta(data),
        firstName: name.split(/\s+/)[0] || name,
      }
    }
  } catch {
    // This section must never break the profile.
    resolved = null
  }

  if (!resolved) return null
  const { puckData, meta, firstName } = resolved

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-6">
      <SectionHeader title={`More about ${firstName}`} />
      {/* The block body through the SHARED Puck engine. [&_section]:!py-0 neutralizes the blocks'
          own section padding so they seat inside the profile card's rhythm. */}
      <div className="space-y-4 [&_section]:!py-0">
        <BlockRender config={config} data={puckData} metadata={{ spotlight: meta }} />
      </div>
    </section>
  )
}
