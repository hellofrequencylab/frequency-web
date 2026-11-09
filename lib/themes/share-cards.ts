// THE THEME SHARE CARDS (LIVE-2114): one Stage share card per /themes page, drawn by
// scripts/render/theme-share-cards.render.tsx from lib/og/stage-card.tsx and committed as static files.
// The page's metadata reads `image`; the render script reads the rest. A leaf module: no imports, so the
// SEO entries can read it without pulling anything into the routes that use them.

interface ThemeShareCard {
  /** The theme's code id. */
  id: string
  /** The name on the card, as visitors see it. */
  name: string
  /** The one serif-italic line. */
  line: string
  /** The cover photo, a path under public/. */
  cover: string
  /** The committed card, a path under public/. */
  image: string
}

const card = (id: string, name: string, line: string, cover: string): ThemeShareCard => ({
  id,
  name,
  line,
  cover,
  image: `/brand/theme-share/${id}.jpg`,
})

export const THEME_SHARE_CARDS: readonly ThemeShareCard[] = [
  card('new-world', 'New World', 'Design it once. Same theme everywhere.', '/sites/new-world/photos/circle-sunrise.webp'),
  card('bold', 'Bold', 'Dark, graphic and direct. Say it loud.', '/brand/frequency/photos/gathering-12.jpg'),
  card('wildheart', 'Wildheart', 'Parchment, violet and a sky that turns with the year.', '/brand/wildheart/photos/sisters-shore.jpg'),
  card('network-kit', 'Network', 'Paper, ink and one solid color. Thirteen ways in.', '/sites/network-kit/photos/photo-01.jpg'),
  card('temple-kit', 'Temple', 'A lime-washed house. Warm and unhurried.', '/sites/temple-kit/photos/photo-01.jpg'),
  card('midnight', 'Nocturne', 'After dark. One violet light on true black.', '/sites/midnight/photos/nature-dunes.jpg'),
  card('designer', 'Designer', 'Limewash and daylight, with one ochre accent.', '/sites/designer/photos/dz-designer-kitchen-hero.webp'),
]

/** The share image for a theme's page, or undefined when it has none (the page keeps the root card). */
export function themeShareImage(id: string): string | undefined {
  return THEME_SHARE_CARDS.find((c) => c.id === id)?.image
}
