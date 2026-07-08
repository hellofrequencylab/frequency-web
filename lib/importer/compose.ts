// ─────────────────────────────────────────────────────────────────────────────
// SMART BUSINESS IMPORTER — the AI MARKETING-PAGE COMPOSER (Importer v2). Given the verified draft +
// the available block palette (with when-to-use guidance) + the uploaded photos, ONE model call acts as
// a page designer: it reads what the business IS and picks the best blocks for a best-practice marketing
// page, then writes the copy for the design blocks (Banner / Card grid / Zigzag / Accent beat / Features /
// Text Block) and assigns photos. The output is turned into an EntityLayout the materializer writes to
// spaces.preferences.profileLayout.
//
// SAFE BY CONSTRUCTION: the model chooses from a FIXED block allowlist and references photos by INDEX
// (never a raw URL), so it can neither invent a block nor inject an image. planToLayout is PURE +
// unit-tested; the materializer additionally runs sanitizeEntityLayout, so a bad bag is dropped. When AI
// is off / over budget / errors, composeMarketingLayout returns null and the caller falls back to the
// deterministic composeLayout (lib/importer/map.ts). The copy never invents a fact or a health claim.
// ─────────────────────────────────────────────────────────────────────────────

import type Anthropic from '@anthropic-ai/sdk'
import { completeRaw } from '@/lib/ai/complete'
import { aiAvailable, featureOverBudget, recordAiUsage } from '@/lib/ai/usage'
import { withVoice } from '@/lib/ai/voice'
import { stripEmDashes } from '@/lib/ai/space-copilot'
import { isReadyMediaUrl, type CommercialPolicy } from './map'
import { normalizeRowTitle, type EntityLayout, type RowColumns, type RowDef } from '@/lib/entity-blocks/layout'
import type { BusinessProfile } from './schema'

const FEATURE = 'seed-compose'

/** The blocks the composer may place, with best-practice WHEN-TO-USE guidance. The model chooses from
 *  THIS allowlist only (a returned id not here is dropped), so the composition can never invent a block. */
const COMPOSER_BLOCKS: { id: string; use: string }[] = [
  // NOTE: no `photoHero` (in-page Banner). The Space's COVER already IS the hero (the primary image +
  // name + tagline), so a Banner block would be a duplicate hero. Lead with `editorial` instead.
  { id: 'editorial', use: 'A heading over a paragraph or two. The OPENER — best for the About / what-this-is section.' },
  { id: 'features', use: 'A set of 3 to 4 value props, each an icon + short title + one line. Best for "why choose us" / the differentiators.' },
  { id: 'cardGrid', use: 'A heading over a row of cards. Best for showing the offerings / services as cards.' },
  { id: 'zigzag', use: 'A photo beside a column of text. Great for a story beat with a photo.' },
  { id: 'accentBeat', use: 'A colored splash with a headline and a short message. A conversion call-to-action; use once near the end.' },
  { id: 'prose', use: 'A styled paragraph of body text. Use once to intermix a short write-up between sections.' },
  { id: 'gallery', use: 'The uploaded photos as a grid. Use once when there are several photos.' },
  { id: 'about', use: 'DATA block (the About body). Use this OR an editorial block for the about, not both.' },
  { id: 'story', use: 'DATA block (the longer story body). Use this OR a zigzag for the story, not both.' },
  { id: 'offerings', use: 'DATA block (live services + prices). Use this OR cardGrid for the services, not both.' },
  { id: 'booking', use: 'DATA block (pick a time + book). Use ONLY for a bookable business.' },
  { id: 'team', use: 'DATA block (the people). Use ONLY if there is a team.' },
  { id: 'contact', use: 'DATA block (address, hours, phone, email).' },
  { id: 'business', use: 'DATA block (find them online / socials).' },
  { id: 'faq', use: 'DATA block (common questions).' },
]

