// ─────────────────────────────────────────────────────────────────────────────
// SMART BUSINESS IMPORTER: the AI MARKETING-PAGE COMPOSER (Importer v2.2). ONE model call acts as the
// page designer AND the copy editor: it reads what the business IS, in the business's OWN WORDS, and
// fills a house BAND SPINE with the blocks that fit, then writes the copy for the design blocks
// (Editorial / Zigzag / Card grid / Features / Accent beat / Text Block / Gallery). The output becomes an
// EntityLayout the materializer writes to spaces.preferences.profileLayout.
//
// WHY THIS FILE WAS REBUILT (three problems, three fixes):
//   1. The composer never saw the business's own words. It got `brief(profile)` only: name, tagline,
//      category, about, story, offering titles, hours, three yes/no flags. A real case harvested 21,958
//      chars from the site and reached the composer as 982 chars of draft prose, so the page came out
//      generic. FIX: `sourceExcerpt` (built by lib/importer/excerpt.ts) carries the VERBATIM website text
//      into the prompt, and the copy instruction is NEAR-VERBATIM, TRIMMED TO FIT: lift their sentences,
//      trim for length, cut hype and em dashes, fix voice breaks. Their words carry the page; the model
//      writes only the connective tissue and the bands they have nothing for.
//   2. The page had no house template. FIX: the BAND SPINE (see BAND_SPINE below), modelled on the
//      owner's own Space: nine bands, each with an intent, a primary block, named alternates the model
//      may swap in when the content does not fit, and a drop rule. Bands 1 to 3 group into ONE untitled
//      opening row so the page opens as one continuous read.
//   3. The composer could not set the controls that make a page look designed (features layout, grid
//      columns, card shape, photo side, gallery view, a live CTA button). FIX: the tool schema and
//      `authoredBag` now cover the real block fields, and the ones a SIGNAL can decide are DERIVED in
//      `planToLayout` (pure, testable) rather than chosen by the model.
//
// SAFE BY CONSTRUCTION:
//   • the model picks from a FIXED block allowlist (an unknown id is dropped) and can never invent a block;
//   • photos are referenced by INDEX into the selectable gallery, never a url, so no image can be injected;
//   • every enum control is validated against the REAL field schema (lib/entity-blocks/block-content.ts)
//     through `sparseEnum`, which mirrors sanitizeBlockContent, so a tampered value can only ever be a
//     known token, and a value equal to the block default is dropped (the stored blob stays sparse);
//   • the CTA DESTINATION never comes from the model (a model-chosen url is a dead link). The model writes
//     a button LABEL; the href comes from the caller's `ctaUrl`, and the button is only ever on when a
//     safe `ctaUrl` was supplied;
//   • each block id appears at most once across the whole layout (the content map is keyed by id);
//   • an authored design block with no usable copy is dropped;
//   • the THINNESS gate (fewer than 2 real blocks placed) returns null, so the caller falls back to the
//     deterministic composeLayout (lib/importer/map.ts);
//   • contact + business are guaranteed to close the page;
//   • AI off / over budget / a thrown call returns null;
//   • every string runs through clamp (bound + stripEmDashes).
// planToLayout is PURE + unit-tested; the materializer additionally runs sanitizeEntityLayout, so a bad
// bag is dropped a second time. The copy never invents a fact, a price, a statistic, or a health claim.
//
// No em dashes anywhere in this file, prompt strings included (docs/CONTENT-VOICE.md §10).
// ─────────────────────────────────────────────────────────────────────────────

import type Anthropic from '@anthropic-ai/sdk'
import { completeRaw } from '@/lib/ai/complete'
import { aiAvailable, featureOverBudget, recordAiUsage } from '@/lib/ai/usage'
import { withVoice } from '@/lib/ai/voice'
import { stripEmDashes } from '@/lib/ai/space-copilot'
import { isReadyMediaUrl, type CommercialPolicy } from './map'
import { normalizeRowTitle, type EntityLayout, type RowColumns, type RowDef } from '@/lib/entity-blocks/layout'
import { fieldsForBlock, primitiveValues, safeUrl, type FieldDef } from '@/lib/entity-blocks/block-content'
import type { BusinessProfile } from './schema'

const FEATURE = 'seed-compose'

/** The blocks the composer may place, with best-practice WHEN-TO-USE guidance. The model chooses from
 *  THIS allowlist only (a returned id not here is dropped), so the composition can never invent a block. */
const COMPOSER_BLOCKS: { id: string; use: string }[] = [
  // NOTE: no `photoHero` (in-page Banner). The Space's COVER already IS the hero (the primary image +
  // name + tagline), so a Banner block would be a duplicate hero. Lead with `editorial` instead.
  { id: 'editorial', use: 'A heading over a paragraph or two. The OPENER, and the fallback story beat when there is no photo.' },
  { id: 'zigzag', use: 'A photo beside a column of text. The story beat: the human, the origin, the method.' },
  { id: 'cardGrid', use: 'A heading over a row of cards you write. Best for a method in steps, or packages without prices.' },
  { id: 'features', use: 'A set of items, each an icon or a number plus a short title and one line. Best for proof: the numbers, or the value props.' },
  { id: 'gallery', use: 'The uploaded photos as a grid. Use once, when there are two or more photos.' },
  { id: 'image', use: 'A single uploaded photo. Use instead of the gallery when there are only one or two photos.' },
  { id: 'accentBeat', use: 'A colored splash with a headline, a short message, and a button. The ask; use once, near the end.' },
  { id: 'prose', use: 'A styled paragraph of body text. Use for a short single statement where an editorial would be too heavy.' },
  { id: 'about', use: 'DATA block (the About body). Use this OR an editorial for the about, not both.' },
  { id: 'story', use: 'DATA block (the longer story body). Use this OR a zigzag for the story, not both; prefer it when their own long copy reads better whole.' },
  { id: 'offerings', use: 'DATA block (live services + prices). Use this OR a cardGrid for the services, not both.' },
  { id: 'booking', use: 'DATA block (pick a time + book). Use ONLY for a bookable business.' },
  { id: 'events', use: 'DATA block (live upcoming events). Use for a venue or a class business.' },
  { id: 'reviews', use: 'DATA block (testimonials + rating). Use for proof when they have testimonials but no numbers.' },
  { id: 'team', use: 'DATA block (the people). Use ONLY if there is a team.' },
  { id: 'faq', use: 'DATA block (common questions).' },
  { id: 'contact', use: 'DATA block (address, hours, phone, email).' },
  { id: 'business', use: 'DATA block (find them online / socials).' },
]

