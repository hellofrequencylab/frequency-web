// THE WEBSITE HERO'S WORDS (owner ask 2026-10-06: "redo the hero with something that vibed"). PURE.
// The hero is built from what the Space already wrote, so every Space that publishes gets one without
// new fields: the tagline and town as the eyebrow, the name as the headline, and the opening of the
// Space's own description as the line under it.

/** The longest lede the hero shows before it stops at a sentence (or a word) boundary. */
export const SITE_HERO_LEDE_MAX = 220

/** "Emotional Alchemy · Encinitas": the tagline and the town, whichever exist, or null. */
export function siteHeroEyebrow(tagline: string | null | undefined, city: string | null | undefined): string | null {
  const parts = [tagline, city].map((p) => p?.trim()).filter((p): p is string => !!p)
  return parts.length > 0 ? parts.join(' · ') : null
}

/** The opening of the Space's description: whole sentences up to SITE_HERO_LEDE_MAX characters, else the
 *  first sentence cut at a word with an ellipsis. Null when there is no description. */
export function siteHeroLede(about: string | null | undefined): string | null {
  const text = about?.replace(/\s+/g, ' ').trim()
  if (!text) return null
  if (text.length <= SITE_HERO_LEDE_MAX) return text
  const sentences = text.match(/[^.!?]+[.!?]+(?:\s|$)/g) ?? []
  let out = ''
  for (const s of sentences) {
    if ((out + s).trim().length > SITE_HERO_LEDE_MAX) break
    out += s
  }
  if (out.trim()) return out.trim()
  const cut = text.slice(0, SITE_HERO_LEDE_MAX)
  return `${cut.slice(0, cut.lastIndexOf(' ') > 0 ? cut.lastIndexOf(' ') : cut.length).replace(/[,;:]$/, '')}…`
}
