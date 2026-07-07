// ─────────────────────────────────────────────────────────────────────────────
// SMART BUSINESS IMPORTER — the IMAGE DESIGNER (Importer v2, point 2). Given the operator's uploaded
// seed images, a single VISION pass acts as a top-level designer: it looks at every image together,
// classifies each (logo / hero / interior / exterior / team / product / food / detail), writes alt text
// in the Frequency voice, and scores each image's fitness to be the PRIMARY hero. A PURE ranking step
// (rankSeedImages) then picks the hero and orders the rest, so the profile leads with the strongest
// image and the gallery reads intentionally.
//
// The model call is a thin shell; the ordering/selection logic is PURE + unit-tested (the model can't
// run in CI). FAIL-SAFE: AI off / over budget / any error returns null and the caller keeps the images
// in their uploaded order — the product never depends on the designer being up.
// ─────────────────────────────────────────────────────────────────────────────

import type Anthropic from '@anthropic-ai/sdk'
import { completeRaw } from '@/lib/ai/complete'
import { aiAvailable, featureOverBudget, recordAiUsage } from '@/lib/ai/usage'
import { withVoice } from '@/lib/ai/voice'
import { stripEmDashes } from '@/lib/ai/space-copilot'

const FEATURE = 'seed-image-plan'
const MAX_IMAGES = 12

export const IMAGE_CATEGORIES = [
  'logo',
  'hero',
  'exterior',
  'interior',
  'team',
  'product',
  'food',
  'detail',
  'other',
] as const
export type ImageCategory = (typeof IMAGE_CATEGORIES)[number]

/** How much each category is worth as the primary HERO image. A logo is never a hero; a wide
 *  exterior/interior/product shot leads best. Multiplied by the model's per-image heroScore. */
const HERO_WEIGHT: Record<ImageCategory, number> = {
  hero: 1,
  exterior: 0.9,
  interior: 0.82,
  product: 0.72,
  food: 0.72,
  detail: 0.5,
  team: 0.45,
  other: 0.35,
  logo: 0,
}

/** One image the designer classified. */
export interface SeedImagePlanItem {
  url: string
  category: ImageCategory
  /** Alt text in the Frequency voice (never invented facts; describes what is visibly there). */
  alt: string
  /** 0..1 fitness to be the primary hero (the model's read of composition + subject). */
  heroScore: number
}

/** The designer's output: the images best-first (hero leads), the chosen hero, and the per-image tags. */
export interface SeedImagePlan {
  order: string[]
  heroUrl: string | null
  items: SeedImagePlanItem[]
}

/** The blended hero value of one item: its category weight, lifted by the model's heroScore. PURE. */
function heroValue(item: SeedImagePlanItem): number {
  const w = HERO_WEIGHT[item.category] ?? 0.35
  const s = Math.min(1, Math.max(0, item.heroScore))
  return w * (0.55 + 0.45 * s)
}

/**
 * PURE: from the designer's per-image tags (in the ORIGINAL upload order), pick the hero and order the
 * set best-first. The hero is the highest hero-value non-logo image (null when only logos/zeros remain).
 * The order leads with the hero, then descends by hero-value, ties broken by original position (stable).
 */
export function rankSeedImages(items: SeedImagePlanItem[]): SeedImagePlan {
  const scored = items.map((it, i) => ({ it, i, v: heroValue(it) }))
  const heroCand = scored
    .filter((s) => s.it.category !== 'logo' && s.v > 0)
    .sort((a, b) => b.v - a.v || a.i - b.i)[0]
  const heroUrl = heroCand ? heroCand.it.url : null

  const order = [...scored]
    .sort((a, b) => {
      if (heroUrl) {
        if (a.it.url === heroUrl) return -1
        if (b.it.url === heroUrl) return 1
      }
      return b.v - a.v || a.i - b.i
    })
    .map((s) => s.it.url)

  return { order, heroUrl, items }
}