const COMPOSER_BLOCK_IDS = new Set(COMPOSER_BLOCKS.map((b) => b.id))

/** The blocks whose CONTENT the composer authors (copy, cards, photos, controls). The rest are DATA blocks
 *  that render live data and only ever carry an eyebrow / title override. `gallery` + `image` are authored
 *  because their content bag is the PHOTOS (resolved here by index), not a header. */
const AUTHORED_BLOCKS = new Set(['editorial', 'features', 'cardGrid', 'zigzag', 'accentBeat', 'prose', 'gallery', 'image'])

// ── The BAND SPINE (the house page template) ──────────────────────────────────────────────────────────
// Modelled on the owner's own Space (slug `danieltyack`), which is the look-and-feel and the best-practice
// bar, NOT a rigid schema. The owner's instruction: "follow that if you can, but if their content doesn't
// fit well, use different blocks and modify slightly. Tune it to fit their brand with a basic layout."
// Each band declares an INTENT, a PRIMARY block, the ALTERNATES the model may swap in, and when it DROPS.
// Bands 1 to 3 are the opening read and group into ONE untitled row (the reference page's r0).

interface BandSpec {
  n: number
  intent: string
  primary: string
  swap: string
  drop: string
}

const BAND_SPINE: readonly BandSpec[] = [
  { n: 1, intent: 'Who this is for, or what this is', primary: 'editorial', swap: 'prose, for a short single statement', drop: 'never' },
  {
    n: 2,
    intent: 'The human, the origin, the method',
    primary: 'zigzag with a photo',
    swap: 'editorial when there is no usable photo; the story data block when their own long copy reads better whole',
    drop: 'no narrative material',
  },
  { n: 3, intent: 'How it works, in steps', primary: 'cardGrid with numbered icons', swap: 'features in the list layout when the steps are one liners', drop: 'no process content' },
  {
    n: 4,
    intent: 'Proof',
    primary: 'features in the stats layout',
    swap: 'features in the cards layout for non numeric value props; reviews when they have testimonials but no numbers',
    drop: 'neither exists',
  },
  { n: 5, intent: 'Show the work', primary: 'gallery', swap: 'the image block when there are only one or two photos', drop: 'fewer than 2 photos' },
  {
    n: 6,
    intent: 'What to do next',
    primary: 'offerings + booking, paired in 2 columns',
    swap: 'cardGrid when offerings are packages without prices; events for a venue or class business',
    drop: 'no offerings and not bookable',
  },
  { n: 7, intent: 'Questions', primary: 'faq', swap: 'none', drop: 'no FAQ' },
  { n: 8, intent: 'The ask', primary: 'accentBeat with a live button', swap: 'none', drop: 'no destination to send them to' },
  { n: 9, intent: 'Find us', primary: 'contact | business, 2 columns, title "Contact and details"', swap: 'contact alone', drop: 'never' },
]

/** The band numbers that form the OPENING READ: they stack into one untitled row so the page opens as one
 *  continuous piece (the reference page's r0: editorial, then zigzag, then cardGrid). */
const OPENING_BANDS: ReadonlySet<number> = new Set([1, 2, 3])

/** Whether a band number belongs to the opening read. PURE. */
function isOpeningBand(n: unknown): boolean {
  return typeof n === 'number' && OPENING_BANDS.has(n)
}

// ── Block-field vocabulary (read from the REAL schema, never guessed) ─────────────────────────────────
// Every enum control below is resolved from lib/entity-blocks/block-content.ts through fieldsForBlock +
// primitiveValues, so the values this composer may emit are exactly the values the editor offers and the
// sanitizer accepts. If a field's option set changes there, this file follows for free.

/** The FieldDef for one block field, or undefined. PURE. */
function fieldOf(blockId: string, key: string): FieldDef | undefined {
  return fieldsForBlock(blockId).find((f) => f.key === key)
}

/** The allowed values of an enum control on a block, or [] when the field is not an enum. PURE. */
function enumValues(blockId: string, key: string): string[] {
  const field = fieldOf(blockId, key)
  return field ? [...(primitiveValues(field) ?? [])] : []
}

/**
 * Keep an enum control's value ONLY when it is one of the field's allowed values AND differs from the
 * field's declared default. Mirrors sanitizeBlockContent's enum sink exactly, so what we write is what the
 * sanitizer keeps, and a value equal to the default is dropped (the stored blob stays sparse). PURE.
 */
function sparseEnum(blockId: string, key: string, value: unknown): string | undefined {
  const field = fieldOf(blockId, key)
  if (!field) return undefined
  const allowed = primitiveValues(field)
  if (!allowed) return undefined
  const def = field.defaultValue ?? allowed[0]
  return typeof value === 'string' && allowed.includes(value) && value !== def ? value : undefined
}

/** Keep a toggle's value ONLY when it is a boolean that differs from the field's default (sparse, and the
 *  same rule sanitizeBlockContent applies). PURE. */
