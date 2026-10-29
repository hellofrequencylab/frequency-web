import { Suspense, type ReactNode } from 'react'
import { LaunchLightbox } from '@/components/launch/launch-lightbox'

// Every launch page opens as the full-screen lightbox (LIVE-1913, components/launch/launch-lightbox.tsx). The
// suspense boundary is the one useSearchParams needs; the page itself stays a Server Component.
export default function LaunchLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <LaunchLightbox>{children}</LaunchLightbox>
    </Suspense>
  )
}
