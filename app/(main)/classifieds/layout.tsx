import type { ReactNode } from 'react'
import { CommerceLastVisited } from '@/components/marketplace/commerce-last-visited'

// Classifieds subtree layout: pass-through chrome-wise; its one job is to stamp the
// Marketplace umbrella's last-visited cookie (ADR-868) so /marketplace lands back here.
// Covers the index AND every listing detail under /classifieds/*.
export default function ClassifiedsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <CommerceLastVisited surface="classifieds" />
      {children}
    </>
  )
}