function sparseToggle(blockId: string, key: string, value: unknown): boolean | undefined {
  const field = fieldOf(blockId, key)
  if (!field) return undefined
  const def = field.default ?? false
  return typeof value === 'boolean' && value !== def ? value : undefined
}

const FEATURE_LAYOUTS = enumValues('features', 'layout')
const GRID_COLUMNS = enumValues('cardGrid', 'columns')
const CARD_SHAPES = enumValues('cardGrid', 'shape')
const MEDIA_SIDES = enumValues('zigzag', 'mediaSide')
const IMAGE_ASPECTS = enumValues('zigzag', 'aspect')
const GALLERY_VIEWS = enumValues('gallery', 'view')
const GALLERY_GAPS = enumValues('gallery', 'gap')

// ── The model's shapes ────────────────────────────────────────────────────────────────────────────────

/** One CARD inside a features / cardGrid block. `icon` is a short token (a numeral "1" for a step, or a
 *  Lucide icon name); `imageIndex` references a SELECTABLE photo by index, never a url. */
export interface ComposedCard {
  title?: string
  text?: string
  icon?: string
  imageIndex?: number
}

/** One BLOCK inside a band. The block id is validated against the allowlist; `imageIndex` is an index into
 *  the SELECTABLE photos (the non-cover gallery), resolved to a URL here. The control fields (layout,
 *  columns, shape, rounded, shadow, mediaSide, aspect, view, gap) are validated against the block's real
 *  field schema. `buttonLabel` is the CTA's text; the DESTINATION is never the model's to choose. */
export interface ComposedBlock {
  block: string
  eyebrow?: string
  title?: string
  subtitle?: string
  body?: string
  buttonLabel?: string
  cards?: ComposedCard[]
  imageIndex?: number
  alt?: string
  /** features: list | columns | stats | cards | spotlight. */
  layout?: string
  /** features + cardGrid: '2' | '3' | '4'. */
  columns?: string
  /** cardGrid: top | left. */
  shape?: string
  /** cardGrid: rounded corners / drop shadow (both default on). */
  rounded?: boolean
  shadow?: boolean
  /** zigzag: which side the photo sits on. */
  mediaSide?: string
  /** zigzag / image: the photo's shape. */
  aspect?: string
  /** gallery: grid | masonry | carousel. */
  view?: string
  /** gallery: tight | standard | roomy. */
  gap?: string
}

/** One BAND the composer returns: a band of the page carrying its blocks. `band` is the spine number (see
 *  BAND_SPINE) and decides the opening grouping; `title` becomes the row's live section header (blank for
 *  a band whose block carries its own heading, and for the opening read); `columns` pairs two blocks side
 *  by side (a Space page is at most two columns). The name stays `ComposedSection` for the callers and the
 *  tests that already read it. */
export interface ComposedSection {
  band?: number
  title?: string
  columns?: 1 | 2
  blocks: ComposedBlock[]
}

/** Model bands we process (the spine has 9); the guaranteed-core append may add one more row. */
const MAX_MODEL_BANDS = 10
const HARD_ROW_CAP = 9
const MAX_BLOCKS_PER_SECTION = 4
/** DATA blocks the seed ALWAYS ends with when the model omits them: how to reach the business + find it
 *  online. Both render from live data (never a design block that could duplicate them), so appending the
 *  missing ones can never double up content, and every seeded page carries Contact + Business. */
const CORE_TRAILING_BLOCKS = ['contact', 'business'] as const
const clamp = (v: unknown, max: number): string => stripEmDashes(String(v ?? '')).trim().slice(0, max)

// ── Derived BRAND TUNING (signals decide, not the model) ──────────────────────────────────────────────

/** A card TITLE that reads as a number or a duration: "1,000+", "5+ years", "30+", "24/7", "90 minutes".
 *  The title must LEAD with the figure, so "Open since 1998" is prose, not a stat. */
const STAT_TITLE_RE = /^[$€£]?\d[\d,./]*\s*(\+|%|x|k|m)?\s*([a-z][a-z ]{0,14})?$/i

/** Whether a card's title reads as a stat figure. PURE. */
function isStatTitle(title: string): boolean {
  const t = title.trim()
  return t.length > 0 && t.length <= 24 && STAT_TITLE_RE.test(t)
}

/**
 * The Features LAYOUT to render, derived from the CONTENT wherever a signal exists. An explicit non proof
 * layout from the model (list / columns / spotlight) is honoured, because those are the band 3 and band 4
 * alternates the spine offers. Otherwise the items decide: MOST items reading as figures means `stats`,
 * anything else means `cards`. PURE.
 */
function resolveFeatureLayout(modelLayout: unknown, cards: readonly Record<string, unknown>[]): string {
  if (modelLayout === 'list' || modelLayout === 'columns' || modelLayout === 'spotlight') return modelLayout
  const stats = cards.filter((c) => isStatTitle(typeof c.title === 'string' ? c.title : '')).length
  return cards.length > 0 && stats * 2 > cards.length ? 'stats' : 'cards'
}

/** The gallery VIEW + GAP, derived from how many photos there are: four or more reads as a masonry wall,
 *  fewer reads as a plain grid; a masonry wall breathes at the roomy gap. PURE. */
function resolveGalleryView(count: number): { view: string; gap: string } {
  return count >= 4 ? { view: 'masonry', gap: 'roomy' } : { view: 'grid', gap: 'standard' }
}

// ── The pure plan -> layout step ──────────────────────────────────────────────────────────────────────

/** What an authored bag needs from the surrounding plan. `takeMediaSide` alternates the photo side across
 *  the zigzag-style bands that actually carry a photo (the first sits left). */
interface BagCtx {
  name: string
  gallery: string[]
  imageAt: (i: unknown) => string | undefined
  /** The CTA destination, already made safe. '' means there is no destination, so no button. */
  ctaUrl: string
  takeMediaSide: () => string
}

