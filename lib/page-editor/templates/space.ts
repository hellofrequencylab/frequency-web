import type { Data } from '@measured/puck'
import { config } from '@/lib/page-editor/config'
import {
  templateDescriptor,
  templateForSpace,
  type SpaceTemplate,
  type SpaceTemplateDescriptor,
  type TemplateResolverInput,
} from '@/lib/spaces/templates'
import type { HeroStat } from '@/lib/spaces/blueprints'
import { emphasisDefault } from '@/lib/page-editor/fields'

// ─────────────────────────────────────────────────────────────────────────────
// SPACE LANDING -> PUCK PRESET (ADR-476/472, Phase 1 of unifying every builder
// onto Puck). For each of the four public-page layout templates (Book · Schedule
// · Storefront · Hub) this file GENERATES a Puck `Data` document for a Space's
// public LANDING body, composed ONLY from blocks already registered in
// lib/page-editor/config.tsx (Hero, Heading, Text, StatRow, Gallery,
// CallToAction, Accordion, MediaText). No new block types are invented here.
//
// WHY DESCRIPTOR-DRIVEN: the SpaceTemplateDescriptor (lib/spaces/templates.ts)
// already names the hero CTA, the ordered hero stats, the headline emphasis, and
// the About body lead order per template. We read THAT descriptor so the four
// presets are not four hand-authored documents but four projections of the same
// canonical layer the rest of the profile already resolves through. The result:
// each template yields a visibly different starting document (different hero copy,
// a different stat set, a different lead block order), and a single edit to the
// descriptor flows through to the preset.
//
// WHITE-LABEL (AGENTS.md D4/D6): the generated blocks carry NO chrome, NO hex, NO
// Frequency-specific surface. They paint from semantic DAWN tokens via the block
// kit; the Space's brand accent themes the page at the render layer (AccentScope
// in the profile layout). The copy uses the Space's OWN name, never a Frequency
// product line, so a published landing reads as the operator's site.
//
// PURE: no Supabase / Next / server-only imports beyond the pure descriptor +
// config. Trivially unit-testable, and safe to import from the server resolver and
// the client editor alike (the classic client -> server-only build failure is
// avoided because `config` and `templates.ts` are both already shared/pure).
//
// COPY (NAMING + CONTENT-VOICE §10): plain sentences, sentence-case headings,
// plain-verb CTAs sourced from the descriptor, contractions, no em dashes, never
// narrating the reader's feelings. The copy is honest at day zero: a brand-new
// Space's landing reads as an intentional, designed start point, not a fake.
// ─────────────────────────────────────────────────────────────────────────────

/** The shape the generators read off a Space. Tolerant + minimal: only the brand
 *  name is needed for copy, the rest feeds the descriptor resolver (which is itself
 *  total). Mirrors the fields the profile layout already passes to templateForSpace. */
export interface SpacePresetInput extends TemplateResolverInput {
  /** The Space's display name (brand name preferred, else the plain name). Drives the
   *  hero + CTA copy so the landing reads as the operator's own site. */
  name: string
}

