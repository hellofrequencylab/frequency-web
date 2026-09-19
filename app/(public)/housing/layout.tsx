import type { ReactNode } from 'react'
import { CommerceLastVisited } from '@/components/marketplace/commerce-last-visited'

export default function PublicHousingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <CommerceLastVisited surface="housing" />
      {children}
    </>
  )
}