/**
 * PURE: turn the composer's BANDS into an EntityLayout (rows + per-block content bags).
 *
 * Bands 1 to 3 (the opening read) stack into ONE untitled row so the page opens as one continuous piece;
 * every other band becomes its own row, carrying its title as the row's live header (1 column stacked, or
 * 2 columns paired). Only KNOWN blocks survive, each block id at most once across the WHOLE layout, and an
 * authored block is dropped when it lacks its required content. Photos resolve by index into
 * `galleryImages`; the gallery block gets them all. Brand tuning (features layout, card shape, gallery
 * view, photo side) is DERIVED from real signals here, never taken from the model. The CTA button turns on
 * only when `opts.ctaUrl` is a safe destination. Contact + Business are guaranteed to close the page.
 * Never throws.
 */
export function planToLayout(
  sections: ComposedSection[],
  profile: BusinessProfile,
  galleryImages: string[],
  opts: { ctaUrl?: string } = {},
): EntityLayout | null {
  const gallery = galleryImages.filter((u) => isReadyMediaUrl(u))
  const imageAt = (i: unknown): string | undefined => {
    const n = typeof i === 'number' ? i : Number(i)
    return Number.isInteger(n) && n >= 0 && n < gallery.length ? gallery[n] : undefined
  }
  const name = (profile.name ?? '').trim()
  // The DESTINATION is the caller's, never the model's: a model-chosen url is a dead link. safeUrl keeps
  // only http(s) / mailto / tel / a same-origin path, so '/spaces/acme/book' rides through and a
  // javascript: href cannot.
  const ctaUrl = safeUrl(opts.ctaUrl)

  const content: Record<string, Record<string, unknown>> = {}
  const placed = new Set<string>()
  const rows: RowDef[] = []
  let photoBands = 0
  const ctx: BagCtx = {
    name,
    gallery,
    imageAt,
    ctaUrl,
    takeMediaSide: () => (photoBands++ % 2 === 0 ? 'left' : 'right'),
  }

  // Build one block into the content map (authored) or as a live-data placement, returning its id, or null
  // when it is unknown / already placed / an empty authored block.
  const buildBlock = (b: ComposedBlock | undefined): string | null => {
    const id = typeof b?.block === 'string' ? b.block : ''
    if (!COMPOSER_BLOCK_IDS.has(id) || placed.has(id)) return null
    if (AUTHORED_BLOCKS.has(id)) {
      const bag = authoredBag(id, b!, ctx)
      if (!bag) return null // an authored block with no usable content is skipped
      content[id] = bag
    } else {
      // A DATA block: place it (renders live data); carry an optional eyebrow/title override.
      const header: Record<string, unknown> = {}
      const eyebrow = clamp(b!.eyebrow, 60)
      const title = clamp(b!.title, 80)
      if (eyebrow) header.eyebrow = eyebrow
      if (title) header.title = title
      if (Object.keys(header).length) content[id] = header
    }
    placed.add(id)
    return id
  }

  const buildIds = (section: ComposedSection): string[] =>
    (section?.blocks ?? [])
      .slice(0, MAX_BLOCKS_PER_SECTION)
      .map(buildBlock)
      .filter((x): x is string => x !== null)

  // Push one row for a band's surviving block ids: 2 columns pairs them (round-robin) when the band asked
  // for it and there are at least two; otherwise a single stacked column. A blank title leaves the row
  // header-less (the opening read, a pure banner, a call-to-action band).
  const pushRow = (title: string | undefined, wantColumns: 1 | 2, ids: string[]) => {
    if (!ids.length || rows.length >= HARD_ROW_CAP) return
    const columns: RowColumns = wantColumns === 2 && ids.length >= 2 ? 2 : 1
    const cells: string[][] =
      columns === 2
        ? ids.reduce<[string[], string[]]>(
            (acc, id, i) => (acc[i % 2].push(id), acc),
            [[], []],
          )
        : [ids]
    const row: RowDef = { id: `r${rows.length}`, columns, cells }
    const t = normalizeRowTitle(title)
    if (t) {
      row.title = t
      row.headerOn = true
    }
    rows.push(row)
  }

  const bands = (sections ?? []).slice(0, MAX_MODEL_BANDS)
  // THE OPENING READ first: bands 1 to 3 stack into one untitled row. Building them first also fixes the
  // "each block once, first wins" priority to the page's own top-to-bottom order.
  const openingIds = bands.filter((s) => isOpeningBand(s?.band)).flatMap(buildIds)
  if (openingIds.length) pushRow(undefined, 1, openingIds)
  for (const band of bands) {
    if (isOpeningBand(band?.band)) continue
    pushRow(band?.title, band?.columns === 2 ? 2 : 1, buildIds(band))
  }

  // The THINNESS gate reads the MODEL's own output (before the guaranteed core top-up): a model that placed
  // fewer than two real blocks is too thin to override the richer deterministic layout, so bail and let the
  // caller fall back. The core append below is a top-up on a real page, never a crutch that rescues a
  // degenerate one.
  if (placed.size < 2) return null

  // GUARANTEE the core "reach us" data blocks so every seeded page can be contacted + found online, even
  // when the model forgot them. Safe to append: they render live data, so they never duplicate a design
  // block's prose. Grouped into a final "Find us" section (paired when both are missing).
  const missingCore = CORE_TRAILING_BLOCKS.filter((id) => !placed.has(id))
  if (missingCore.length) {
    for (const id of missingCore) placed.add(id)
    pushRow('Find us', missingCore.length === 2 ? 2 : 1, [...missingCore])
  }

  const layout: EntityLayout = { rows }
  if (Object.keys(content).length) layout.content = content
  return layout
}

/** Build the content bag for one AUTHORED block, or null when it lacks its required content. Emits ONLY
 *  keys the block's real field schema declares (block-content.ts), with every enum / toggle run through the
 *  sparse validators, so what lands here is exactly what the sanitizer keeps. PURE. */
