import type { PresentationDefaults } from './index'

// Default role layouts for this theme (LIVE-1861). A block with no layout picked draws these; a layout the owner picked always wins.
export default {
  hero: 'center',
  stats: 'band',
  cta: 'band',
  offerings: 'cards',
  statement: 'band',
  proof: 'stats',
  firstvisit: 'grid',
  booking: 'board',
  locations: 'split',
  business: 'grid',
  story: 'split',
  steps: 'strip',
  gatherings: 'rows',
  membership: 'table',
  faq: 'stack',
  letter: 'band',
  contact: 'card',
  shop: 'rail',
  library: 'list',
  people: 'list',
  gallery: 'mosaic',
  chapters: 'list',
} satisfies PresentationDefaults
