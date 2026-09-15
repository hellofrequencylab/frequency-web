import type { ReactNode } from 'react'
import { CommerceLastVisited } from '@/components/marketplace/commerce-last-visited'

// Housing subtree layout: pass-through chrome-wise; its one job is to stamp the
// Marketplace umbrella's last-visited cookie (ADR-868) so /marketplace lands back here.
// Covers the index, /housing/roommates, and every listing under /housing/*.
//
// Housing is a pure commerce area — unlike Events it has no member-rail identity of its
// own — so a layout is the right altitude here, exactly as for Classifieds and Market
// (LIVE-243).
export default function HousingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <CommerceLastVisited surface="housing" />
      {children}
    </>
  )
}
