import type { ReactNode } from 'react'
import { MarketAreaPin } from '@/components/marketplace/market-area-pin'
import { CommerceLastVisited } from '@/components/marketplace/commerce-last-visited'

// Classifieds subtree layout: pass-through chrome-wise; it stamps the
// Marketplace umbrella's last-visited cookie (ADR-868) so /marketplace lands back here, and pins
// the area nav (LIVE-1027).
// Covers the index AND every listing detail under /classifieds/*.
export default function ClassifiedsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <CommerceLastVisited surface="classifieds" />
      <MarketAreaPin />
      {children}
    </>
  )
}
