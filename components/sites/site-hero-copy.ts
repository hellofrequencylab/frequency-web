// THE WEBSITE HERO'S WORDS (owner ask 2026-10-06: "redo the hero with something that vibed"). PURE.
// When the owner has not written a hero line (Hero settings > Tagline) or a tagline, the house theme's
// hero (components/sites/house-home.tsx) opens with the start of the Space's own description.

/** The longest lede the hero shows before it stops at a sentence (or a word) boundary. */
export const SITE_HERO_LEDE_MAX = 220

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
