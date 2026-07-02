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
// It composes the PROFILE-NATIVE block set (components/page-editor/blocks/profile.tsx) as a
// single SpaceLayout region box (main + side slots) of clean boxed cards. The identity Hero
// (cover + logo + name + primary CTA) is owned by the profile LAYOUT chrome, never a block
// here, so this body starts at the SpaceLayout grid.
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

// ── QUICK LINKS card (operator authored; empty by default).
function quickLinks(): Block {
  return { type: 'SpaceQuickLinks', props: { id: `${P}-quicklinks`, eyebrow: '', heading: 'Quick links', links: [] } }
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

// ── The SpaceLayout region box holding the two card columns (main + side).
function spaceLayout(main: Block[], side: Block[]): Block {
  return { type: 'SpaceLayout', props: { id: `${P}-layout`, layout: 'main-side', sideSticky: 'no', main, side } }
}

/**
 * The ONE universal default Space page body, as a Puck `Data` document. PURE + total.
 *
 *   main = Offerings -> Booking -> Events -> Practices -> Community -> Reviews -> FAQ -> Callout
 *   side = Highlights -> About -> QuickLinks -> Contact -> Business
 *
 * A sensible, general-purpose first arrangement for any Space (the operator freely
 * rearranges it). Live blocks render nothing until there is real data, so the page
 * self-composes to whatever the space has turned on.
 */
export function generateDefaultSpacePage(name: string): Data {
  const brand = name.trim() || 'this space'
  return {
    root: {},
    content: [
      spaceLayout(
        [offerings(), booking(brand), events(), practices(), community(), reviews(), faq(), callout(brand)],
        [highlights(), about(brand), quickLinks(), contact(), business()],
      ),
    ],
  }
}
