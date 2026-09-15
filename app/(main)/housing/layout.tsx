import type { ReactNode } from 'react'
import { CommerceLastVisited } from '@/components/marketplace/commerce-last-visited'

// Housing subtree layout: pass-through chrome-wise; its one job is to stamp the
// Marketplace umbrella's last-visited cookie (ADR-868) so /marketplace lands back here.
// Covers the index AND every listing, roommate and new-listing page under /housing/*.
export default function HousingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <CommerceLastVisited surface="housing" />
      {children}
    </>
  )
}
