import type { ReactNode } from 'react'
import { MarketAreaPin } from '@/components/marketplace/market-area-pin'

// The Marketplace route group's shared layout (LIVE-1027). Market, Store, and (as each moves in)
// Classifieds and Housing sit under ONE layout, so the pinned area nav is a single mounted
// instance: navigating between areas swaps only {children} beneath it, with no re-mount and no
// reload. The group adds no URL segment. Each area keeps its own layout for the last-visited
// cookie (ADR-868).
export default function MarketplaceGroupLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <MarketAreaPin />
      {children}
    </>
  )
}
