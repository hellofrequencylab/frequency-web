import type { ReactNode } from 'react'
import { SITE_DESIGN } from '@/lib/theme/design'
import { FqMarketSlide } from '@/components/frequency/members/marketplace/area-nav'

// Wraps the area body so it slides in beneath the unified header (LIVE-1037). DAWN renders as is.
export function MarketSlide({ children }: { children: ReactNode }) {
  return SITE_DESIGN === 'frequency' ? <FqMarketSlide>{children}</FqMarketSlide> : <>{children}</>
}
