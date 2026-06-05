'use client'

import dynamic from 'next/dynamic'
import type { ScanLocation } from '@/lib/qr/analytics'

// Client wrapper so the maplibre map only loads in the browser (ssr:false).
const ScanMap = dynamic(() => import('./scan-map'), {
  ssr: false,
  loading: () => <div className="h-80 w-full animate-pulse rounded-2xl border border-border bg-surface-elevated" />,
})

export function ScanLocator({ locations }: { locations: ScanLocation[] }) {
  if (locations.length === 0) {
    return (
      <div className="flex h-80 items-center justify-center rounded-2xl border border-border bg-surface-elevated px-6 text-center text-sm text-muted">
        No located scans yet — points appear here as your codes get scanned out in the world (coarse,
        city-level; no precise location is collected).
      </div>
    )
  }
  return (
    <div className="h-80">
      <ScanMap locations={locations} />
    </div>
  )
}
