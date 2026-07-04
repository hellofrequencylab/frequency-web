import type { Data } from '@/lib/page-editor/types'
import type { SpotlightData } from '@/lib/spotlight/data'
import type { SpotlightRenderMeta } from '@/lib/spotlight/puck/metadata'
import { spotlightLayoutToPuck } from '@/lib/spotlight/puck/convert'
import { linktreePreset } from '@/lib/page-editor/templates/linktree'

// CROSS-SURFACE PHASE C (ADR-500) — the ONE shared resolver that turns a member's stored
// Spotlight (profiles.meta.spotlight, read as SpotlightData) into the two things every surface
// needs to render it through the shared Puck engine:
//   1. the Puck `Data` document (the block body), and
//   2. the server-resolved `SpotlightRenderMeta` (live stat numbers + Top Friend faces) that
//      rides Puck `metadata`, NEVER the stored blocks (the tamper boundary — see metadata.ts).
//
// It exists to resolve the Puck `Data` + render meta in ONE place so any surface that renders a
// Spotlight-derived Puck body shares an identical, tamper-safe resolution. Since ADR-523 the personal
// Spotlight itself renders on the GRID engine (not Puck); this resolver remains the shared bridge for
// the marketing/space Puck `linktree` block (ADR-508), which reuses the Spotlight block kit. Keeping the
// meta + layout bridge here means no surface rebuilds it inline and drifts — "the content always comes
// from the same database, shown distinctly per surface." The surfaces differ ONLY in their chrome
// and in the empty-layout policy below — never in how the content itself resolves.
//
// PURE + client-safe: only pure converters/templates + the client-safe public-bucket env, so it is
// importable from an RSC render or the client editor alike (no `server-only` module is reachable).

/** The public avatars bucket base URL the Image/Gallery blocks (and the background) derive an
 *  asset URL from. Client-safe env, matching components/spotlight/blocks/render.tsx. */
export const SPOTLIGHT_PUBLIC_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}/storage/v1/object/public/avatars/`

/**
 * Build the server-resolved render metadata the Spotlight blocks read off `metadata.spotlight`.
 * Every value here is resolved server-side from the allowlisted profile row + the resolved Top
 * Friends, NEVER member-supplied, so a tampered `profiles.meta` blob can at worst choose which
 * stat to surface, never fake a number or a face.
 */
export function spotlightRenderMeta(data: SpotlightData): SpotlightRenderMeta {
  const { profile, totalZaps, topFriends } = data
  return {
    stats: {
      zaps: totalZaps,
      streak: profile.current_streak,
      gems: profile.lifetime_gems,
      joinedYear: profile.created_at ? new Date(profile.created_at).getFullYear() : null,
      region: profile.nexus_regions?.name ?? null,
    },
    topFriends,
    publicBase: SPOTLIGHT_PUBLIC_BASE,
  }
}

/**
 * Bridge the stored SpotlightLayout into a Puck `Data` document (the migration-free bridge every
 * surface uses). `seedWhenEmpty` is the one place the surfaces legitimately differ:
 *  - the STANDALONE Signal page passes `true` — a published-but-unbuilt Spotlight seeds the designed
 *    link-tree preset, so it reads as an intentional page rather than a bare identity card;
 *  - the IN-APP profile section passes `false` (the default) — an unbuilt Spotlight returns null so
 *    the caller omits the "More about…" section entirely (the bespoke profile stays the render).
 */
export function spotlightPuckDoc(
  data: SpotlightData,
  opts: { seedWhenEmpty?: boolean } = {},
): Data | null {
  if (data.layout.blocks.length > 0) return spotlightLayoutToPuck(data.layout)
  return opts.seedWhenEmpty ? linktreePreset() : null
}
