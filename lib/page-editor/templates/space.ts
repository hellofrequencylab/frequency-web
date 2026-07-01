import type { Data } from '@measured/puck'
import { config } from '@/lib/page-editor/config'
import {
  templateForSpace,
  type SpaceTemplate,
  type TemplateResolverInput,
} from '@/lib/spaces/templates'
import { emphasisDefault } from '@/lib/page-editor/fields'

// ─────────────────────────────────────────────────────────────────────────────
// SPACE LANDING -> PUCK PRESET (Phase 4 of unifying every builder onto Puck). For
// each of the four public-page layout templates (Book · Schedule · Storefront · Hub)
// this file GENERATES a Puck `Data` document for a Space's public LANDING body,
// composed from the PROFILE-NATIVE block set (components/page-editor/blocks/profile.tsx)
// + the Phase 2 dynamic Space blocks (SpaceUpdates / SpaceReviews / SpaceFAQ). It reads
// like a Facebook business page: the profile LAYOUT owns the cover + logo IDENTITY HEADER
// above this body, and the body is a single SpaceLayout region box whose main / side slots
// hold clean, organizable boxed info cards, NOT a stack of full-width marketing bands.
//
// HEADER OWNERSHIP: the identity header (cover + logo + name + CTA) is NO LONGER a Puck block
// in the space preset. The public profile layout (app/(main)/spaces/[slug]/layout.tsx) renders
// ONE cohesive header for every tab, so the Puck body starts directly with the SpaceLayout grid
// (no leading SpaceIdentityHeader). The block stays registered for other surfaces; it is just not
// seeded here, and space-landing.tsx strips it from any stored doc so it never dupes the header.
// The marketing display-type blocks are untouched and still power the marketing pages; only the
// space PRESETS use the Profile set.
//
// WHITE-LABEL (AGENTS.md D4/D6): the generated blocks carry NO chrome, NO hex, NO
// Frequency-specific surface. They paint from semantic DAWN tokens via the block kit;
// the Space's brand accent themes the page at the render layer (AccentScope in the
// profile layout). The copy uses the Space's OWN name, never a Frequency product line.
//
// PURE: no Supabase / Next / server-only imports beyond the pure config + templates.
// Trivially unit-testable, and safe to import from the server resolver and the client
// editor alike (config + templates.ts are both shared/pure).
//
// COPY (NAMING + CONTENT-VOICE §10): plain sentences, sentence-case headings, plain-verb
// CTAs, contractions, no em dashes, never narrating the reader's feelings. Honest at day
// zero: a brand-new Space's landing reads as an intentional, designed start point, and
// the dynamic + identity-driven blocks render nothing until there is real data.
// ─────────────────────────────────────────────────────────────────────────────

/** The shape the generators read off a Space. Tolerant + minimal: only the brand
 *  name is needed for copy, the rest feeds the template resolver (which is itself total).
 *  Mirrors the fields the profile layout already passes to templateForSpace. */
export interface SpacePresetInput extends TemplateResolverInput {
  /** The Space's display name (brand name preferred, else the plain name). Drives the
   *  copy so the landing reads as the operator's own site. */
  name: string
}

type Block = { type: string; props: Record<string, unknown> }

// NOTE: the identity header (cover + logo + name + CTA) is NO LONGER a Puck block in the space
// preset. The public profile LAYOUT (app/(main)/spaces/[slug]/layout.tsx) owns ONE cohesive header
// for every tab, so the Puck body starts directly with the SpaceLayout content grid (no leading
// SpaceIdentityHeader). The block stays REGISTERED (it may be used elsewhere, e.g. a Spotlight), it
// is just not seeded here, and space-landing.tsx strips it from any stored doc so it never dupes the
// layout header.

// ── The card builders now return BARE profile cards (no tone/width/align/layout band props):
// they live INSIDE the SpaceLayout box's main / side slots, rendered as clean boxed cards, so
// the page reads like a Facebook business page rather than a stack of full-width bands.

// ── The live HIGHLIGHTS strip (members / offerings / ...). Reads the live counts off
// metadata; renders nothing until the Space has positive counts (honest at day zero).
function highlights(template: SpaceTemplate): Block {
  return {
    type: 'SpaceHighlights',
    props: { id: `sp-${template}-highlights` },
  }
}

