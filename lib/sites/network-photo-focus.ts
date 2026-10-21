// WHERE A PHOTO CENTRES WHEN A NETWORK BLOCK CROPS IT. A card, a split panel and a hero all cut the same photo to
// a different shape, and the browser's default is the middle, which slices faces out of a group shot taken
// standing up. The owner's own focus point (a block's "Photo focus point" field) always wins; otherwise a photo
// The Group ships carries the point where its faces sit, and any other photo leans toward the upper third, where
// a face usually is. Values are "x% y%", the shape CSS object-position takes.

const SHIPPED: Record<string, string> = {
  'core-team': '50% 38%',
  'courtyard-group': '50% 42%',
  'founder-june-an': '55% 6%',
  'hall-selfie': '50% 55%',
  'hero-group': '50% 55%',
  'hero-market': '50% 45%',
  'june-harvest': '62% 36%',
  'june-hug': '55% 22%',
  'patio-coffee': '70% 35%',
  'rooftop-gathering': '50% 48%',
  'team-carol': '50% 28%',
  'team-june': '50% 28%',
  'team-lisel': '50% 28%',
}

const POINT = /^\d{1,3}(?:\.\d+)?% \d{1,3}(?:\.\d+)?%$/

/** The object-position for a photo: the block's own point, else the shipped photo's, else undefined (the
 *  stylesheet's upper-third default applies). */
export function photoFocus(src: string | null | undefined, own?: string | null): string | undefined {
  const mine = own?.trim()
  if (mine && POINT.test(mine)) return mine
  const name = /([^/?#]+?)(?:\.[a-z0-9]+)?(?:[?#].*)?$/i.exec(src ?? '')?.[1]
  return name ? SHIPPED[name] : undefined
}
