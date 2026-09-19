import type { ReactNode } from 'react'
import { CommerceLastVisited } from '@/components/marketplace/commerce-last-visited'

export default function PublicMarketLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <CommerceLastVisited surface="market" />
      {children}
    </>
  )
}
