'use client'

// <SitePage/>: a page body's way to set its own state on the kit root (side, mood, energy, hues, quiet,
// header CTA) when it has no row in lib/frequency/site-pages.ts. It renders nothing. The table is the
// better home (it is in the first paint); this applies after hydration and clears on unmount.
//
//   <SitePage side="e" mood="stories" energy="flow" hues={['m', 's', 'v']} />

import { useEffect } from 'react'
import { useSite } from '@/components/frequency/site/shell/site-root'
import type { SitePageState } from '@/lib/frequency/site-pages'

export function SitePage(props: Partial<SitePageState>) {
  const { setOverride } = useSite()
  const key = JSON.stringify(props)
  useEffect(() => {
    setOverride(JSON.parse(key) as Partial<SitePageState>)
    return () => setOverride(null)
  }, [key, setOverride])
  return null
}
