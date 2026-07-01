import type { Data } from '@measured/puck'
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

/**
 * The default Spotlight body as a Puck `Data` document. Used to seed a new Spotlight
 * editor when the member has no saved layout yet, so they start from a designed page.
 */
export function linktreePreset(): Data {
  return {
    root: {},
    content: [
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