function authoredBag(id: string, s: ComposedBlock, ctx: BagCtx): Record<string, unknown> | null {
  const eyebrow = clamp(s.eyebrow, 60)
  const title = clamp(s.title, 120)
  const subtitle = clamp(s.subtitle, 300)
  // Bounded generously: a band lifted near verbatim from the business's own site is several short
  // paragraphs, separated with <br><br> (the sanitizer's inline-HTML allowlist keeps <br>).
  const body = clamp(s.body, 1800)
  const alt = clamp(s.alt, 120)
  const cards = (s.cards ?? [])
    .map((c) => {
      const card: Record<string, unknown> = {
        icon: clamp(c?.icon, 40),
        title: clamp(c?.title, 80),
        text: clamp(c?.text, 240),
      }
      const image = ctx.imageAt(c?.imageIndex)
      if (image) card.image = image
      return card
    })
    .filter((c) => c.title || c.text || c.image)
    .slice(0, 6)
  const image = ctx.imageAt(s.imageIndex)

  switch (id) {
    case 'editorial': {
      if (!body) return null
      const bag: Record<string, unknown> = { body }
      if (eyebrow) bag.eyebrow = eyebrow
      if (title) bag.title = title
      return bag
    }
    case 'zigzag': {
      if (!body) return null
      const bag: Record<string, unknown> = { body }
      if (eyebrow) bag.eyebrow = eyebrow
      if (title) bag.title = title
      if (image) {
        bag.image = image
        if (alt) bag.alt = alt
        // DERIVED: alternate the photo side across the zigzag-style bands that carry a photo (the first
        // sits left). A block id can appear only once, so today exactly one zigzag can carry a photo and
        // the derived side is 'left'; an explicit model side still wins when it differs from the default.
        const alternated = ctx.takeMediaSide()
        const side = sparseEnum(id, 'mediaSide', s.mediaSide) ?? sparseEnum(id, 'mediaSide', alternated)
        if (side) bag.mediaSide = side
        const aspect = sparseEnum(id, 'aspect', s.aspect)
        if (aspect) bag.aspect = aspect
      }
      return bag
    }
    case 'accentBeat': {
      if (!title && !body) return null
      const bag: Record<string, unknown> = {}
      if (eyebrow) bag.eyebrow = eyebrow
      if (title) bag.title = title
      if (body) bag.body = body
      // THE CTA. The model supplies the LABEL only. The destination is the caller's `ctaUrl`, already made
      // safe, so a model-chosen url can never become a dead (or hostile) link. The button is on ONLY when
      // there is both a real destination and a real label; otherwise it is explicitly OFF, so a seeded page
      // never ends on a button that goes nowhere.
      const label = clamp(s.buttonLabel, 40)
      if (ctx.ctaUrl && label) {
        bag.buttonOn = true
        bag.buttonLabel = label
        bag.buttonUrl = ctx.ctaUrl
      } else {
        bag.buttonOn = false
      }
      return bag
    }
    case 'features': {
      if (cards.length === 0) return null
      const bag: Record<string, unknown> = { items: cards }
      if (eyebrow) bag.eyebrow = eyebrow
      if (title) bag.title = title
      // DERIVED: figures read as the stats layout, everything else as cards (an explicit list / columns /
      // spotlight from the model is honoured, because those are the spine's own alternates).
      const layout = sparseEnum(id, 'layout', resolveFeatureLayout(s.layout, cards))
      if (layout) bag.layout = layout
      const columns = sparseEnum(id, 'columns', s.columns)
      if (columns) bag.columns = columns
      return bag
    }
    case 'cardGrid': {
      if (cards.length === 0) return null
      const bag: Record<string, unknown> = { cards }
      if (title) bag.title = title
      if (subtitle) bag.subtitle = subtitle
      // DERIVED: cards that carry photos read better with the image to the LEFT; text-only step cards read
      // better as plain top-image tiles (the block default).
      const withPhotos = cards.some((c) => typeof c.image === 'string')
      const shape = sparseEnum(id, 'shape', withPhotos ? 'left' : 'top')
      if (shape) bag.shape = shape
      const columns = sparseEnum(id, 'columns', s.columns)
      if (columns) bag.columns = columns
      const rounded = sparseToggle(id, 'rounded', s.rounded)
      if (rounded !== undefined) bag.rounded = rounded
      const shadow = sparseToggle(id, 'shadow', s.shadow)
      if (shadow !== undefined) bag.shadow = shadow
      return bag
    }
    case 'gallery': {
      // The gallery IS the photos: it carries every selectable photo, so it is dropped when there are none.
      if (!ctx.gallery.length) return null
      const bag: Record<string, unknown> = { images: [...ctx.gallery] }
      // DERIVED: four or more photos read as a masonry wall at the roomy gap; fewer read as a plain grid.
      // An explicit model choice wins over the derived one. A model value equal to the block default is
      // indistinguishable from no value at all (both are dropped as sparse), so the derived choice stands.
      const derived = resolveGalleryView(ctx.gallery.length)
      const view = sparseEnum(id, 'view', s.view) ?? sparseEnum(id, 'view', derived.view)
      if (view) bag.view = view
      const gap = sparseEnum(id, 'gap', s.gap) ?? sparseEnum(id, 'gap', derived.gap)
      if (gap) bag.gap = gap
      return bag
    }
    case 'image': {
      const src = image ?? ctx.gallery[0]
      if (!src) return null
      const bag: Record<string, unknown> = { src }
      if (alt) bag.alt = alt
      const aspect = sparseEnum(id, 'aspect', s.aspect)
      if (aspect) bag.aspect = aspect
      return bag
    }
    case 'prose': {
      if (!body) return null
      return { text: body }
    }
    default:
      return null
  }
}

