import type { PresentationDefaults } from './index'

// Default role layouts for this theme (LIVE-1861). A block with no layout picked draws these; a layout the owner picked always wins.
export default {
  hero: 'full',
  gatherings: 'cards',
  steps: 'timeline',
  proof: 'quote',
  statement: 'pull',
  firstvisit: 'thread',
  booking: 'cards',
  locations: 'card',
  business: 'list',
  story: 'center',
  offerings: 'list',
  membership: 'spotlight',
  faq: 'stack',
  cta: 'center',
  letter: 'card',
  contact: 'center',
  stats: 'cards',
  shop: 'grid',
  library: 'grid',
  people: 'founder',
  gallery: 'carousel',
  chapters: 'grid',
} satisfies PresentationDefaults
