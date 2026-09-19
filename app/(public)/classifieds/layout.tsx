import type { ReactNode } from 'react'
import { CommerceLastVisited } from '@/components/marketplace/commerce-last-visited'

export default function PublicClassifiedsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <CommerceLastVisited surface="classifieds" />
      {children}
    </>
  )
}
