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
// + the Phase 2 dynamic Space blocks (SpaceUpdates / SpaceReviews / SpaceFAQ) + the
// registered Gallery. It reads like a Facebook business page: a shared cover + logo
// IDENTITY HEADER, then clean, organizable info cards, NOT a marketing landing page.
//
// PHASE 4 CHANGE: the presets used to lead with the marketing display-type Hero + a
// FeatureGrid + a marketing StatRow, which read like a landing page, not a profile. Now
// every template LEADS with SpaceIdentityHeader (the shared cover/logo identity, uniform
// on the space AND the Spotlight) and arranges profile info cards per focus. The
// marketing blocks are untouched and still power the marketing pages; only the space
// PRESETS switch to the Profile set.
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

const L = { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' } as const

type Block = { type: string; props: Record<string, unknown> }

// Alternate the band tone (surface -> cream -> surface ...) so the body reads with rhythm.
function tone(index: number): 'surface' | 'canvas' {
  return index % 2 === 0 ? 'surface' : 'canvas'
}

// ── The shared IDENTITY HEADER that LEADS every template's document. It reads the cover /
// logo / name / tagline / primary CTA off `puck.metadata.space.identity` (injected by the
// render path), so an operator sees the real header the moment the page publishes. No
// per-surface override by default (uniform); the operator can set a cover/logo override or
// toggle it off in the editor.
function identityHeader(template: SpaceTemplate): Block {
  return {
    type: 'SpaceIdentityHeader',
    props: {
      id: `sp-${template}-identity`,
      coverOverride: '',
      logoOverride: '',
      focal: 'center',
      height: 'medium',
      showFollow: 'yes',
    },
  }
}

// ── The live HIGHLIGHTS strip (members / offerings / ...). Reads the live counts off
// metadata; renders nothing until the Space has positive counts (honest at day zero).
function highlights(template: SpaceTemplate): Block {
  return {
    type: 'SpaceHighlights',
    props: { id: `sp-${template}-highlights`, tone: 'surface', width: 'wide', align: 'center', layout: L },
  }
}

// ── The OFFERINGS grid. Operator authored (empty by default, so it shows a designed
// placeholder in the editor and nothing on the live page until the operator adds cards).
// The eyebrow + heading are framed by the template's own voice.
function offerings(template: SpaceTemplate, heading: string, index: number): Block {
  return {
    type: 'SpaceOfferings',
    props: {
      id: `sp-${template}-offerings`,
      eyebrow: 'What we offer',
      heading,
      items: [],
      tone: tone(index),
      width: 'wide',
      align: 'left',
      layout: L,
    },
  }
}

// ── The ABOUT / story card.
function about(template: SpaceTemplate, name: string, heading: string, index: number): Block {
  return {
    type: 'SpaceAbout',
    props: {
      id: `sp-${template}-about`,
      eyebrow: 'About',
      heading,
      body: `Tell people who you are and why this matters. Share what brought ${name} here and what someone can expect.`,
      tone: tone(index),
      width: 'default',
      align: 'left',
      layout: L,
    },
  }
}

// ── The tasteful CTA card (a headline + one button), NOT a full-bleed marketing hero.
function cta(template: SpaceTemplate, heading: string, body: string, label: string, index: number): Block {
  return {
    type: 'SpaceCTA',
    props: {
      id: `sp-${template}-cta`,
      heading,
      body,
      ctaLabel: label,
      ctaHref: '#',
      tone: tone(index),
      width: 'default',
      align: 'center',
      layout: L,
    },
  }
}

// ── The CONTACT + hours info card. Empty by default (placeholder in the editor).
function contact(template: SpaceTemplate, index: number): Block {
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
      tone: tone(index),
      width: 'default',
      align: 'left',
      layout: L,
    },
  }
}

// ── The TEAM avatar cards. Empty by default (placeholder in the editor).
function team(template: SpaceTemplate, index: number): Block {
  return {
    type: 'SpaceTeam',
    props: {
      id: `sp-${template}-team`,
      eyebrow: 'The people',
      heading: 'Meet the team',
      members: [],
      tone: tone(index),
      width: 'wide',
      align: 'left',
      layout: L,
    },
  }
}

