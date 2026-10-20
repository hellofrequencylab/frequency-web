'use client'

import { useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { UnderlineTabs } from '@/components/ui/underline-tabs'
import { OFFERING_TABS, offeringTabForAnchor, type OfferingTab } from '@/lib/spaces/offerings'

// THE OFFERINGS TAB BAR. Each tab is a real `?tab=` link, so a tab is shareable and the server renders only
// the open one. It keeps every other query key (the inline workspace lives at `?panel=offerings`), and it
// forwards an old `#availability` / `#memberships` / `#checkin` link to the matching tab on arrival, since a
// hash never reaches the server and a lot of the app still links that way.

export function OfferingsTabs({ active }: { active: OfferingTab }) {
  const pathname = usePathname()
  const router = useRouter()
  const search = useSearchParams()

  const hrefFor = (tab: OfferingTab) => {
    const next = new URLSearchParams(search.toString())
    next.set('tab', tab)
    return `${pathname}?${next.toString()}`
  }

  useEffect(() => {
    const wanted = offeringTabForAnchor(window.location.hash)
    if (wanted && wanted !== active && !search.get('tab')) router.replace(hrefFor(wanted), { scroll: false })
    // Only on arrival: the hash is read once, then the URL carries the tab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <UnderlineTabs
      label="Offerings and money"
      activeHref={hrefFor(active)}
      tabs={OFFERING_TABS.map((t) => ({ href: hrefFor(t.key), label: t.label }))}
    />
  )
}
