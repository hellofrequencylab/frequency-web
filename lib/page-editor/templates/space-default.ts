import type { Data } from '@measured/puck'
import { emphasisDefault } from '@/lib/page-editor/fields'

// ─────────────────────────────────────────────────────────────────────────────
// THE ONE UNIVERSAL DEFAULT SPACE PAGE (feature-block model, ADR superseding 472/476).
//
// The type-driven template system (Book / Schedule / Storefront / Hub) is being retired:
// a Space profile is now a set of freely-arranged Puck feature blocks across operator-
// defined pages. Every new page (and a "reset") seeds from this ONE universal arrangement,
// not a per-type variant. The operator then reorders / hides / adds any block.
//
// It composes the PROFILE-NATIVE block set (components/page-editor/blocks/profile.tsx) as a FLAT,
// TOP-LEVEL list of blocks — NOT wrapped in a SpaceLayout region box. The flat list is deliberate
// (owner directive, 2026-07): the old SpaceLayout two-column shell nested the blocks in slots, so the
// minimal layout editor's block list (which reads TOP-LEVEL blocks) only saw the wrapper, not each
// block — making the content read as untouchable "template" cruft not tied to the editor. Flat = every
// block is a real, top-level, reorder/hide/remove-able block in the layout editor. An operator can
// still add a SpaceLayout box themselves for a two-column section. The identity header (cover + logo +
// name + primary CTA) is owned by the profile LAYOUT chrome, never a block here.
//
// HONEST AT DAY ZERO (AGENTS.md): the live blocks (Highlights / Events / Booking / Reviews)
// render NOTHING until there is real data; the authored blocks (Offerings / QuickLinks /
// Contact / About) show a designed placeholder in the editor and nothing on the live page
// until filled. Semantic DAWN tokens only, no hex; copy is plain, sentence-case, no em
// dashes (NAMING + CONTENT-VOICE §10). PURE + total: no server/Next imports.
// ─────────────────────────────────────────────────────────────────────────────

type Block = { type: string; props: Record<string, unknown> }

const P = 'sp-default'

// ── Live HIGHLIGHTS strip (counts off metadata; nothing until positive counts).
function highlights(): Block {
  return { type: 'SpaceHighlights', props: { id: `${P}-highlights` } }
}

// ── OFFERINGS grid (operator authored; empty by default).
function offerings(): Block {
  return {
    type: 'SpaceOfferings',
    props: { id: `${P}-offerings`, eyebrow: 'What we offer', heading: 'What you can book', items: [] },
  }
}

// ── ABOUT / story card. The body seeds EMPTY (honest at day zero): the live page shows nothing and
// the editor shows the designed placeholder, so a visitor never reads fill-me-in instructions.
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

// ── BOOKING call-to-action (live; renders nothing when booking is off).
function booking(name: string): Block {
  return {
    type: 'SpaceBooking',
    props: {
      id: `${P}-booking`,
      heading: 'Book a time',
      body: `Pick a slot that works for you and ${name} will take it from there.`,
      ctaLabel: 'Book a time',
      accent: 'yes',
    },
  }
}

// ── UPCOMING EVENTS list (live; nothing until an upcoming event exists).
function events(): Block {
  return {
    type: 'SpaceEvents',
    props: { id: `${P}-events`, eyebrow: 'On the calendar', heading: 'Upcoming events', max: '5' },
  }
}

// ── CONTACT + hours info card (empty by default).
function contact(): Block {
  return {
    type: 'SpaceContact',
    props: {
      id: `${P}-contact`,
      eyebrow: 'Find us',
      heading: 'Contact',
      address: '',
      hours: '',
      phone: '',
      email: '',
      linkLabel: '',
      linkHref: '',
    },
  }
}

// ── PRACTICES + JOURNEYS list (live; nothing until the space has practices or journeys).
function practices(): Block {
  return {
    type: 'SpacePractices',
    props: {
      id: `${P}-practices`,
      eyebrow: 'Start here',
      heading: 'Practices and journeys',
      practicesHeading: 'Practices to start',
      journeysHeading: 'Journeys to begin',
    },
  }
}

// ── CIRCLES list (live; nothing until the space runs active circles).
function community(): Block {
  return {
    type: 'SpaceCommunity',
    props: { id: `${P}-community`, eyebrow: 'Community', heading: 'Circles' },
  }
}

// ── Dynamic REVIEWS + FAQ blocks (live; nothing until real rows).
function reviews(): Block {
  return { type: 'SpaceReviews', props: { id: `${P}-reviews`, eyebrow: 'What members say', heading: 'Reviews', limit: '4' } }
}

function faq(): Block {
  return {
    type: 'SpaceFAQ',
    props: { id: `${P}-faq`, eyebrow: 'FAQ', heading: 'Common questions', titleAccent: '', emphasis: emphasisDefault },
  }
}

// ── BUSINESS PRESENCE strip (operator authored; empty by default). Social links + optional rating.
function business(): Block {
  return {
    type: 'SpaceBusiness',
    props: { id: `${P}-business`, heading: 'Find us online', rating: '', ratingCount: '', links: [] },
  }
}

// ── Closing CALLOUT band (operator authored; a friendly conversion moment at the foot of the page).
function callout(name: string): Block {
  return {
    type: 'SpaceCallout',
    props: {
      id: `${P}-callout`,
      eyebrow: '',
      heading: 'Come say hello',
      body: `Have a question or want to get started with ${name}? We would love to hear from you.`,
      ctaLabel: 'Get in touch',
      ctaHref: '#',
      align: 'center',
    },
  }
}

/**
 * The ONE universal default Space page body, as a Puck `Data` document. PURE + total.
 *
 * A FLAT, importance-ordered single column of TOP-LEVEL blocks (no SpaceLayout wrapper), so every
 * block is individually reorder/hide/remove-able in the minimal layout editor:
 *
 *   Highlights -> Offerings -> Booking -> About -> Events -> Practices -> Community -> Reviews ->
 *   FAQ -> Business -> Contact -> Callout
 *
 * Live blocks render nothing until there is real data and authored blocks render nothing until the
 * central Business Info is filled, so the page self-composes to whatever the space has turned on.
 */
export function generateDefaultSpacePage(name: string): Data {
  const brand = name.trim() || 'this space'
  return {
    root: {},
    content: [
      highlights(),
      offerings(),
      booking(brand),
      about(brand),
      events(),
      practices(),
      community(),
      reviews(),
      faq(),
      business(),
      contact(),
      callout(brand),
    ],
  }
}
