import type { ReactNode } from 'react'
import { CommerceLastVisited } from '@/components/marketplace/commerce-last-visited'

// Client cookie write only (ADR-868). Does not call cookies() during render.

export default function PublicHousingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <CommerceLastVisited surface="housing" />
      {children}
    </>
  )
}