const L = { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' } as const

type HeroEmphasis = SpaceTemplateDescriptor['hero']['emphasis']

// A plain placeholder image per emphasis, so the hero is never broken on a Space
// that hasn't uploaded its own art yet. These are existing hosted site assets (the
// same set the marketing presets draw from); an operator swaps them in the editor.
// No hex, no chrome — just a neutral, warm photo to anchor the hero band.
const EMPHASIS_IMAGE: Record<HeroEmphasis, string> = {
  'who-you-help': '/images/site/outdoor-group.jpg',
  identity: '/images/site/hula-hoop-beach.jpg',
  brand: '/images/site/lab-lounge.jpg',
  mission: '/images/site/sunset.jpg',
}

// ── Per-emphasis hero copy. The descriptor's `emphasis` hint says which promise the
// hero leads with; we map it to a plain headline + subtitle frame, filled with the
// Space's own name. Sentence case, no em dashes, never narrating feelings. The CTA
// label + the route come straight from the descriptor (descriptor.hero.primaryCta).
function heroCopy(
  name: string,
  emphasis: HeroEmphasis,
): { eyebrow: string; title: string; subtitle: string } {
  switch (emphasis) {
    case 'who-you-help':
      return {
        eyebrow: 'Work with me',
        title: `Book time with ${name}.`,
        subtitle: `See what ${name} offers and pick a time that works for you.`,
      }
    case 'identity':
      return {
        eyebrow: 'What is on',
        title: `The ${name} schedule.`,
        subtitle: `Find a class or session at ${name} and save your spot.`,
      }
    case 'brand':
      return {
        eyebrow: 'The catalog',
        title: `Everything from ${name}.`,
        subtitle: `Browse what ${name} makes and find the right fit.`,
      }
    case 'mission':
      return {
        eyebrow: 'Our mission',
        title: `Get involved with ${name}.`,
        subtitle: `See the work ${name} is doing and find your way in.`,
      }
  }
}

// ── A plain-noun StatRow value placeholder per metric. The hero band already shows
// the LIVE numbers (profile-hero-stats); this body StatRow is a designed, editable
// start point an operator fills with their own proof, so we seed plain labels and a
// neutral hyphen value (no invented counts, no em dash, honest at day zero). The
// descriptor's ordered heroStats drive WHICH stats appear and in what order, so the
// four templates lead with different stat sets.
function statItems(stats: readonly HeroStat[]): { value: string; label: string }[] {
  return stats.slice(0, 4).map((s) => ({ value: '-', label: s.label }))
}

// ── Per-About-lead-module body section. The descriptor's `aboutModules` order
// (minus the brand-new-Space empty) drives the BODY block order, so each template
// opens on a distinct section. We map each entity module id to a designed,
// EXISTING Puck block seeded with plain, on-brand copy. `entity-getting-started`
// is the brand-new-Space empty in the live profile and has no public landing
// section, so it is skipped here (the preset is the designed start point itself).
function bodyBlockForModule(
  module: string,
  name: string,
  descriptor: SpaceTemplateDescriptor,
  index: number,
): { type: string; props: Record<string, unknown> } | null {
  const id = `sp-${descriptor.template}-${module}-${index}`
  // Alternate the tone beat (canvas -> surface -> canvas ...) so the body reads
  // with rhythm, exactly like the marketing presets.
  const tone = index % 2 === 0 ? 'canvas' : 'surface'

  switch (module) {
    case 'entity-getting-started':
      // The composite empty for a brand-new Space; no public landing section.
      return null

    case 'entity-offerings':
      // What the Space offers, framed by the template (classes / catalog / programs
      // / sessions). A Heading the operator pairs with their own offerings list.
      return {
        type: 'Heading',
        props: {
          id,
          eyebrow: 'What we offer',
          title: offeringsHeading(descriptor.template),
          titleAccent: '',
          kicker: '',
          emphasis: emphasisDefault,
          tone,
          width: 'default',
          align: 'left',
          layout: L,
        },
      }

    case 'entity-about':
      // The story / mission, framed as a MediaText so the operator pairs a photo
      // with prose. Leads the Hub template (mission first).
      return {
        type: 'MediaText',
        props: {
          id,
          image: EMPHASIS_IMAGE[descriptor.hero.emphasis],
          alt: '',
          eyebrow: 'About',
          title: `About ${name}.`,
          titleAccent: '',
          kicker: '',
          body: `Tell people who you are and why this matters. Share what brought ${name} here and what someone can expect.`,
          side: index % 2 === 0 ? 'left' : 'right',
          imgAspect: 'landscape',
          focal: 'center',
          ctaLabel: '',
          ctaHref: '',
          tone,
          width: 'default',
          align: 'left',
          layout: L,
        },
      }

    case 'entity-cta':
      // The primary ask, framed by the template's own CTA (Book / Get involved /
      // browse). The descriptor's primaryCta label + tab drive the copy + route.
      return {
        type: 'CallToAction',
        props: {
          id,
          eyebrow: '',
          heading: ctaHeading(descriptor.template),
          headingAccent: '',
          body: ctaBody(name, descriptor.template),
          ctaPrimaryLabel: descriptor.hero.primaryCta.label,
          ctaPrimaryHref: ctaHref(descriptor),
          ctaSecondaryLabel: '',
          ctaSecondaryHref: '',
          emphasis: emphasisDefault,
          tone: 'surface',
          width: 'default',
          align: 'center',
          layout: L,
        },
      }

    case 'entity-community':
      // The community / stories beat: a plain Heading the operator fills with member
      // voices. Honest at day zero (no fake testimonials seeded).
      return {
        type: 'Heading',
        props: {
          id,
          eyebrow: 'Community',
          title: 'The people who show up.',
          titleAccent: '',
          kicker: 'Share what your community looks like and who belongs here.',
          emphasis: emphasisDefault,
          tone,
          width: 'default',
          align: 'left',
          layout: L,
        },
      }

    case 'entity-team':
      // The team behind the Space: a Heading the operator pairs with the people.
      return {
        type: 'Heading',
        props: {
          id,
          eyebrow: 'Team',
          title: 'Who runs the room.',
          titleAccent: '',
          kicker: 'Introduce the people behind this work.',
          emphasis: emphasisDefault,
          tone,
          width: 'default',
          align: 'left',
          layout: L,
        },
      }

    default:
      return null
  }
}

// ── New Space content blocks (Puck content blocks, Phase 2). Each is composed from a REGISTERED
// block (Cover / SpaceReviews / SpaceFAQ / SpaceUpdates / Gallery), seeded with plain on-brand copy,
// and left fully operator-movable/removable (nothing locked). The dynamic ones render nothing until
// the operator adds real rows (fail-safe), so seeding them is honest at day zero: they are a
// designed placement, not a fake. Copy is CONTENT-VOICE (plain, no em dashes, no invented counts).

// The Cover banner that LEADS every template's document. Neutral placeholder image (same hosted
// asset set the hero draws from) the operator swaps in the editor; no overlay copy by default so the
// hero below owns the headline.
function coverBlock(template: SpaceTemplate, emphasis: HeroEmphasis): { type: string; props: Record<string, unknown> } {
  return {
    type: 'Cover',
    props: {
      id: `sp-${template}-cover`,
      image: EMPHASIS_IMAGE[emphasis],
      alt: '',
      focal: 'center',
      height: 'medium',
      eyebrow: '',
      title: '',
      layout: L,
    },
  }
}

// A member-proof Reviews block, placed near the CTA on Book/Schedule/Storefront. Renders nothing
// until members leave reviews, so the seed is a designed slot, not a fake average.
function reviewsBlock(template: SpaceTemplate): { type: string; props: Record<string, unknown> } {
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

// An operator FAQ accordion, placed LOWER on the page. Renders nothing until the operator adds
// questions.
function faqBlock(template: SpaceTemplate): { type: string; props: Record<string, unknown> } {
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

// The brand Updates feed, used on the Hub (the fullest template). Renders nothing until the operator
// publishes an update.
function updatesBlock(template: SpaceTemplate): { type: string; props: Record<string, unknown> } {
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

// A Gallery placement (Storefront + Hub keep a gallery). Empty items by default (no fake photos);
// the operator uploads their own. Uses the registered Gallery block.
function galleryBlock(template: SpaceTemplate): { type: string; props: Record<string, unknown> } {
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

// Per-template offerings heading, so the same module reads with the template's voice.
function offeringsHeading(template: SpaceTemplate): string {
  switch (template) {
    case 'book':
      return 'What you can book.'
    case 'schedule':
      return 'The schedule.'
    case 'storefront':
      return 'The catalog.'
    case 'hub':
      return 'Our programs.'
  }
}

function ctaHeading(template: SpaceTemplate): string {
  switch (template) {
    case 'book':
      return 'Ready when you are.'
    case 'schedule':
      return 'Save your spot.'
    case 'storefront':
      return 'Find your fit.'
    case 'hub':
      return 'Join the work.'
  }
}

function ctaBody(name: string, template: SpaceTemplate): string {
  switch (template) {
    case 'book':
      return `Pick a time and ${name} will take it from there.`
    case 'schedule':
      return `See what is coming up at ${name} and reserve your place.`
    case 'storefront':
      return `Browse what ${name} makes and take the next step.`
    case 'hub':
      return `There is a place for you at ${name}. Here is how to start.`
  }
}

// The primary CTA route for the landing: the descriptor names a wired tab id; the
// landing lives at the profile index, so the CTA points at that tab as a relative
// anchor. The public render layer (the Space page) can rewrite this to the Space's
// own slug; seeding a relative tab anchor means a published preset never 404s.
function ctaHref(descriptor: SpaceTemplateDescriptor): string {
  const tab = descriptor.hero.primaryCta.tab
  return tab === 'about' ? '#' : `#${tab}`
}

/**
 * Generate a Puck `Data` document for a Space LANDING, from the descriptor of the
 * given template. PURE + total: every template yields a valid Puck document
 * composed only from registered blocks, visibly distinct per template (different
 * hero emphasis copy, stat set, and lead body order).
 *
 * The block order follows the descriptor's `aboutModules` (the same lead-first
 * order the live About body uses), so the four templates open on four different
 * sections. The hero leads, then the descriptor's body modules, then a StatRow of
 * the descriptor's hero stats as an editable proof band.
 */
export function generateSpacePreset(template: SpaceTemplate, name: string): Data {
  const descriptor = templateDescriptor(template)
  const brand = name.trim() || 'this space'
  const copy = heroCopy(brand, descriptor.hero.emphasis)

  const hero = {
    type: 'Hero',
    props: {
      id: `sp-${template}-hero`,
      variant: 'image',
      eyebrow: copy.eyebrow,
      title: copy.title,
      titleAccent: '',
      subtitle: copy.subtitle,
      image: EMPHASIS_IMAGE[descriptor.hero.emphasis],
      focal: 'center',
      minHeight: 'screen',
      ctaPrimaryLabel: descriptor.hero.primaryCta.label,
      ctaPrimaryHref: ctaHref(descriptor),
      ctaSecondaryLabel: '',
      ctaSecondaryHref: '',
      note: '',
      tone: 'surface',
      width: 'default',
      align: 'center',
      layout: L,
    },
  }

  // The descriptor's About body order drives the body section order (skipping the
  // brand-new-Space empty), so each template opens on a distinct lead block.
  const body = descriptor.aboutModules
    .map((module, i) => bodyBlockForModule(module, brand, descriptor, i))
    .filter((b): b is { type: string; props: Record<string, unknown> } => b !== null)

  // An editable proof band of the descriptor's ordered hero stats. Honest at day
  // zero (neutral values), distinct per template (the stat SET differs).
  const stats = {
    type: 'StatRow',
    props: {
      id: `sp-${template}-stats`,
      eyebrow: '',
      title: 'By the numbers',
      titleAccent: '',
      columns: String(Math.min(4, Math.max(2, descriptor.hero.heroStats.length))),
      items: statItems(descriptor.hero.heroStats),
      emphasis: emphasisDefault,
      tone: 'surface',
      width: 'default',
      align: 'center',
      layout: L,
    },
  }

  // ── The new Space content blocks, placed per template (Puck content blocks, Phase 2). Cover LEADS
  // every document (the banner). Book/Schedule/Storefront add member-proof Reviews near the CTA and a
  // FAQ lower; Storefront also keeps a Gallery. Hub is the fullest: Cover, mission (already the body
  // lead), Updates, Gallery, FAQ, community. Everything is operator-movable/removable; nothing locked.
  const cover = coverBlock(template, descriptor.hero.emphasis)

  let extras: { type: string; props: Record<string, unknown> }[]
  switch (template) {
    case 'book':
    case 'schedule':
      // Reviews as proof near the ask (after the body's CTA), then the FAQ lower, then the stat band.
      extras = [reviewsBlock(template), faqBlock(template)]
      break
    case 'storefront':
      // Storefront keeps a Gallery (the catalog look), plus Reviews proof and a FAQ.
      extras = [galleryBlock(template), reviewsBlock(template), faqBlock(template)]
      break
    case 'hub':
      // The fullest body: brand Updates + a Gallery + a FAQ, layered onto the mission-led body.
      extras = [updatesBlock(template), galleryBlock(template), faqBlock(template)]
      break
  }

  return {
    root: {},
    content: [cover, hero, ...body, ...extras, stats],
  }
}

/** Generate the Puck preset for a Space by RESOLVING its template from the
 *  descriptor layer (templateForSpace), then generating from that descriptor. PURE
 *  + total — the resolver always returns one of the four templates, so this always
 *  returns a valid, distinct document. The server resolver (spacePuckData) calls
 *  this as its fail-safe when no stored doc is present or valid. */
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
 * doc all fall through to the preset, so the landing always renders. PURE — the
 * server caller reads the Space and hands the fields in.
 */
export function spacePuckData(input: SpacePresetInput): Data {
  const stored = readStoredSpaceDoc(input.preferences)
  if (stored) return stored
  return generateSpacePresetForSpace(input)
}
