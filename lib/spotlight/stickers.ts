// Spotlight STICKERS — the closed allowlist behind the decorative layer (PROG-SPOT increment 2,
// ADR-1275). A member places a handful of these over their Spotlight page; the stored blob
// (meta.spotlight.stickers) carries only an id and two percentages per sticker, never a glyph, a
// URL, or markup. The renderer resolves each id HERE, so the set of things that can appear on a
// public page is exactly this list. Pure: no IO, no React, safe to import from a Server Component,
// a client module, or the validator alike.
//
// `requiredItem` is the seam for EARNED stickers and is unused today: every sticker here is free.
// It mirrors `ProfileSkin.requiredItem` (lib/theme/profile-skins.ts) so the cosmetics lane can gate
// both with one inventory read when it lands. Until then the validator treats the field as absent.

export interface SpotlightStickerDef {
  /** The stable id stored in meta. Never renamed; retiring a sticker drops it from placed layers. */
  id: string
  /** The glyph the renderer draws. Emoji only in this increment. */
  glyph: string
  /** The picker label, sentence case. */
  label: string
  /** Reserved for the cosmetics lane: the inventory item that unlocks this sticker. Unset = free. */
  requiredItem?: string
}

/** The allowlist, in picker order. Adding a sticker is one row here. */
export const SPOTLIGHT_STICKERS: readonly SpotlightStickerDef[] = [ // menu-ok: the Spotlight sticker allowlist (emoji glyphs a member places on their page), not a navigation surface
  { id: 'star', glyph: '⭐', label: 'Star' },
  { id: 'sparkles', glyph: '✨', label: 'Sparkles' },
  { id: 'heart', glyph: '❤️', label: 'Heart' },
  { id: 'fire', glyph: '🔥', label: 'Fire' },
  { id: 'rainbow', glyph: '🌈', label: 'Rainbow' },
  { id: 'sun', glyph: '☀️', label: 'Sun' },
  { id: 'moon', glyph: '🌙', label: 'Moon' },
  { id: 'flower', glyph: '🌸', label: 'Flower' },
  { id: 'leaf', glyph: '🌿', label: 'Leaf' },
  { id: 'wave', glyph: '🌊', label: 'Wave' },
  { id: 'mountain', glyph: '⛰️', label: 'Mountain' },
  { id: 'music', glyph: '🎵', label: 'Music' },
  { id: 'peace', glyph: '☮️', label: 'Peace' },
  { id: 'butterfly', glyph: '🦋', label: 'Butterfly' },
  { id: 'bolt', glyph: '⚡', label: 'Bolt' },
  { id: 'smile', glyph: '😊', label: 'Smile' },
]

const BY_ID = new Map(SPOTLIGHT_STICKERS.map((s) => [s.id, s]))

/** Resolve an id against the allowlist, or null for anything not in it. */
export function spotlightStickerById(id: unknown): SpotlightStickerDef | null {
  return typeof id === 'string' ? (BY_ID.get(id) ?? null) : null
}
