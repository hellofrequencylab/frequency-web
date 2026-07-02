'use client'

import { usePathname } from 'next/navigation'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { spaceCrumbs } from '@/lib/spaces/owner-nav'

// THE ONE Space breadcrumb — rendered by the Space root layout so it shows on EVERY /spaces/<slug>
// route (the profile + every owner surface), replacing the per-page back links + the low-fidelity
// global auto-breadcrumb. It is a CLIENT component reading the live pathname (soft-nav safe, like the
// profile tab bar), given the resolved brandName + type-correct manageHref as props by the server
// layout. It builds the trail (lib/spaces/owner-nav.ts) and renders the shared <Breadcrumbs> visual;
// the full-width editor (/edit-page) yields an empty trail, so nothing renders there.
export function SpaceBreadcrumbs({
  slug,
  brandName,
  manageHref,
}: {
  slug: string
  brandName: string
  manageHref: string
}) {
  const pathname = usePathname()
  const trail = spaceCrumbs(pathname, slug, brandName, manageHref)
  if (trail.length < 2) return null
  return <Breadcrumbs trail={trail} />
}