const COMPOSER_BLOCK_IDS = new Set(COMPOSER_BLOCKS.map((b) => b.id))
/** The design blocks whose COPY the composer authors (the rest are DATA blocks that render live data). */
const AUTHORED_BLOCKS = new Set(['editorial', 'features', 'cardGrid', 'zigzag', 'accentBeat', 'prose'])

/** One BLOCK inside a section. The block id is validated against the allowlist; `imageIndex` is an index
 *  into the SELECTABLE photos (the non-cover gallery), resolved to a URL server-side. */
export interface ComposedBlock {
  block: string
  eyebrow?: string
  title?: string
  subtitle?: string
  body?: string
  buttonLabel?: string
  cards?: { title?: string; text?: string }[]
  imageIndex?: number
}

/** One SECTION the composer returns (Importer v2.1): a NAMED band of the page that groups related blocks.
 *  Its `title` becomes the row's live section header (a titled row renders its name as a heading on the
 *  page); a pure banner / call-to-action section can leave the title blank so no header sits over it.
 *  `columns` pairs two blocks side by side (a Space page is at most two columns) when there are enough. */
export interface ComposedSection {
  title?: string
  columns?: 1 | 2
  blocks: ComposedBlock[]
}

/** Model sections we process (the prompt asks for 3 to 5); the guaranteed-core append may add up to two
 *  more, so the hard row cap sits a little above the ask. */
const MAX_MODEL_SECTIONS = 5
const HARD_ROW_CAP = 7
const MAX_BLOCKS_PER_SECTION = 4
/** DATA blocks the seed ALWAYS ends with when the model omits them: how to reach the business + find it
 *  online. Both render from live data (never a design block that could duplicate them), so appending the
 *  missing ones can never double up content, and every seeded page carries Contact + Business. */
const CORE_TRAILING_BLOCKS = ['contact', 'business'] as const
const clamp = (v: unknown, max: number): string => stripEmDashes(String(v ?? '')).trim().slice(0, max)

/**
 * PURE: turn the composer's NAMED sections into an EntityLayout (titled rows + per-block content bags).
 * Each section becomes one row whose blocks are grouped into it (1 column stacked, or 2 columns paired),
 * carrying the section title as the row's live header. Only KNOWN blocks survive, each block id at most
 * once across the WHOLE layout (the content map is keyed by id), and an authored design block is dropped
 * when it lacks its required copy. Photos resolve by index into `galleryImages`; the gallery block gets
 * them all. Contact + Business are guaranteed to close the page. Never throws.
 */
