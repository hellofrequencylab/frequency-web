import type { ReactNode } from 'react'
import { CommerceLastVisited } from '@/components/marketplace/commerce-last-visited'

// Market subtree layout: pass-through chrome-wise; its one job is to stamp the
// Marketplace umbrella's last-visited cookie (ADR-868) so /marketplace lands back here.
// Covers the index AND every product/sell page under /market/*.
export default function MarketLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <CommerceLastVisited surface="market" />
      {children}
    </>
  )
}