// ── The model call ────────────────────────────────────────────────────────────────────────────────────

const TOOL: Anthropic.Tool = {
  name: 'compose_page',
  description: 'Return the marketing page as the BANDS of the spine, top to bottom, each carrying its blocks.',
  input_schema: {
    type: 'object',
    properties: {
      bands: {
        type: 'array',
        description:
          'The page as bands, top to bottom, following the band spine. Skip a band whose content does not exist. Use each block at most once across the whole page.',
        items: {
          type: 'object',
          properties: {
            band: {
              type: 'integer',
              description:
                'The spine band number this is (1 to 9). Bands 1, 2 and 3 group into one continuous opening section.',
            },
            title: {
              type: 'string',
              description:
                'The section heading shown over this band (e.g. "What we offer", "Contact and details"). Leave blank for bands 1 to 3, for a band whose single design block already carries its own heading, and for a pure call-to-action band.',
            },
            columns: {
              type: 'integer',
              enum: [1, 2],
              description: 'Set 2 to pair two blocks side by side in this band (offerings + booking, contact + business); else 1.',
            },
            blocks: {
              type: 'array',
              description: 'The blocks in this band, in order.',
              items: {
                type: 'object',
                properties: {
                  block: { type: 'string', enum: [...COMPOSER_BLOCK_IDS] },
                  eyebrow: { type: 'string', description: 'A short lowercase kicker, two to four words.' },
                  title: { type: 'string', description: 'The block heading, one plain line.' },
                  subtitle: { type: 'string', description: 'A line under the heading (card grid only).' },
                  body: {
                    type: 'string',
                    description:
                      'The block copy, lifted near verbatim from their own words and trimmed to fit. Separate paragraphs with <br><br>.',
                  },
                  buttonLabel: {
                    type: 'string',
                    description: 'The call-to-action button text (accent beat). Write the label only; the destination is set for you.',
                  },
                  cards: {
                    type: 'array',
                    description: 'The items of a features or card grid block.',
                    items: {
                      type: 'object',
                      properties: {
                        title: { type: 'string', description: 'The item title, or the figure for a stat ("1,000+").' },
                        text: { type: 'string', description: 'One plain line saying what it is, or what the figure counts.' },
                        icon: { type: 'string', description: 'A short icon token: "1", "2", "3" for numbered steps, or a Lucide icon name.' },
                        imageIndex: { type: 'integer', description: 'Which photo (0-based) sits on this card, or omit.' },
                      },
                    },
                  },
                  imageIndex: { type: 'integer', description: 'Which photo (0-based) for a zigzag or an image block, or omit.' },
                  alt: { type: 'string', description: 'A plain description of the photo.' },
                  layout: { type: 'string', enum: FEATURE_LAYOUTS, description: 'Features only. Leave blank to let the content decide between stats and cards.' },
                  columns: { type: 'string', enum: GRID_COLUMNS, description: 'How many columns the features or card grid runs.' },
                  shape: { type: 'string', enum: CARD_SHAPES, description: 'Card grid only: where the card photo sits.' },
                  rounded: { type: 'boolean', description: 'Card grid only: rounded corners (on by default).' },
                  shadow: { type: 'boolean', description: 'Card grid only: drop shadow (on by default).' },
                  mediaSide: { type: 'string', enum: MEDIA_SIDES, description: 'Zigzag only: which side the photo sits on.' },
                  aspect: { type: 'string', enum: IMAGE_ASPECTS, description: 'The photo shape for a zigzag or an image block.' },
                  view: { type: 'string', enum: GALLERY_VIEWS, description: 'Gallery only. Leave blank to let the photo count decide.' },
                  gap: { type: 'string', enum: GALLERY_GAPS, description: 'Gallery only: how much air sits between the photos.' },
                },
                required: ['block'],
              },
            },
          },
          required: ['blocks'],
        },
      },
    },
    required: ['bands'],
  },
}

/** The spine, rendered for the prompt. */
const SPINE_TEXT = BAND_SPINE.map(
  (b) => `- Band ${b.n}. ${b.intent}. Primary: ${b.primary}. Swap to: ${b.swap}. Drop when: ${b.drop}.`,
).join('\n')

/** The composer's system prompt. Exported so a test can hold the copy rules to the voice canon. */
export const COMPOSE_SYSTEM = `You are a top-level web designer AND copy editor, building a business's page out of the words that business already wrote.

You are given: the business brief, a VERBATIM EXCERPT of what they published on their own site, the blocks you may use, the BAND SPINE (the house page structure), and how many photos are available.

HOW TO WRITE THE COPY. This is the most important rule:
- LIFT their own sentences out of the excerpt, near verbatim, trimmed to fit the block.
- Trim for length. Cut hype. Cut em dashes. Fix a voice break. Keep their nouns, their examples, and their order of ideas.
- Write new sentences ONLY for the connective tissue, and for a band their words give you nothing for.
- Their words carry the page. You are trimming and placing, not rewriting.
- NEVER invent a fact, a price, a statistic, a credential, or a health or medical claim. If the excerpt does not say it, it does not go on the page.
- NEVER restate a price, a phone number, an address, or opening hours inside a design block's prose. Those live in their own data blocks, which render live data.
- Never repeat the same sentence in two blocks. No emoji. No em dashes. Plain sentences, sentence case, contractions.

HOW THE PAGE IS BUILT. Follow this spine top to bottom. Each band has an intent, a primary block, the alternates you may swap in when their content does not fit the primary, and when the band drops entirely:
${SPINE_TEXT}
- Follow the spine where you can. Where their content does not fit the primary block, use an alternate and tune it to their brand. A basic layout that fits is better than a rich one that does not.
- Give every band its band NUMBER. Bands 1, 2 and 3 group into one continuous opening section, so leave their titles blank and let each block's own heading lead.
- Give a band a short title ONLY when the band needs a heading over it. A band that is one design block with its own heading, and a pure call-to-action band, leave blank.
- Set a band's columns to 2 to pair two blocks side by side (offerings + booking, contact + business).
- Choose from the given blocks only, and use each block AT MOST ONCE on the whole page.

HOUSE LOOK AND FEEL. Imitate this:
- Eyebrows are short and lowercase, two to four words, like "finding myself" or "the path to whole".
- Separate paragraphs inside a body with <br><br>.
- The opener can be a qualifier ("This might be you") followed by short one-line symptoms taken from their own copy.
- The story band stays in first person when their source is written in first person. Keep their voice.
- A three-step method reads as a card grid with the icons "1", "2", "3".
- A proof band of numbers reads as features: put the figure in the item title ("1,000+") and what it counts in the text.
- Reference a photo by its 0-based INDEX. Never write a url.
- For the ask, write the BUTTON LABEL only. The destination is set for you.

Return the page via the compose_page tool.`