export function planToLayout(
  sections: ComposedSection[],
  profile: BusinessProfile,
  galleryImages: string[],
): EntityLayout | null {
  const gallery = galleryImages.filter((u) => isReadyMediaUrl(u))
  const imageAt = (i: unknown): string | undefined => {
    const n = typeof i === 'number' ? i : Number(i)
    return Number.isInteger(n) && n >= 0 && n < gallery.length ? gallery[n] : undefined
  }
  const name = (profile.name ?? '').trim()

  const content: Record<string, Record<string, unknown>> = {}
  const placed = new Set<string>()
  const rows: RowDef[] = []

  // Build one block into the content map (authored) or as a live-data placement, returning its id, or null
  // when it is unknown / already placed / an empty authored block.
  const buildBlock = (b: ComposedBlock | undefined): string | null => {
    const id = typeof b?.block === 'string' ? b.block : ''
    if (!COMPOSER_BLOCK_IDS.has(id) || placed.has(id)) return null
    if (AUTHORED_BLOCKS.has(id)) {
      const bag = authoredBag(id, b!, { name, imageAt })
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

  // Push one titled row for a section's surviving block ids: 2 columns pairs them (round-robin) when the
  // section asked for it and there are at least two; otherwise a single stacked column. A blank title
  // leaves the row header-less (a pure banner / CTA band).
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

  for (const section of (sections ?? []).slice(0, MAX_MODEL_SECTIONS)) {
    const ids = (section?.blocks ?? [])
      .slice(0, MAX_BLOCKS_PER_SECTION)
      .map(buildBlock)
      .filter((x): x is string => x !== null)
    pushRow(section?.title, section?.columns === 2 ? 2 : 1, ids)
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

/** Build the content bag for one AUTHORED design block, or null when it lacks its required copy. PURE. */
function authoredBag(
  id: string,
  s: ComposedBlock,
  ctx: { name: string; imageAt: (i: unknown) => string | undefined },
): Record<string, unknown> | null {
  const eyebrow = clamp(s.eyebrow, 60)
  const title = clamp(s.title, 120)
  const subtitle = clamp(s.subtitle, 300)
  const body = clamp(s.body, 1200)
  const cards = (s.cards ?? [])
    .map((c) => ({ icon: '', title: clamp(c?.title, 80), text: clamp(c?.text, 240) }))
    .filter((c) => c.title || c.text)
    .slice(0, 6)
  const image = ctx.imageAt(s.imageIndex)

  switch (id) {
    case 'photoHero': {
      const bag: Record<string, unknown> = { title: title || ctx.name, buttonOn: false }
      if (eyebrow) bag.eyebrow = eyebrow
      if (subtitle) bag.subtitle = subtitle
      if (image) bag.image = image
      return bag
    }
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
      if (image) bag.image = image
      return bag
    }
    case 'accentBeat': {
      if (!title && !body) return null
      const bag: Record<string, unknown> = { buttonOn: false }
      if (eyebrow) bag.eyebrow = eyebrow
      if (title) bag.title = title
      if (body) bag.body = body
      return bag
    }
    case 'features': {
      if (cards.length === 0) return null
      return { items: cards }
    }
    case 'cardGrid': {
      if (cards.length === 0) return null
      const bag: Record<string, unknown> = { cards, buttonOn: false }
      if (eyebrow) bag.eyebrow = eyebrow
      if (title) bag.title = title
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

const TOOL: Anthropic.Tool = {
  name: 'compose_page',
  description: 'Return the marketing page as 3 to 5 NAMED sections, each grouping its blocks, top to bottom.',
  input_schema: {
    type: 'object',
    properties: {
      sections: {
        type: 'array',
        description:
          'The page as 3 to 5 sections, top to bottom. Each section is a NAMED band that groups related blocks. Use each block at most once across the whole page.',
        items: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description:
                'The section heading shown on the page (e.g. "What we offer", "Our story", "Find us"). Leave blank ONLY for a pure banner or call-to-action band that needs no heading.',
            },
            columns: {
              type: 'integer',
              enum: [1, 2],
              description: 'Set 2 to pair two blocks side by side in this section (e.g. offerings + booking); else 1.',
            },
            blocks: {
              type: 'array',
              description: 'The blocks in this section, in order. One block for a simple section, two to group them.',
              items: {
                type: 'object',
                properties: {
                  block: { type: 'string', enum: [...COMPOSER_BLOCK_IDS] },
                  eyebrow: { type: 'string' },
                  title: { type: 'string' },
                  subtitle: { type: 'string' },
                  body: { type: 'string' },
                  cards: {
                    type: 'array',
                    items: { type: 'object', properties: { title: { type: 'string' }, text: { type: 'string' } } },
                  },
                  imageIndex: { type: 'integer', description: 'Which photo (0-based) for a zigzag, or omit.' },
                },
                required: ['block'],
              },
            },
          },
          required: ['blocks'],
        },
      },
    },
    required: ['sections'],
  },
}

function brief(profile: BusinessProfile): string {
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
  if ((profile.availability ?? []).length) lines.push('Bookable: yes (has availability)')
  if ((profile.team ?? []).some((t) => t.name?.trim())) lines.push('Has a team: yes')
  if ((profile.faq ?? []).some((f) => f.q?.trim())) lines.push('Has FAQ: yes')
  if ((c?.socials ?? []).length) lines.push('Has social links: yes')
  return lines.join('\n')
}

const SYSTEM = `You are a top-level web designer AND copywriter building a business's "About" home page from real, verified content.
You are given the business brief, the available page BLOCKS (with when-to-use notes), and how many PHOTOS are available.
Design a best-practice page as a set of clearly NAMED sections, then write the copy. Work like a real designer: group related blocks, name each section, and pick the blocks that fit THIS business.
Rules, follow exactly:
- Return 3 to 5 SECTIONS, top to bottom. Name the MULTI-block sections with a short, human title that reads as a heading (e.g. "What we offer", "Come see us"): the title is the ONE heading for that band, so do NOT also repeat it as a block title or eyebrow inside the same section. For a section that is a SINGLE design block which already carries its own heading (editorial, cardGrid, zigzag, accentBeat), leave the section title blank and let the block's own heading lead. Also leave it blank for a pure call-to-action band.
- GROUP related blocks into one section. Set a section's columns to 2 to pair two blocks side by side (e.g. offerings + booking, or team + contact); use 1 column otherwise. A section may hold one or two blocks.
- Choose from the given blocks only. Use each block AT MOST ONCE across the whole page.
- COVER every core thing an About page needs, using the blocks that fit: what the business is and its story (about / story data blocks, or an editorial / zigzag that carries them), what it offers (offerings or a card grid), why choose it (a features section of 3 to 4 value props), the photos (the gallery when there are several), and how to reach it (contact with hours, and the business presence / socials). Add booking for a bookable business and FAQ when there are questions.
- Use 3 to 5 DESIGN blocks (editorial, features, cardGrid, zigzag, accentBeat, gallery) so the page reads like real marketing, not a stack of data cards. The Space cover already shows the hero image + name, so do NOT open with a banner.
- Write copy ONLY from the brief. NEVER invent a fact, a price, a statistic, or a health/medical claim, and never repeat the same sentence across two blocks. Plain sentences, no hype, no jargon, no emoji, no em dashes.
- For a features / cardGrid, write a short title + one plain line per item. For a zigzag, reference a photo by its 0-based index (omit if none fits).
Return the page via the compose_page tool.`

/**
 * Compose a marketing-page EntityLayout for `profile`, or null when AI is off / over budget / errors (the
 * caller then falls back to the deterministic composeLayout). `galleryImages` are the selectable photos
 * (the non-cover gallery); the model references them by index. `policy` is accepted for parity with the
 * deterministic path (the composer only writes prose, never a commercial fact, so it is advisory here).
 */
export async function composeMarketingLayout(
  profile: BusinessProfile,
  galleryImages: string[],
  opts: { profileId?: string | null; directions?: string; policy?: CommercialPolicy } = {},
): Promise<EntityLayout | null> {
  if (!(profile.name ?? '').trim()) return null
  if (!(await aiAvailable()) || (await featureOverBudget(FEATURE))) return null

  const gallery = galleryImages.filter((u) => isReadyMediaUrl(u))
  const catalog = COMPOSER_BLOCKS.map((b) => `- ${b.id}: ${b.use}`).join('\n')
  const directions = (opts.directions ?? '').trim()
  const userText = [
    `BUSINESS BRIEF:\n${brief(profile)}`,
    `\nPHOTOS AVAILABLE: ${gallery.length} (reference by index 0..${Math.max(0, gallery.length - 1)})`,
    `\nAVAILABLE BLOCKS:\n${catalog}`,
    directions ? `\nOPERATOR DIRECTIONS (follow where they fit, never invent facts): ${directions.slice(0, 400)}` : '',
    '\nCompose the page now.',
  ].join('\n')

  try {
    const res = await completeRaw({
      system: withVoice(SYSTEM),
      messages: [{ role: 'user', content: userText }],
      maxTokens: 2000,
      tools: [TOOL],
      toolChoice: { type: 'tool', name: 'compose_page' },
    })
    void recordAiUsage({ feature: FEATURE, model: res.model, usage: res.usage, costUsd: res.costUsd, profileId: opts.profileId ?? null })

    const call = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'compose_page')
    const raw = (call?.input as { sections?: unknown })?.sections
    if (!Array.isArray(raw)) return null
    return planToLayout(raw as ComposedSection[], profile, gallery)
  } catch {
    return null
  }
}
