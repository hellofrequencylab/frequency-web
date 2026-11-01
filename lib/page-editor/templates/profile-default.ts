import type { Data } from '@/lib/page-editor/types'

// ─────────────────────────────────────────────────────────────────────────────
// THE DEFAULT MEMBER (USER) PAGE — the identity-led, link-tree-forward starter doc
// for the `user` surface (a member's own public page). It is the member analog of
// the Space starter (space-default.ts) and the member Spotlight preset (linktree.ts):
// one designed default composed from the SHARED block library, so a brand-new member
// page opens as an intentional page rather than a blank canvas.
//
// It composes EXISTING, member-appropriate blocks as a FLAT, top-level list (no layout
// wrapper, so every block is individually reorder/hide/remove-able in the editor):
//
//   SpaceAbout      -> the member's identity / About card (identity-led lead).
//   SpotlightStats  -> the member's PUBLIC counts (zaps / streak / gems). A LiveStats-
//                      style dynamic block: the member picks WHICH stats; the VALUES are
//                      server-resolved and ride puck.metadata.spotlight, never the stored
//                      block (same channel the Spotlight render bridge feeds).
//   LinkTree        -> the core bio-link list (link-tree-forward).
//   TopFriends      -> the member's Top Friends grid (faces server-resolved via metadata).
//
// HONEST AT DAY ZERO (AGENTS.md): the live/dynamic blocks render NOTHING until there is
// real data — the About body seeds EMPTY (so a visitor never reads fill-me-in copy; the
// editor shows the designed placeholder), and the Stats + Top Friends resolve to nothing
// until the member has positive counts / picked friends. The links seed a single
// placeholder the member replaces (the established member link-tree pattern, matching
// linktreePreset). Semantic DAWN tokens only, no hex; copy is plain, sentence-case, with
// straight quotes and NO em dashes (NAMING + CONTENT-VOICE §10). PURE + total: no
// server/Next imports (safe to import from the client editor and the RSC render alike).
// ─────────────────────────────────────────────────────────────────────────────

type Block = { type: string; props: Record<string, unknown> }

const P = 'profile-default'

// ── ABOUT / identity card. The body seeds EMPTY (honest at day zero): the live page shows
// nothing and the editor shows the designed placeholder, so a visitor never reads a stub.
function about(name: string): Block {
  return {
    type: 'SpaceAbout',
    props: {
      id: `${P}-about`,
      eyebrow: 'About',
      heading: `About ${name}`,
      body: '',
    },
  }
}

// ── PUBLIC counts (LiveStats-style). The member picks the stats; the values are
// server-resolved via puck.metadata.spotlight and render nothing until they are positive.
function stats(): Block {
  return {
    type: 'SpotlightStats',
    props: {
      id: `${P}-stats`,
      show: [{ key: 'zaps' }, { key: 'streak' }, { key: 'gems' }],
    },
  }
}

// ── LINK TREE (the core bio-link list). Seeds one placeholder the member replaces, the
// same starting pattern as the member Spotlight preset.
function links(): Block {
  return {
    type: 'LinkTree',
    props: {
      id: `${P}-links`,
      items: [{ label: 'My website', url: 'https://' }],
      tint: { text: '', bg: '' },
    },
  }
}

// ── TOP FRIENDS grid. Faces are server-resolved via metadata; nothing until friends exist.
function topFriends(): Block {
  return {
    type: 'TopFriends',
    props: { id: `${P}-friends`, title: 'Top Friends' },
  }
}

/**
 * The default member (user) page body, as a Puck `Data` document. PURE + total.
 *
 * A FLAT, identity-first single column of TOP-LEVEL blocks (no layout wrapper), so every
 * block is individually reorder/hide/remove-able in the editor:
 *
 *   About -> Stats -> Links -> Top Friends
 *
 * The dynamic blocks (Stats / Top Friends) render nothing until the member has real data,
 * and the About body seeds empty, so the page self-composes to whatever the member has.
 */
export function generateDefaultProfilePage(name: string): Data {
  const who = name.trim() || 'me'
  return {
    root: {},
    content: [about(who), stats(), links(), topFriends()],
  }
}
