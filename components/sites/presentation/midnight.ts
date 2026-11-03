import type { PresentationDefaults } from './index'

// Default role layouts for this theme (LIVE-1861). A block with no layout picked draws these; a layout the owner picked always wins.
export default {
  hero: 'full',
  proof: 'quote',
  gatherings: 'rows',
  offerings: 'list',
  steps: 'timeline',
  statement: 'pull',
  cta: 'band',
  faq: 'stack',
  gallery: 'mosaic',
  firstvisit: 'thread',
  booking: 'board',
  locations: 'card',
  business: 'list',
  story: 'center',
  membership: 'spotlight',
  letter: 'inline',
  contact: 'card',
  stats: 'band',
  shop: 'list',
  library: 'featured',
  people: 'founder',
  chapters: 'list',
} satisfies PresentationDefaults
