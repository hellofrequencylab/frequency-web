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
import type { EntityLayout, RowDef } from '@/lib/entity-blocks/layout'
import type { BusinessProfile } from './schema'

const FEATURE = 'seed-compose'

/** The blocks the composer may place, with best-practice WHEN-TO-USE guidance. The model chooses from
 *  THIS allowlist only (a returned id not here is dropped), so the composition can never invent a block. */
const COMPOSER_BLOCKS: { id: string; use: string }[] = [
  { id: 'photoHero', use: 'A bold in-page BANNER: eyebrow + big headline + a short subtitle over a background photo. A strong section opener; use once near the top.' },
  { id: 'editorial', use: 'A heading over a paragraph or two. Best for the About / what-this-is section.' },
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
const AUTHORED_BLOCKS = new Set(['photoHero', 'editorial', 'features', 'cardGrid', 'zigzag', 'accentBeat', 'prose'])

/** One section the composer returns. The block id is validated against the allowlist; `imageIndex` is an
 *  index into the SELECTABLE photos (the non-cover gallery), resolved to a URL server-side. */
export interface ComposedSection {
  block: string
  eyebrow?: string
  title?: string
  subtitle?: string
  body?: string
  buttonLabel?: string
  cards?: { title?: string; text?: string }[]
  imageIndex?: number
}

const MAX_SECTIONS = 14
const clamp = (v: unknown, max: number): string => stripEmDashes(String(v ?? '')).trim().slice(0, max)

/**
 * PURE: turn the composer's ordered sections into an EntityLayout (rows + per-block content bags). Only
 * KNOWN blocks are kept, each block id at most once (the content map is keyed by id), and only when it
 * carries the content it needs to render (a cardGrid needs cards, a zigzag/editorial/prose needs body,
 * an authored block that is empty is dropped). Photos resolve by index into `galleryImages`; the gallery
 * block gets them all. Never throws.
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

  const order: string[] = []
  const content: Record<string, Record<string, unknown>> = {}
  const placed = new Set<string>()

  for (const s of (sections ?? []).slice(0, MAX_SECTIONS)) {
    const id = typeof s?.block === 'string' ? s.block : ''
    if (!COMPOSER_BLOCK_IDS.has(id) || placed.has(id)) continue

    if (AUTHORED_BLOCKS.has(id)) {
      const bag = authoredBag(id, s, { name, imageAt })
      if (!bag) continue // an authored block with no usable content is skipped
      content[id] = bag
    } else {
      // A DATA block: place it (renders live data); carry an optional eyebrow/title override.
      const header: Record<string, unknown> = {}
      const eyebrow = clamp(s.eyebrow, 60)
      const title = clamp(s.title, 80)
      if (eyebrow) header.eyebrow = eyebrow
      if (title) header.title = title
      if (Object.keys(header).length) content[id] = header
    }
    placed.add(id)
    order.push(id)
  }

  if (order.length < 2) return null // too thin to be worth overriding the deterministic layout

  const rows: RowDef[] = order.map((id, i) => ({ id: `r${i}`, columns: 1, cells: [[id]] }))
  const layout: EntityLayout = { rows }
  if (Object.keys(content).length) layout.content = content
  return layout
}

/** Build the content bag for one AUTHORED design block, or null when it lacks its required copy. PURE. */
function authoredBag(
  id: string,
  s: ComposedSection,
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
  description: 'Return the ordered marketing-page sections for this business.',
  input_schema: {
    type: 'object',
    properties: {
      sections: {
        type: 'array',
        description: 'The page, top to bottom. Use each block at most once. 6 to 10 sections is ideal.',
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
            imageIndex: { type: 'integer', description: 'Which photo (0-based) for a banner/zigzag, or omit.' },
          },
          required: ['block'],
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

const SYSTEM = `You are a top-level web designer building a business's marketing home page from real, verified content.
You are given the business brief, the available page BLOCKS (with when-to-use notes), and how many PHOTOS are available.
Design the best-practice page: choose the blocks that fit THIS business, order them top to bottom, and write the copy.
Rules, follow exactly:
- Choose from the given blocks only. Use each block AT MOST ONCE. Aim for 6 to 10 sections.
- Lead with the business + core info (a banner, what it is, what it offers, how to reach it) before the softer story.
- Write copy ONLY from the brief. NEVER invent a fact, a price, a statistic, or a health/medical claim. Plain sentences, no hype, no jargon, no emoji, no em dashes.
- For a features/cardGrid, write a short title + one plain line per item. For a banner/zigzag, you may reference a photo by its 0-based index (omit if none fits).
- Prefer the design blocks (Banner, Card grid, Zigzag, Accent beat, Features, Text Block) to make it feel like a real marketing page, intermixed with the data blocks (Contact, Booking, FAQ) that fit.
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
