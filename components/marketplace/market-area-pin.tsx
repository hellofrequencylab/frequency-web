import { SITE_DESIGN } from '@/lib/theme/design'
import { FqMarketAreas } from '@/components/frequency/members/marketplace/areas'

// The pinned area nav every commerce subtree layout mounts above its pages (LIVE-1027). Under the
// Frequency design it sticks under the app header so moving between Classifieds, Housing, Market,
// Store and paid Events swaps only the content beneath it. DAWN keeps its per-page facet row, so
// there this renders nothing.
export function MarketAreaPin() {
  return SITE_DESIGN === 'frequency' ? <FqMarketAreas /> : null
}
