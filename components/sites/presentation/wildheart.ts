import type { PresentationDefaults } from './index'

// Default role layouts for this theme (LIVE-1861). A block with no layout picked draws these; a layout the owner picked always wins.
export default {
  hero: 'center',
  offerings: 'cards',
  steps: 'grid',
  proof: 'wall',
  membership: 'spotlight',
  gallery: 'carousel',
  firstvisit: 'grid',
  booking: 'cards',
  locations: 'card',
  business: 'grid',
  story: 'split',
  gatherings: 'cards',
  faq: 'grid',
  cta: 'split',
  statement: 'pull',
  letter: 'card',
  contact: 'center',
  stats: 'cards',
  shop: 'grid',
  library: 'grid',
  people: 'grid',
  chapters: 'grid',
} satisfies PresentationDefaults
