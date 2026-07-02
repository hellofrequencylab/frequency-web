import type { Data } from '@/lib/page-editor/types'
import { SPOTLIGHT_PUCK_TYPES } from '@/lib/spotlight/puck/convert'

// THE LINK-TREE PRESET — the default Signal-page (member Spotlight) starting document,
// composed from the SHARED link-tree blocks (components/page-editor/blocks/linktree.tsx).
// A brand-new Spotlight opens on this designed default instead of a blank canvas: a
// Links block to gather a member's places, a short intro line, and a Top Friends grid.
// This SAME preset + engine is what a brand Space's Spotlight reuses later (Phase 3 goal:
// link-trees and Spaces run off one builder).
//
// The identity header (avatar, cover image, name, bio, role) and the page theme live
// OUTSIDE the Puck body — they stay on the profile row + meta.spotlight.theme and are
// painted by the render bridge (components/spotlight/puck-render.tsx). So this document
// is just the BODY: the blocks below the identity card.
//
// COPY (NAMING + CONTENT-VOICE §10): plain sentences, sentence case, no em dashes, never
// narrating the reader's feelings. Honest at day zero — the links point at a placeholder
// the member replaces, the intro is a plain prompt, not a fake bio.
//
// PURE: no Supabase / Next / server-only imports (only the pure block-type map + the Puck
// Data type), so it is safe to import from the client editor and the RSC render alike.

/** Options for the Spotlight preset. `withIdentity` LEADS the document with the SHARED
 *  SpaceIdentityHeader (cover + logo + name), so a brand/space Spotlight opens with the SAME
 *  identity its landing page shows (uniform by default, Phase 4). A member personal Spotlight omits
 *  it and keeps its existing identity treatment (the render bridge paints the member avatar header). */
export interface LinktreePresetOptions {
  /** Lead with the shared SpaceIdentityHeader (brand/space Spotlights only). Default false. */
  withIdentity?: boolean
}

/** The shared identity header block, reused from the Profile block set (Phase 4). It reads the cover /
 *  logo / name off `puck.metadata.space.identity`; on a surface without that metadata (a member
 *  Spotlight) it renders nothing on the live page, so it is safe to include only for brand/space
 *  Spotlights. The operator can toggle it off or override the cover/logo per surface in the editor. */
const IDENTITY_HEADER_BLOCK = {
  type: 'SpaceIdentityHeader',
  props: {
    id: 'lt-identity',
    coverOverride: '',
    logoOverride: '',
    focal: 'center',
    height: 'short',
    showFollow: 'yes',
  },
}

/**
 * The default Spotlight body as a Puck `Data` document. Used to seed a new Spotlight
 * editor when the member has no saved layout yet, so they start from a designed page.
 * A brand/space Spotlight passes `{ withIdentity: true }` to LEAD with the shared cover/logo
 * identity header (uniform with its landing page); a member Spotlight uses the default.
 */
export function linktreePreset(options: LinktreePresetOptions = {}): Data {
  const identity = options.withIdentity ? [IDENTITY_HEADER_BLOCK] : []
  return {
    root: {},
    content: [
      ...identity,
      {
        type: SPOTLIGHT_PUCK_TYPES.text,
        props: {
          id: 'lt-intro',
          text: 'Welcome. Here is where to find me.',
          tint: { text: '', bg: '' },
        },
      },
      {
        type: SPOTLIGHT_PUCK_TYPES.links,
        props: {
          id: 'lt-links',
          items: [
            { label: 'My website', url: 'https://' },
            { label: 'Say hello', url: 'https://' },
          ],
          tint: { text: '', bg: '' },
        },
      },
      {
        type: SPOTLIGHT_PUCK_TYPES.topfriends,
        props: {
          id: 'lt-friends',
          title: 'Top Friends',
        },
      },
    ],
  }
}

/** The default Spotlight body for a BRAND / SPACE Spotlight: the shared cover/logo identity header
 *  LEADS the document, so a space's Spotlight opens with the SAME identity its landing page shows
 *  (uniform by default, Phase 4). A convenience wrapper over linktreePreset({ withIdentity: true }).
 *  The operator can toggle the header off or override it per surface in the editor. */
export function spaceSpotlightPreset(): Data {
  return linktreePreset({ withIdentity: true })
}