const SYSTEM = `You are a top-level brand designer arranging photos for a business's public profile page.
You are shown a numbered set of images for one business. For EACH image, decide:
- category: one of logo, hero, exterior, interior, team, product, food, detail, other.
  (hero = a striking wide shot that could headline the page; exterior/interior = the place; product/food = what they sell; team = people who work there; detail = a close texture/object; logo = a brand mark; other = none of these.)
- alt: a short, plain, honest description of what is visibly in the image (for accessibility + SEO). Describe only what you can see. Never invent a business name, a place, or a fact. No emoji, no quotes.
- heroScore: 0.0 to 1.0, how well this specific image would work as the single most important hero image at the top of the page (composition, clarity, subject, headroom for text).
Return one entry per image via the image_plan tool. Be decisive; a logo always scores 0 for hero.`

const TOOL: Anthropic.Tool = {
  name: 'image_plan',
  description: 'Return one classification entry per image, in image index order.',
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            index: { type: 'integer', description: 'The 0-based image index as labelled.' },
            category: { type: 'string', enum: IMAGE_CATEGORIES as unknown as string[] },
            alt: { type: 'string' },
            heroScore: { type: 'number' },
          },
          required: ['index', 'category', 'alt', 'heroScore'],
        },
      },
    },
    required: ['items'],
  },
}

function toCategory(v: unknown): ImageCategory {
  return typeof v === 'string' && (IMAGE_CATEGORIES as readonly string[]).includes(v) ? (v as ImageCategory) : 'other'
}

/**
 * Run the designer over `images` (public URLs) and return the plan, or null when AI is off / over
 * budget / errored (the caller then keeps the uploaded order). One vision call sees ALL images together
 * so it can compare and choose the hero. Bounded to the first {@link MAX_IMAGES} images.
 */
export async function planSeedImages(
  images: string[],
  businessName: string,
  profileId: string | null,
): Promise<SeedImagePlan | null> {
  const urls = images.filter((u) => typeof u === 'string' && u.length > 0).slice(0, MAX_IMAGES)
  if (urls.length === 0) return null
  if (!(await aiAvailable()) || (await featureOverBudget(FEATURE))) return null

  try {
    const content: Anthropic.ContentBlockParam[] = [
      { type: 'text', text: `Business: ${businessName || 'a local business'}. ${urls.length} images follow, in order.` },
    ]
    urls.forEach((url, i) => {
      content.push({ type: 'text', text: `Image ${i}:` })
      content.push({ type: 'image', source: { type: 'url', url } })
    })

    const res = await completeRaw({
      system: withVoice(SYSTEM),
      messages: [{ role: 'user', content }],
      maxTokens: 1024,
      tools: [TOOL],
      toolChoice: { type: 'tool', name: 'image_plan' },
    })
    void recordAiUsage({ feature: FEATURE, model: res.model, usage: res.usage, costUsd: res.costUsd, profileId })

    const call = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'image_plan')
    const raw = (call?.input as { items?: unknown })?.items
    if (!Array.isArray(raw)) return null

    // Map each returned entry back onto its URL by index; anything the model skipped defaults to 'other'.
    const byIndex = new Map<number, { category: ImageCategory; alt: string; heroScore: number }>()
    for (const entry of raw) {
      const e = entry as Record<string, unknown>
      const idx = typeof e.index === 'number' ? e.index : Number(e.index)
      if (!Number.isInteger(idx) || idx < 0 || idx >= urls.length) continue
      byIndex.set(idx, {
        category: toCategory(e.category),
        alt: stripEmDashes(String(e.alt ?? '')).trim().slice(0, 240),
        heroScore: Math.min(1, Math.max(0, Number(e.heroScore) || 0)),
      })
    }

    const items: SeedImagePlanItem[] = urls.map((url, i) => {
      const t = byIndex.get(i)
      return { url, category: t?.category ?? 'other', alt: t?.alt ?? '', heroScore: t?.heroScore ?? 0 }
    })
    return rankSeedImages(items)
  } catch {
    return null
  }
}
