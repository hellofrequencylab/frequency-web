import type { PresentationDefaults } from './index'

// Default role layouts for this theme (LIVE-1861). A block with no layout picked draws these; a layout the owner picked always wins.
export default {
  hero: 'center',
  stats: 'band',
  cta: 'band',
  offerings: 'cards',
  statement: 'band',
  proof: 'stats',
} satisfies PresentationDefaults