// ── The OFFERINGS grid. Operator authored (empty by default, so it shows a designed
// placeholder in the editor and nothing on the live page until the operator adds cards).
// The eyebrow + heading are framed by the template's own voice.
function offerings(template: SpaceTemplate, heading: string): Block {
  return {
    type: 'SpaceOfferings',
    props: {
      id: `sp-${template}-offerings`,
      eyebrow: 'What we offer',
      heading,
      items: [],
    },
  }
}

// ── The ABOUT / story card.
function about(template: SpaceTemplate, name: string, heading: string): Block {
  return {
    type: 'SpaceAbout',
    props: {
      id: `sp-${template}-about`,
      eyebrow: 'About',
      heading,
      body: `Tell people who you are and why this matters. Share what brought ${name} here and what someone can expect.`,
    },
  }
}

// ── The tasteful CTA card (a headline + one button), NOT a full-bleed marketing hero.
function cta(template: SpaceTemplate, heading: string, body: string, label: string): Block {
  return {
    type: 'SpaceCTA',
    props: {
      id: `sp-${template}-cta`,
      heading,
      body,
      ctaLabel: label,
      ctaHref: '#',
      accent: 'no',
    },
  }
}

// ── The CONTACT + hours info card. Empty by default (placeholder in the editor).
function contact(template: SpaceTemplate): Block {
  return {
    type: 'SpaceContact',
    props: {
      id: `sp-${template}-contact`,
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

// ── The TEAM avatar cards. Empty by default (placeholder in the editor).
function team(template: SpaceTemplate): Block {
  return {
    type: 'SpaceTeam',
    props: {
      id: `sp-${template}-team`,
      eyebrow: 'The people',
      heading: 'Meet the team',
      members: [],
    },
  }
}

// ── The Phase 2 dynamic blocks (Reviews / FAQ / Updates), reused here (never rebuilt). Each
// renders nothing until the operator adds real rows, so seeding them is a designed placement,
// not a fake.

function reviews(template: SpaceTemplate): Block {
  return {
    type: 'SpaceReviews',
    props: {
      id: `sp-${template}-reviews`,
      eyebrow: 'What members say',
      heading: 'Reviews',
      limit: '4',
    },
  }
}

function faq(template: SpaceTemplate): Block {
  return {
    type: 'SpaceFAQ',
    props: {
      id: `sp-${template}-faq`,
      eyebrow: 'FAQ',
      heading: 'Common questions',
      titleAccent: '',
      emphasis: emphasisDefault,
    },
  }
}

function updates(template: SpaceTemplate): Block {
  return {
    type: 'SpaceUpdates',
    props: {
      id: `sp-${template}-updates`,
      eyebrow: 'Latest',
      heading: 'From the team',
      limit: '3',
      viewAllHref: '',
    },
  }
}

// ── The SpaceLayout region box that holds the two card columns (main + side). It is now the SOLE
// top-level block in the preset (the layout owns the identity header above the Puck body); the cards
// live INSIDE its slots as clean boxed cards.
function spaceLayout(template: SpaceTemplate, main: Block[], side: Block[]): Block {
  return {
    type: 'SpaceLayout',
    props: {
      id: `sp-${template}-layout`,
      layout: 'main-side',
      sideSticky: 'no',
      main,
      side,
    },
  }
}

/**
 * Generate a Puck `Data` document for a Space LANDING, for the given template. PURE +
 * total: every template yields a valid Puck document composed from the Profile block set,
 * visibly distinct per template (a different card arrangement per focus). The body is a
 * SINGLE SpaceLayout region box whose main / side slots hold the profile cards (the identity
 * header is owned by the profile LAYOUT above the Puck body, never a block here), so the page
 * reads like a Facebook business page (layout-owned header + a two-column region grid of boxed
 * cards):
 *   Book:       main = Offerings(book) -> CTA(Book) -> Reviews -> FAQ;  side = Highlights -> About -> Contact.
 *   Schedule:   main = Offerings(schedule) -> CTA(schedule) -> Reviews; side = Highlights -> About -> Contact.
 *   Storefront: main = Offerings(catalog) -> Reviews;                   side = Highlights -> About -> Contact.
 *   Hub:        main = About(mission) -> Updates -> Offerings(programs) -> Team;
 *               side = Highlights -> CTA(Get involved) -> Contact -> FAQ.
 * Nothing is locked: the operator reorders / toggles any of it in the editor.
 */
export function generateSpacePreset(template: SpaceTemplate, name: string): Data {
  const brand = name.trim() || 'this space'

  let layout: Block
  switch (template) {
    case 'book':
      layout = spaceLayout(
        template,
        [
          offerings(template, 'What you can book'),
          cta(template, 'Ready when you are', `Pick a time and ${brand} will take it from there.`, 'Book a session'),
          reviews(template),
          faq(template),
        ],
        [highlights(template), about(template, brand, `About ${brand}`), contact(template)],
      )
      break
    case 'schedule':
      layout = spaceLayout(
        template,
        [
          offerings(template, 'The schedule'),
          cta(template, 'Save your spot', `See what is coming up at ${brand} and reserve your place.`, 'See the schedule'),
          reviews(template),
        ],
        [highlights(template), about(template, brand, `About ${brand}`), contact(template)],
      )
      break
    case 'storefront':
      layout = spaceLayout(
        template,
        [offerings(template, 'The catalog'), reviews(template)],
        [highlights(template), about(template, brand, `About ${brand}`), contact(template)],
      )
      break
    case 'hub':
      layout = spaceLayout(
        template,
        [about(template, brand, 'Our mission'), updates(template), offerings(template, 'Our programs'), team(template)],
        [
          highlights(template),
          cta(template, 'Get involved', `There is a place for you at ${brand}. Here is how to start.`, 'Get involved'),
          contact(template),
          faq(template),
        ],
      )
      break
  }

  return {
    root: {},
    content: [layout],
  }
}

/** Generate the Puck preset for a Space by RESOLVING its template from the descriptor
 *  layer (templateForSpace), then generating from that template. PURE + total -- the
 *  resolver always returns one of the four templates, so this always returns a valid,
 *  distinct document. The server resolver (spacePuckData) calls this as its fail-safe when
 *  no stored doc is present or valid. */
export function generateSpacePresetForSpace(input: SpacePresetInput): Data {
  const template = templateForSpace({
    type: input.type,
    variant: input.variant,
    plan: input.plan,
    preferences: input.preferences,
  })
  return generateSpacePreset(template, input.name)
}

// The set of block keys the current Puck config knows how to render. A stored doc
// is only trusted when every block in it is still a known block type (the same
// guard the marketing loader uses, lib/page-editor/templates/index.ts isRenderable).
const KNOWN_BLOCKS = new Set(Object.keys(config.components))

/**
 * Is `data` a renderable Puck document against the CURRENT config? True only when
 * it has a non-empty `content` array AND every block is a known block type. A doc
 * authored against a retired block set fails this, so the resolver falls back to the
 * generated preset rather than trying to render an unknown component. PURE.
 */
export function isRenderableSpaceDoc(data: unknown): data is Data {
  const content = (data as Data | null)?.content
  if (!Array.isArray(content) || content.length === 0) return false
  return content.every(
    (b) =>
      b != null &&
      typeof (b as { type?: unknown }).type === 'string' &&
      KNOWN_BLOCKS.has((b as { type: string }).type),
  )
}

/** Read the stored Puck document off a raw `spaces.preferences` blob, or null. The
 *  document lives at `preferences.puck` (a sibling of the `template` + `mode`
 *  overrides, ADR-461 additive store). Tolerant of any shape: a malformed blob, a
 *  missing key, or a non-object value yields null. PURE. */
export function readStoredSpaceDoc(preferences: unknown): Data | null {
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) return null
  const raw = (preferences as Record<string, unknown>).puck
  return isRenderableSpaceDoc(raw) ? raw : null
}

/**
 * Resolve the Puck `Data` document for a Space's LANDING body. The stored,
 * VALID document (`preferences.puck`) wins; otherwise the generated preset for the
 * Space's resolved template. FAIL-SAFE: a missing, malformed, or stale-block stored
 * doc all fall through to the preset, so the landing always renders. PURE -- the
 * server caller reads the Space and hands the fields in.
 */
export function spacePuckData(input: SpacePresetInput): Data {
  const stored = readStoredSpaceDoc(input.preferences)
  if (stored) return stored
  return generateSpacePresetForSpace(input)
}
