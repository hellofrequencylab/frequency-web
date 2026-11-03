import type { PresentationDefaults } from './index'

// Default role layouts for this theme (LIVE-1861). A block with no layout picked draws these; a layout the owner picked always wins.
export default {
  hero: 'full',
  gallery: 'mosaic',
  offerings: 'list',
  proof: 'quote',
  people: 'founder',
  steps: 'strip',
  statement: 'pull',
  firstvisit: 'thread',
  booking: 'board',
  locations: 'split',
  business: 'list',
  story: 'split',
  gatherings: 'rows',
  membership: 'table',
  faq: 'stack',
  cta: 'band',
  letter: 'inline',
  contact: 'split',
  stats: 'band',
  shop: 'rail',
  library: 'featured',
  chapters: 'timetable',
} satisfies PresentationDefaults
