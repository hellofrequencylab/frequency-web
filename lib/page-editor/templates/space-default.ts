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

// ── ABOUT / story card.
function about(name: string): Block {
  return {
    type: 'SpaceAbout',
    props: {
      id: `${P}-about`,
      eyebrow: 'About',
      heading: `About ${name}`,
      body: `Tell people who you are and why this matters. Share what brought ${name} here and what someone can expect.`,
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

// ── The SpaceLayout region box holding the two card columns (main + side).
function spaceLayout(main: Block[], side: Block[]): Block {
  return { type: 'SpaceLayout', props: { id: `${P}-layout`, layout: 'main-side', sideSticky: 'no', main, side } }
}

/**
 * The ONE universal default Space page body, as a Puck `Data` document. PURE + total.
 *
 *   main = Offerings -> Booking -> Events -> Reviews -> FAQ
 *   side = Highlights -> About -> QuickLinks -> Contact
 *
 * A sensible, general-purpose first arrangement for any Space (the operator freely
 * rearranges it). Live blocks render nothing until there is real data.
 */
export function generateDefaultSpacePage(name: string): Data {
  const brand = name.trim() || 'this space'
  return {
    root: {},
    content: [
      spaceLayout(
        [offerings(), booking(brand), events(), reviews(), faq()],
        [highlights(), about(brand), quickLinks(), contact()],
      ),
    ],
  }
}
