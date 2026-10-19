import type { ReactNode } from 'react'
import { MarketAreaPin } from '@/components/marketplace/market-area-pin'

// Store subtree layout: pins the Marketplace area nav (LIVE-1027). The Store has no last-visited
// surface of its own (ADR-868 lists four), so it stamps nothing.
export default function StoreLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <MarketAreaPin />
      {children}
    </>
  )
}
