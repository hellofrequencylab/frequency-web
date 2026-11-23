import type { PresentationDefaults } from './index'

// Default role layouts for Aiden Tyack (LIVE-2514), from the handoff's theme.manifest.json: each section's default version, drawn in
// the nearest shared layout. forest hero = full (the silhouette behind the words), quote statement = pull, numbered steps = grid,
// maker = founder, quotes = wall, stitched FAQ = stack, band gallery = carousel. A layout the owner picked always wins.
export default {
  hero: 'full',
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
  faq: 'stack',
  letter: 'band',
  contact: 'split',
  cta: 'band',
  chapters: 'grid',
} satisfies PresentationDefaults