/** How much of the verbatim excerpt rides into the prompt. */
const EXCERPT_MAX = 14_000

function brief(profile: BusinessProfile, opts: { bookable?: boolean } = {}): string {
  const lines: string[] = []
  const add = (k: string, v?: string) => {
    const t = (v ?? '').trim()
    if (t) lines.push(`${k}: ${t}`)
  }
  add('Name', profile.name)
  add('Tagline', profile.tagline)
  add('Category', profile.category)
  add('About', profile.about)
  add('Story', profile.story)
  const offerings = (profile.offerings ?? []).filter((o) => o.title?.trim())
  if (offerings.length) lines.push(`Offerings:\n${offerings.map((o) => `- ${o.title}${o.blurb ? `: ${o.blurb}` : ''}`).join('\n')}`)
  const c = profile.contact
  if (c?.hours) add('Hours', c.hours)
  if (opts.bookable || (profile.availability ?? []).length) lines.push('Bookable: yes')
  if ((profile.team ?? []).some((t) => t.name?.trim())) lines.push('Has a team: yes')
  if ((profile.faq ?? []).some((f) => f.q?.trim())) lines.push('Has FAQ: yes')
  if ((profile.events ?? []).some((e) => e.title?.trim())) lines.push('Has upcoming events: yes')
  if ((profile.reviews ?? []).some((r) => r.text?.trim()) || (profile.rating?.value ?? '').trim())
    lines.push('Has testimonials or a rating: yes')
  if ((c?.socials ?? []).length) lines.push('Has social links: yes')
  return lines.join('\n')
}

/**
 * PURE: the user message for one compose call. Exported so a test can prove the verbatim excerpt, the
 * photo count, the block catalog, the spine, and the CTA state actually reach the model, without spending
 * a model call. Every part is bounded, so a huge harvest can never blow the context window.
 */
export function buildComposeUserPrompt(
  profile: BusinessProfile,
  gallery: string[],
  opts: { directions?: string; sourceExcerpt?: string; ctaUrl?: string; bookable?: boolean } = {},
): string {
  const catalog = COMPOSER_BLOCKS.map((b) => `- ${b.id}: ${b.use}`).join('\n')
  const directions = (opts.directions ?? '').trim()
  const excerpt = (opts.sourceExcerpt ?? '').trim().slice(0, EXCERPT_MAX)
  const ctaUrl = safeUrl(opts.ctaUrl)
  return [
    `BUSINESS BRIEF:\n${brief(profile, opts)}`,
    excerpt
      ? `\nTHEIR OWN WORDS (verbatim from their site; LIFT the page copy out of this, trimmed to fit):\n${excerpt}`
      : '\nTHEIR OWN WORDS: none harvested. Write from the brief only, and keep every band short rather than padded.',
    `\nPHOTOS AVAILABLE: ${gallery.length} (reference by index 0..${Math.max(0, gallery.length - 1)})`,
    `\nAVAILABLE BLOCKS:\n${catalog}`,
    ctaUrl
      ? '\nTHE ASK: there is a real destination for band 8, so include it and write the button label. Do not write a url.'
      : '\nTHE ASK: there is no destination to send people to, so drop band 8.',
    directions ? `\nOPERATOR DIRECTIONS (follow where they fit, never invent facts): ${directions.slice(0, 400)}` : '',
    '\nCompose the page now.',
  ].join('\n')
}

/**
 * Compose a marketing-page EntityLayout for `profile`, or null when AI is off / over budget / errors (the
 * caller then falls back to the deterministic composeLayout). `galleryImages` are the selectable photos
 * (the non-cover gallery); the model references them by index. `policy` is accepted for parity with the
 * deterministic path (the composer only writes prose, never a commercial fact, so it is advisory here).
 */
export async function composeMarketingLayout(
  profile: BusinessProfile,
  galleryImages: string[],
  opts: {
    profileId?: string | null
    directions?: string
    policy?: CommercialPolicy
    /** The verbatim website excerpt from lib/importer/excerpt.ts. Absent means today's behaviour. */
    sourceExcerpt?: string
    /** Where the call to action sends people, e.g. '/spaces/acme/book'. Absent means no CTA button. */
    ctaUrl?: string
    /** Whether the business takes bookings (drives band 6). */
    bookable?: boolean
  } = {},
): Promise<EntityLayout | null> {
  if (!(profile.name ?? '').trim()) return null
  if (!(await aiAvailable()) || (await featureOverBudget(FEATURE))) return null

  const gallery = galleryImages.filter((u) => isReadyMediaUrl(u))
  const userText = buildComposeUserPrompt(profile, gallery, opts)

  try {
    const res = await completeRaw({
      system: withVoice(COMPOSE_SYSTEM),
      messages: [{ role: 'user', content: userText }],
      maxTokens: 4000,
      tools: [TOOL],
      toolChoice: { type: 'tool', name: 'compose_page' },
    })
    void recordAiUsage({ feature: FEATURE, model: res.model, usage: res.usage, costUsd: res.costUsd, profileId: opts.profileId ?? null })

    const call = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'compose_page')
    // `bands` is the current tool shape; `sections` is accepted as a fallback so an older / retried call
    // shape still lands rather than dropping the whole page.
    const input = (call?.input ?? {}) as { bands?: unknown; sections?: unknown }
    const raw = Array.isArray(input.bands) ? input.bands : input.sections
    if (!Array.isArray(raw)) return null
    return planToLayout(raw as ComposedSection[], profile, gallery, { ctaUrl: opts.ctaUrl })
  } catch {
    return null
  }
}

