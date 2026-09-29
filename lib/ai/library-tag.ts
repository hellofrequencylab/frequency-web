// VERA NAMES A LOOM IMAGE NOBODY NAMED (LIVE-587, ADR-1589; child 2 of PROG-D7, AI auto-tag).
//
// A Space upload lands with title = the filename stem, alt = null and tags = [] (uploadLoomImage),
// and the embedding behind "Most relevant" is built from title, description, category and tags
// (embedSource in lib/library/embeddings.ts). So an unnamed photo is findable as IMG_4021 and as
// nothing else. Vera can see, so this module asks her: one vision read of one image on the Haiku
// tier, forced through a tool so the answer has a shape, and re-validated here before anything is
// allowed near a row.
//
// WHAT SHE RETURNS (a proposal, never a write): up to eight lowercase tags, one plain sentence of alt
// text, and at most ONE category chosen from the categories that Space already uses. She never
// invents a folder. Writing is the store's job (fillLibraryAssetDescription), and it fills only
// what is still empty, so a person's own words are never replaced.
//
// The image goes as a base64 block (the scanCardImage shape in lib/ai/connections-ai.ts), fetched
// from the Loom's own public Storage URL only, and only a raster small enough for the API. A vector
// has nothing for a vision read that its own markup does not already say.
//
// FAIL-SAFE: AI off, over the feature cap, throttled, an unfetchable image or any model error returns
// `{ ok: false }`. The caller keeps the row exactly as it was.

import type Anthropic from '@anthropic-ai/sdk'
import { completeRaw } from './complete'
import { MODELS } from './models'
import { aiAvailable, featureOverBudget, recordAiUsage } from './usage'
import { aiRateLimited } from './rate-limit'
import { voiceLine, withVoice } from './voice'
import { isLoomPublicImageUrl, isVectorFile } from '@/lib/loom/urls'
import { VERA_TAG } from '@/lib/library/types'

/** The ledger key, the budget cap key (lib/ai/budget.ts) and the rate-limit key. */
export const LIBRARY_TAG_FEATURE = 'library-tag'

/** The most tags Vera may propose (the vera tag is added on top by the write). */
export const MAX_VERA_TAGS = 8

/** The raw-byte ceiling for one image. Base64 inflates by a third and the API takes 5 MB, so a
 *  file over this is skipped rather than sent and refused. */
export const MAX_TAG_IMAGE_BYTES = 3_750_000

const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
type ImageMediaType = (typeof MEDIA_TYPES)[number]

/** The raster types the vision read accepts, for the cron's candidate query. */
export const TAGGABLE_MIMES: readonly string[] = MEDIA_TYPES

/** What Vera proposes for one image, already validated. */
export type LibraryTagging = {
  alt: string | null
  tags: string[]
  category: string | null
}

export type DescribeImageResult =
  | { ok: true; tagging: LibraryTagging }
  /** `unavailable`: AI is off, the cap is spent or the actor is throttled, so a sweep should stop.
   *  `failed`: this one image could not be read, so a sweep moves on to the next. */
  | { ok: false; reason: 'unavailable' | 'failed' }

function asMediaType(mime: string | null | undefined): ImageMediaType | null {
  const m = (mime ?? '').split(';')[0]?.trim().toLowerCase() ?? ''
  const normal = m === 'image/jpg' ? 'image/jpeg' : m
  return (MEDIA_TYPES as readonly string[]).includes(normal) ? (normal as ImageMediaType) : null
}

/** Can this row be sent for a vision read at all? A Loom Storage URL, a raster type the API takes,
 *  and a size under the ceiling (an unknown size is allowed; the fetch re-checks). PURE. */
export function isTaggableImage(input: { url: string | null; mime: string | null; bytes?: number | null }): boolean {
  if (!input.url || !isLoomPublicImageUrl(input.url)) return false
  if (isVectorFile(input.mime, input.url)) return false
  if (!asMediaType(input.mime)) return false
  return !(typeof input.bytes === 'number' && input.bytes > MAX_TAG_IMAGE_BYTES)
}

