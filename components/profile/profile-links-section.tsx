import { BlockRender } from '@/lib/page-editor/block-render'
import { config } from '@/lib/page-editor/config'
import { SectionHeader } from '@/components/ui/section-header'
import { getPublishedSpotlight } from '@/lib/spotlight/data'
import { spotlightLayoutToPuck } from '@/lib/spotlight/puck/convert'
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
// What it borrows from the Spotlight render bridge: the block-body part only. It lifts
// the stored SpotlightLayout into a Puck document with the pure converter, injects the
// server-resolved stat numbers + Top Friend faces on Puck `metadata` (never stored, so
// a tampered meta blob can't fake them), and renders it through the shared BlockRender.
// It deliberately DROPS Spotlight's own identity header (avatar/name/bio) and its
// full-screen theme wrapper — the profile already shows an identity band — keeping only
// the block body inside a normal profile card.
//
// FAIL-SAFE: most members have no published Spotlight yet, so this renders nothing by
// default. Any error (or a null / empty layout) returns null, so the section can never
// break the profile. `config` is client-safe; getPublishedSpotlight is server-side,
// which is fine in this Server Component.

const PUBLIC_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}/storage/v1/object/public/avatars/`

export async function ProfileLinksSection({ handle }: { handle: string }) {
  // Fetch + resolve inside the try (a failed read must never break the profile); the JSX is
  // constructed AFTER, outside the try/catch (react-hooks/error-boundaries).
  let resolved:
    | { puckData: ReturnType<typeof spotlightLayoutToPuck>; meta: SpotlightRenderMeta; firstName: string }
    | null = null
  try {
    const data = await getPublishedSpotlight(handle)
    // No published Spotlight, or a published-but-unbuilt one (no blocks): show nothing. Unlike the
    // standalone page, we do NOT seed the link-tree preset here — this section only appears when the
    // member has actually built something to show.
    if (data && data.layout.blocks.length > 0) {
      const { profile, layout, totalZaps, topFriends } = data
      const name = profile.display_name?.trim() || profile.handle
      // Server-resolved values the Stats + Top Friends blocks read off metadata (never stored) —
      // built exactly as components/spotlight/puck-render.tsx does.
      const meta: SpotlightRenderMeta = {
        stats: {
          zaps: totalZaps,
          streak: profile.current_streak,
          gems: profile.lifetime_gems,
          joinedYear: profile.created_at ? new Date(profile.created_at).getFullYear() : null,
          region: profile.nexus_regions?.name ?? null,
        },
        topFriends,
        publicBase: PUBLIC_BASE,
      }
      resolved = {
        // The member's block body as a Puck document (the same migration-free bridge the Spotlight
        // page uses). Guarded above to be non-empty.
        puckData: spotlightLayoutToPuck(layout),
        meta,
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