// ── Per-block copy re-seed (ADR-582, task #17) ────────────────────────────────────────────────────────────
// Regenerate the copy of ONE block on a live Space from its master profile, on the operator's demand. Unlike
// composeMarketingLayout (which designs the whole page), this rewrites only the given block's TEXT fields and
// touches nothing else. The operator clicks "Re-seed copy" on a single block. Grounded ONLY in the verified
// brief plus (when the caller has it) the business's OWN WORDS, so a re-seed lifts from the same source the
// composer did. Never invents a fact, house voice, no em dashes. Returns a partial content bag keyed by the
// block's own field keys, or null when there is nothing to do (no text fields, no profile, AI off / over
// budget).

const BLOCK_COPY_SYSTEM = `You are a copy editor rewriting the copy of ONE section of a business's page.
You are given the business brief, sometimes a verbatim excerpt of the words they published themselves, and the section's text fields (each with its current value). Write better copy for EACH field.
Rules, follow exactly:
- When you are given their own words, LIFT from them near verbatim and trim to fit. Keep their nouns and their examples.
- Write ONLY from the brief and that excerpt. NEVER invent a fact, a price, a statistic, a name, or a health or medical claim. If they do not support a field, keep it close to its current value.
- Never restate a price, a phone number, an address, or opening hours in this copy. Those render from live data elsewhere on the page.
- Match each field to its role: an eyebrow is a short kicker (two to four words), a heading or title is one plain line, a body or message is one or two short sentences.
- Plain, honest sentences. No hype, no jargon, no emoji, no em dashes. Do not repeat the same sentence across fields.
Return the rewritten fields via the block_copy tool. Omit a field to leave it unchanged.`

/** Regenerate ONE block's text copy from the master profile (task #17). Rewrites only the block's `text` /
 *  `textarea` fields, grounded in the brief (and the verbatim excerpt when the caller has one); returns a
 *  partial content bag (the rewritten field values) to merge over the block's current content, or null when
 *  there is nothing to regenerate. PURE of any write: the caller persists the merge through the normal
 *  editor save path. */
export async function reseedBlockCopy(
  blockId: string,
  profile: BusinessProfile,
  current: Record<string, unknown>,
  opts: { profileId?: string | null; directions?: string; sourceExcerpt?: string } = {},
): Promise<Record<string, string> | null> {
  const textFields = fieldsForBlock(blockId).filter((f) => f.type === 'text' || f.type === 'textarea')
  if (!textFields.length) return null
  if (!(profile.name ?? '').trim()) return null
  if (!(await aiAvailable()) || (await featureOverBudget(FEATURE))) return null

  // A tool schema with one optional string per text field, so the model can only ever write to this block's
  // real field keys (a tampered key can't reach the content bag).
  const properties: Record<string, unknown> = {}
  for (const f of textFields) {
    properties[f.key] = {
      type: 'string',
      description: `${f.label}: ${f.type === 'textarea' ? 'one or two short sentences' : 'a short line'}`,
    }
  }
  const TOOL: Anthropic.Tool = {
    name: 'block_copy',
    description: 'Return the rewritten copy for this section, one entry per field. Omit a field to leave it as is.',
    input_schema: { type: 'object', properties, required: [] },
  }

  const fieldLines = textFields
    .map((f) => `- ${f.key} (${f.label}): ${(typeof current[f.key] === 'string' ? (current[f.key] as string) : '').trim() || '(empty)'}`)
    .join('\n')
  const directions = (opts.directions ?? '').trim()
  // A single block needs far less source than a whole page, so the excerpt rides in at a quarter budget.
  const excerpt = (opts.sourceExcerpt ?? '').trim().slice(0, EXCERPT_MAX / 4)
  const userText = [
    `BUSINESS BRIEF:\n${brief(profile)}`,
    excerpt ? `\nTHEIR OWN WORDS (verbatim from their site; lift from this):\n${excerpt}` : '',
    `\nSECTION: ${blockId}`,
    `\nFIELDS TO REWRITE:\n${fieldLines}`,
    directions ? `\nOPERATOR DIRECTIONS (follow where they fit, never invent facts): ${directions.slice(0, 400)}` : '',
    '\nRewrite the copy now.',
  ].join('\n')

  try {
    const res = await completeRaw({
      system: withVoice(BLOCK_COPY_SYSTEM),
      messages: [{ role: 'user', content: userText }],
      maxTokens: 800,
      tools: [TOOL],
      toolChoice: { type: 'tool', name: 'block_copy' },
    })
    void recordAiUsage({ feature: FEATURE, model: res.model, usage: res.usage, costUsd: res.costUsd, profileId: opts.profileId ?? null })

    const call = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'block_copy')
    const input = (call?.input ?? {}) as Record<string, unknown>
    const out: Record<string, string> = {}
    for (const f of textFields) {
      const v = input[f.key]
      if (typeof v === 'string' && v.trim()) out[f.key] = stripEmDashes(v.trim())
    }
    return Object.keys(out).length ? out : null
  } catch {
    return null
  }
}