/** One tag as the Loom stores them: lowercase, plain words, short. Null when nothing usable is left. */
function cleanTag(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const t = raw
    .toLowerCase()
    .replace(/[^a-z0-9 &'-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (t.length < 2 || t.length > 32) return null
  return t
}

/**
 * Validate what the model returned against the contract, the way the upload path validates a
 * client: nothing is trusted. Tags are cleaned, de-duplicated, capped at MAX_VERA_TAGS, and the
 * reserved vera tag is dropped (the write adds it). Alt goes through voiceLine (lib/ai/voice.ts: no
 * em dashes, no exclamation point) and is capped. A category survives only when it matches one the
 * Space already uses, and comes back in that Space's own spelling. PURE.
 */
export function coerceLibraryTagging(raw: unknown, categories: readonly string[]): LibraryTagging {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>

  const tags: string[] = []
  for (const t of Array.isArray(r.tags) ? r.tags : []) {
    const c = cleanTag(t)
    if (!c || c === VERA_TAG || tags.includes(c)) continue
    tags.push(c)
    if (tags.length >= MAX_VERA_TAGS) break
  }

  const altRaw = typeof r.alt === 'string' ? voiceLine(r.alt) : ''
  const alt = altRaw ? altRaw.slice(0, 240) : null

  const want = typeof r.category === 'string' ? r.category.trim().toLowerCase() : ''
  const category = want ? (categories.find((c) => c.trim().toLowerCase() === want) ?? null) : null

  return { alt, tags, category }
}

const TOOL_NAME = 'name_image'

const TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description: 'Save the tags, alt text and category for this library image.',
  input_schema: {
    type: 'object',
    properties: {
      alt: {
        type: 'string',
        description: 'One plain sentence saying what is visibly in the image, for someone who cannot see it.',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: `Up to ${MAX_VERA_TAGS} short lowercase tags a person would search for to find this image.`,
      },
      category: {
        type: 'string',
        description: 'Exactly one of the listed categories, or an empty string when none fits.',
      },
    },
    required: ['alt', 'tags'],
  },
}

const SYSTEM = `You are Vera, looking at one image in a community's shared image library (the Loom). Nobody has named it yet, so nobody can find it. Name it so they can, and call the ${TOOL_NAME} tool.
- alt: one plain sentence saying what is visibly there, for someone who cannot see it. Describe only what you can see. Never guess a person's name, a place name, a brand or an event you cannot read in the image.
- tags: up to ${MAX_VERA_TAGS} short lowercase words or two-word phrases a person would type to find this picture (the subject, the setting, the mood, the main colours). No hashtags, no duplicates.
- category: pick exactly one category from the list you are given when one clearly fits. When none fits, or no list is given, leave it empty. Never make up a new one.`

/** Fetch the image from the Loom's own Storage and base64 it, or null when it cannot be sent. */
async function loadImage(url: string, mime: ImageMediaType): Promise<{ data: string; mediaType: ImageMediaType } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) return null
    const declared = Number(res.headers.get('content-length') ?? '')
    if (Number.isFinite(declared) && declared > MAX_TAG_IMAGE_BYTES) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.byteLength === 0 || buf.byteLength > MAX_TAG_IMAGE_BYTES) return null
    return { data: buf.toString('base64'), mediaType: asMediaType(res.headers.get('content-type')) ?? mime }
  } catch {
    return null
  }
}

/**
 * Ask Vera to name one Loom image. Returns her validated proposal; writes nothing.
 *
 * @param url        the asset's public Loom Storage URL
 * @param mime       the asset's stored mime (a raster type the API takes)
 * @param opts.categories the categories the asset's Space already uses (the only ones she may pick)
 * @param opts.actorId    the person asking, for the per-actor throttle; null for the cron sweep
 */
export async function describeLibraryImage(
  url: string,
  mime: string | null,
  opts: { categories?: readonly string[]; actorId?: string | null } = {},
): Promise<DescribeImageResult> {
  const mediaType = asMediaType(mime)
  if (!mediaType || !isTaggableImage({ url, mime })) return { ok: false, reason: 'failed' }

  if (!(await aiAvailable())) return { ok: false, reason: 'unavailable' }
  if (await featureOverBudget(LIBRARY_TAG_FEATURE)) return { ok: false, reason: 'unavailable' }
  if (await aiRateLimited(LIBRARY_TAG_FEATURE, opts.actorId)) return { ok: false, reason: 'unavailable' }

  const image = await loadImage(url, mediaType)
  if (!image) return { ok: false, reason: 'failed' }

  const categories = (opts.categories ?? []).filter((c) => typeof c === 'string' && c.trim()).slice(0, 40)
  const list = categories.length
    ? `Categories this library already uses: ${categories.join(', ')}.`
    : 'This library has no categories yet, so leave category empty.'

  try {
    const res = await completeRaw({
      tier: 'haiku',
      maxTokens: 400,
      thinking: { type: 'disabled' },
      system: withVoice(SYSTEM),
      tools: [TOOL],
      toolChoice: { type: 'tool', name: TOOL_NAME },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } },
            { type: 'text', text: `${list} Name this image.` },
          ],
        },
      ],
    })
    void recordAiUsage({
      feature: LIBRARY_TAG_FEATURE,
      model: MODELS.haiku,
      usage: res.usage,
      costUsd: res.costUsd,
      profileId: opts.actorId ?? null,
    })
    const call = res.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === TOOL_NAME,
    )
    if (!call) return { ok: false, reason: 'failed' }
    const tagging = coerceLibraryTagging(call.input, categories)
    if (!tagging.alt && tagging.tags.length === 0) return { ok: false, reason: 'failed' }
    return { ok: true, tagging }
  } catch {
    return { ok: false, reason: 'failed' }
  }
}
