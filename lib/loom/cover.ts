// ─────────────────────────────────────────────────────────────────────────────
// THE GENERATED COVER — who may be offered one, and what it should look like (ADR-993).
//
// Recraft (lib/loom/recraft.ts, ADR-488) has drawn images since the Loom Studio shipped, for
// operators only. This module is the rule that lets EVERY creation flow offer the same thing:
// an author who reaches the review step with no cover image can be offered one.
//
// IT IS AN OFFER, NEVER A DEFAULT. Nothing here generates anything; it answers "should a button
// be shown, and what would it draw?". Finishing with no image at all stays a first-class outcome,
// because plenty of good things do not want a picture, and an image nobody asked for is worse
// than a blank space.
//
// WHO IS ELIGIBLE, derived from the manifest rather than a second list (docs/STUDIO.md, ADR-597):
// the first `image` / `images` field the entity declares, SKIPPING any field marked
// `veraDrafts: false`. That flag already means "only a human or a source may fill this", which is
// exactly right for a product photo, a Space logo, or a listing's photos: those must show the real
// thing. A Journey cover, a Practice header, and an Event poster carry no such claim, so they are
// the three that qualify today. Add an entity with a coverable image field and it qualifies with
// no change here.
//
// PURE: no IO, no AI, no React. The generation itself lives in cover-actions.ts.
//
// Voice canon (docs/CONTENT-VOICE.md): member-facing copy stays plain, no em dashes.
// ─────────────────────────────────────────────────────────────────────────────

import type { EntityManifest, FieldDef } from '@/lib/studio/kernel/manifest'
import { moodImageStyle } from '@/lib/importer/moods'

/** The kinds a cover can fill. A single `image` is the cover slot; `images` is only reached by an
 *  entity that declares no single one. */
const COVER_KINDS: readonly string[] = ['image', 'images']

/** The Recraft size for a cover: 4:3 landscape, which is the shape every card and hero crops from. */
export const COVER_SIZE = '1365x1024'

/** The Recraft lane. Raster, not vector: a cover is a picture, and the vector lane costs double. */
export const COVER_LANE = 'raster' as const

/** The tags every generated cover carries into the Loom, so it is findable AND self-labelling
 *  (lib/library/store.ts derives "AI generated" from the 'generated' tag). */
export const COVER_TAGS: readonly string[] = ['recraft', 'generated', 'cover']

/**
 * The image field a generated cover would fill, or null when the entity has none it may fill.
 * Declaration order decides, so an entity with both a cover and a gallery gets the cover. PURE.
 */
export function coverFieldFor(manifest: EntityManifest): FieldDef | null {
  return (
    manifest.fields.find((f) => COVER_KINDS.includes(f.kind) && f.veraDrafts !== false) ?? null
  )
}

/** Whether a draft value counts as "already has an image". An empty array counts as none. PURE. */
function hasImage(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((v) => typeof v === 'string' && v.trim().length > 0)
  return typeof value === 'string' ? value.trim().length > 0 : !!value
}

/** Walk a dotted path off a record. PURE + total. */
function at(scope: Record<string, unknown>, path: string): unknown {
  let cur: unknown = scope
  for (const part of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur
}

/** The offer to show on a review step, or null when there is nothing to offer. */
export interface CoverOffer {
  /** The draft field path a generated cover would fill. */
  path: string
  /** The field's own label, so the copy reads "Cover image" / "Header image" and not a guess. */
  label: string
  /** True when the field holds a LIST, so the caller appends rather than replaces. */
  multiple: boolean
}

/**
 * Should this entity be offered a generated cover for this draft? Null when the entity declares no
 * fillable image field, or when the author already supplied one. PURE, and the same predicate the
 * server re-checks before it spends anything, so the button can never promise what the action refuses.
 */
export function coverOffer(
  manifest: EntityManifest,
  draft: Record<string, unknown>,
): CoverOffer | null {
  const field = coverFieldFor(manifest)
  if (!field) return null
  if (hasImage(at(draft, field.path))) return null
  return { path: field.path, label: field.label, multiple: field.kind === 'images' }
}

/** What the author tells the model, beyond the draft itself. */
export interface CoverPromptInput {
  /** The entity's own name ("Journey", "Event"), so the image reads as that kind of thing. */
  entityLabel: string
  /** The draft's title. The one field a cover really needs. */
  title: string
  /** The draft's summary or promise, when it has one. */
  summary?: string | null
  /** The mood dial (lib/studio/kernel/moods.ts), which sets the visual style. */
  mood?: unknown
  /** The author's own plain directions, if they gave any. */
  directions?: string | null
}

/**
 * Build the Recraft prompt for a cover. PURE + total.
 *
 * Three rules are baked in and not negotiable per call:
 *  - NO TEXT. Diffusion models render lettering as garbage, and a cover with fake words on it is
 *    the single fastest way to look cheap. The title is set in real type over the image anyway.
 *  - NO PEOPLE'S FACES. A generated face reads as a real person who was never there.
 *  - AN ILLUSTRATION, not a photo. A generated "photo" is a claim about something that happened.
 *    An illustration is honest about being drawn, which is the whole point of labelling it.
 */
export function buildCoverPrompt(input: CoverPromptInput): string {
  const title = (input.title ?? '').trim().slice(0, 120)
  const summary = (input.summary ?? '').trim().slice(0, 240)
  const directions = (input.directions ?? '').trim().slice(0, 200)

  return [
    `A cover illustration for a ${input.entityLabel.toLowerCase()} called "${title}".`,
    summary ? `It is about: ${summary}` : '',
    directions ? `The author asks for: ${directions}` : '',
    `Style: ${moodImageStyle(input.mood)}. Flat editorial illustration, simple composition, one clear subject, generous empty space in the upper third.`,
    `No text, no words, no letters, no numbers, no logos, no watermarks. No human faces. Not a photograph.`,
  ]
    .filter(Boolean)
    .join(' ')
    .slice(0, 1000)
}

/** The Loom title a generated cover is filed under. Says what it is, in plain words, so the
 *  asset is self-describing in a grid six months later. */
export function coverAssetTitle(entityLabel: string, title: string): string {
  const clean = (title ?? '').trim().slice(0, 80) || 'Untitled'
  return `${clean} (${entityLabel.toLowerCase()} cover, made by Vera)`.slice(0, 120)
}
