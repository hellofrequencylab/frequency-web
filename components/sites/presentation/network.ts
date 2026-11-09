import type { PresentationDefaults } from './index'

// Default role layouts for this theme (LIVE-1861). A block with no layout picked draws these; a layout the owner picked always wins.
export default {
  hero: 'split',
  gatherings: 'cards',
  chapters: 'finder',
  membership: 'table',
  proof: 'wall',
  stats: 'cards',
  cta: 'split',
  firstvisit: 'grid',
  booking: 'cards',
  locations: 'split',
  business: 'grid',
  story: 'split',
  steps: 'grid',
  offerings: 'cards',
  faq: 'grid',
  statement: 'band',
  letter: 'inline',
  contact: 'split',
  shop: 'grid',
  library: 'grid',
  people: 'grid',
  gallery: 'grid',
} satisfies PresentationDefaults