// ── The Phase 2 dynamic blocks (Reviews / FAQ / Updates) + the registered Gallery, reused
// here (never rebuilt). Each renders nothing until the operator adds real rows / photos, so
// seeding them is a designed placement, not a fake.

function reviews(template: SpaceTemplate): Block {
  return {
    type: 'SpaceReviews',
    props: {
      id: `sp-${template}-reviews`,
      eyebrow: 'What members say',
      heading: 'Reviews',
      limit: '4',
      tone: 'canvas',
      width: 'wide',
      align: 'left',
      layout: L,
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
      tone: 'surface',
      width: 'default',
      align: 'left',
      layout: L,
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
      tone: 'surface',
      width: 'wide',
      align: 'left',
      layout: L,
    },
  }
}

function gallery(template: SpaceTemplate): Block {
  return {
    type: 'Gallery',
    props: {
      id: `sp-${template}-gallery`,
      eyebrow: 'Gallery',
      heading: 'A look inside',
      items: [],
      columns: '3',
      tileAspect: '16/10',
      emphasis: emphasisDefault,
      cardStyle: { style: 'border', radius: 'md' },
      density: { spacing: 'cozy' },
      tone: 'canvas',
      width: 'wide',
      align: 'left',
      layout: L,
    },
  }
}

/**
 * Generate a Puck `Data` document for a Space LANDING, for the given template. PURE +
 * total: every template yields a valid Puck document composed from the Profile block set,
 * visibly distinct per template (a different card arrangement per focus). Every template
 * LEADS with SpaceIdentityHeader (the shared cover/logo identity), then arranges the info
 * cards:
 *   Book:       Identity -> Highlights -> Offerings(bookable) -> CTA(Book) -> Reviews -> FAQ -> About -> Contact.
 *   Schedule:   Identity -> Offerings(schedule) -> CTA(See the schedule) -> Highlights -> Reviews -> About -> Contact.
 *   Storefront: Identity -> Offerings(catalog) -> Gallery -> Reviews -> About -> Contact.
 *   Hub:        Identity -> About(mission) -> CTA(Get involved) -> Updates -> Offerings(programs) -> Gallery -> Team -> FAQ -> Contact.
 * Nothing is locked: the operator reorders / toggles any of it in the editor.
 */
export function generateSpacePreset(template: SpaceTemplate, name: string): Data {
  const brand = name.trim() || 'this space'
  const id = identityHeader(template)

  let body: Block[]
  switch (template) {
    case 'book':
      body = [
        highlights(template),
        offerings(template, 'What you can book', 1),
        cta(template, 'Ready when you are', `Pick a time and ${brand} will take it from there.`, 'Book a session', 2),
        reviews(template),
        faq(template),
        about(template, brand, `About ${brand}`, 3),
        contact(template, 4),
      ]
      break
    case 'schedule':
      body = [
        offerings(template, 'The schedule', 1),
        cta(template, 'Save your spot', `See what is coming up at ${brand} and reserve your place.`, 'See the schedule', 2),
        highlights(template),
        reviews(template),
        about(template, brand, `About ${brand}`, 3),
        contact(template, 4),
      ]
      break
    case 'storefront':
      body = [
        offerings(template, 'The catalog', 1),
        gallery(template),
        reviews(template),
        about(template, brand, `About ${brand}`, 3),
        contact(template, 4),
      ]
      break
    case 'hub':
      body = [
        about(template, brand, 'Our mission', 1),
        cta(template, 'Get involved', `There is a place for you at ${brand}. Here is how to start.`, 'Get involved', 2),
        updates(template),
        offerings(template, 'Our programs', 3),
        gallery(template),
        team(template, 4),
        faq(template),
        contact(template, 5),
      ]
      break
  }

  return {
    root: {},
    content: [id, ...body],
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
