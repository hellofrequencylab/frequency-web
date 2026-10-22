'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { UnderlineTabs } from '@/components/ui/underline-tabs'
import { CHECKIN_VIEWS, type CheckinView } from '@/lib/spaces/offerings'

// THE CHECK IN VIEW BAR (LIVE-1297): Check in (the door, who checked in, Regulars, counter scanners) and
// Cards. Each is a real `?view=` link that keeps the other query keys (`tab=checkin`, `panel=`), and
// the server renders only the open view. Same shape as the Memberships view bar.

export function CheckinViews({ active }: { active: CheckinView }) {
  const pathname = usePathname()
  const search = useSearchParams()

  const hrefFor = (view: CheckinView) => {
    const next = new URLSearchParams(search?.toString() ?? '')
    next.set('view', view)
    return `${pathname}?${next.toString()}`
  }

  return (
    <UnderlineTabs
      label="Check in"
      activeHref={hrefFor(active)}
      tabs={CHECKIN_VIEWS.map((v) => ({ href: hrefFor(v.key), label: v.label }))}
    />
  )
}
