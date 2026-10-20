import type { ReactNode } from 'react'
import { MarketAreaPin } from '@/components/marketplace/market-area-pin'
import { CommerceLastVisited } from '@/components/marketplace/commerce-last-visited'

// Market subtree layout: pass-through chrome-wise; it stamps the
// Marketplace umbrella's last-visited cookie (ADR-868) so /marketplace lands back here, and pins
// the area nav (LIVE-1027).
// Covers the index AND every product/sell page under /market/*.
export default function MarketLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <CommerceLastVisited surface="market" />
      <MarketAreaPin />
      {children}
    </>
  )
}
