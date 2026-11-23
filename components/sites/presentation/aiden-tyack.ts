import type { PresentationDefaults } from './index'

// Default role layouts for Aiden Tyack (LIVE-2514, LIVE-2517), from the handoff's theme.manifest.json: each section's default version,
// drawn in the nearest shared layout and dressed by the skin (components/sites/aiden-tyack-css.ts). forest hero = split on the band (the
// skin lays the redwood silhouette behind it), quote statement = pull, numbered steps = grid, maker = founder, quotes = wall, stitched
// FAQ = split (heading beside the questions), band gallery = carousel (the skin sets it edge to edge). A layout the owner picked wins.
export default {
  hero: 'split',
  statement: 'pull',
  steps: 'grid',
  stats: 'row',
  offerings: 'cards',
  membership: 'tiers',
  gatherings: 'rows',
  people: 'founder',
  proof: 'wall',
  gallery: 'carousel',
  library: 'grid',
  shop: 'grid',
  faq: 'split',
  letter: 'band',
  contact: 'split',
  cta: 'band',
  chapters: 'grid',
} satisfies PresentationDefaults
