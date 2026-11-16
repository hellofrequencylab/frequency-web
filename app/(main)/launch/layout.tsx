import type { Metadata } from 'next'
import { Suspense, type ReactNode } from 'react'
import { LaunchLightbox } from '@/components/launch/launch-lightbox'

// Signed-in setup screens, never search results (SCAN-1211): the whole /launch tree is noindex.
export const metadata: Metadata = { robots: { index: false, follow: false } }

// Every launch page opens as the full-screen lightbox (LIVE-1913, components/launch/launch-lightbox.tsx). The
// suspense boundary is the one useSearchParams needs; the page itself stays a Server Component.
export default function LaunchLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <LaunchLightbox>{children}</LaunchLightbox>
    </Suspense>
  )
}
