'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { UnderlineTabs } from '@/components/ui/underline-tabs'
import { MEMBERSHIP_VIEWS, type MembershipView } from '@/lib/spaces/offerings'

// THE MEMBERSHIPS VIEW BAR: Plans, Benefits, Circles, Event access, Members. Each is a real `?view=` link
// that keeps the other query keys (`tab=memberships`, `panel=`), and the server renders only the open view.

export function MembershipViews({ active, includeMembers }: { active: MembershipView; includeMembers: boolean }) {
  const pathname = usePathname()
  const search = useSearchParams()

  const hrefFor = (view: MembershipView) => {
    const next = new URLSearchParams(search?.toString() ?? '')
    next.set('view', view)
    return `${pathname}?${next.toString()}`
  }

  return (
    <UnderlineTabs
      label="Memberships"
      activeHref={hrefFor(active)}
      tabs={MEMBERSHIP_VIEWS.filter((v) => includeMembers || v.key !== 'members').map((v) => ({
        href: hrefFor(v.key),
        label: v.label,
      }))}
    />
  )
}
