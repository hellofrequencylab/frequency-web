'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import Link from 'next/link'
import { asWebRole, type CommunityRole, type WebRole } from '@/lib/core/roles'
import { UserMenu, AuthButtons, type UserMenuProfile } from './user-menu'
import { PrimaryNav } from './primary-nav'
import { viewerRoleFor } from './menu-role'
import type { MenuSettings, ResolvedMenu } from '@/lib/menus/types'
import { MarketingMobileMenu } from '@/components/layout/marketing-mobile-menu'

// CLIENT-HYDRATED HEADER CHROME.
//
// Reading auth during render is a dynamic API, and one anywhere in a layout opts the entire route
// out of static rendering. <SiteHeader>'s own `auth.getUser()` therefore force-dynamicked all 22
// public /discover pages and silently voided their `export const revalidate = 3600`: every visitor
// and every crawler paid two extra auth round trips plus the page's full query set on every hit.
// Suspense does not rescue this without cacheComponents, which the app does not enable.
//
// The split: the server renders the ANONYMOUS header shell, which is exactly the indexable view a
// crawler should get, and the four things that differ for a signed-in member are swapped in here
// after hydration from /api/viewer. A member briefly sees the logged-out chrome; nothing shifts
// layout, because each swap keeps the same box.
//
// Only mounted where the static win matters (the /discover tree). Everywhere else <SiteHeader>
// keeps reading auth during render, which is correct for routes that are dynamic regardless.

export interface Viewer {
  signedIn: boolean
  profile?: UserMenuProfile
  communityRole?: CommunityRole | null
  webRole?: WebRole | null
}

const ViewerContext = createContext<Viewer>({ signedIn: false })

/** Fetches the viewer once per mount and shares it with every swap below. */
export function ViewerProvider({ children }: { children: React.ReactNode }) {
  const [viewer, setViewer] = useState<Viewer>({ signedIn: false })

  useEffect(() => {
    let live = true
    // FAIL-SAFE: any error leaves the anonymous shell in place.
    fetch('/api/viewer', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((v: Viewer | null) => {
        if (live && v?.signedIn) setViewer(v)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  return <ViewerContext.Provider value={viewer}>{children}</ViewerContext.Provider>
}

export function useViewer(): Viewer {
  return useContext(ViewerContext)
}

/** A link whose target depends on whether the viewer is signed in (logo -> /feed, search -> /search).
 *  Renders the anonymous target on the server so the static HTML is the crawlable one. */
export function ViewerLink({
  anonHref,
  authHref,
  className,
  'aria-label': ariaLabel,
  children,
}: {
  anonHref: string
  authHref: string
  className?: string
  'aria-label'?: string
  children: React.ReactNode
}) {
  const { signedIn } = useViewer()
  return (
    <Link href={signedIn ? authHref : anonHref} className={className} aria-label={ariaLabel}>
      {children}
    </Link>
  )
}

/** The account cluster: Sign in / Join for a visitor, the profile menu for a member. */
export function ViewerAuthSlot({ dark, profileMenu }: { dark: boolean; profileMenu: ResolvedMenu }) {
  const { signedIn, profile } = useViewer()
  if (signedIn && profile) return <UserMenu profile={profile} menu={profileMenu} />
  return <AuthButtons dark={dark} />
}

/** The mega-menu, re-resolved for the viewer once known. The server renders it at the 'visitor'
 *  access token (the indexable view); a member's per-role item modes resolve after hydration.
 *  `viewerRoleFor` is deliberately framework-independent so the server layouts and this client
 *  path collapse the viewer's axes with the exact same rule. */
/** The phone sheet, viewer-aware. Mirrors ViewerPrimaryNav exactly: same hook, same
 *  viewerRoleFor collapse, so on a statically-rendered /discover page the sheet and the bar
 *  agree about who is looking once /api/viewer answers. Before that they agree too — both
 *  render the anonymous view, which is the HTML a crawler gets. */
export function ViewerMobileMenu({
  light,
  headerMenu,
}: {
  light: boolean
  headerMenu: ResolvedMenu
}) {
  const { signedIn, communityRole, webRole } = useViewer()
  const viewerRole = viewerRoleFor({ loggedIn: signedIn, communityRole, webRole: asWebRole(webRole) })
  return (
    <MarketingMobileMenu light={light} headerMenu={headerMenu} viewer={{ viewerRole }} isAuth={signedIn} />
  )
}

export function ViewerPrimaryNav({
  variant,
  className,
  headerMenu,
  timings,
}: {
  variant: 'light' | 'dark'
  className?: string
  headerMenu: ResolvedMenu
  timings?: MenuSettings
}) {
  const { signedIn, communityRole, webRole } = useViewer()
  const viewerRole = viewerRoleFor({ loggedIn: signedIn, communityRole, webRole: asWebRole(webRole) })
  return (
    <PrimaryNav
      variant={variant}
      className={className}
      headerMenu={headerMenu}
      viewerRole={viewerRole}
      timings={timings}
      isAuth={signedIn}
    />
  )
}
