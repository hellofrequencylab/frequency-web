'use client'

import { ViewTransition, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'

// THE CONSOLE'S SLIDE. The page body of an admin or Space console moves the way the menu reads: a link that
// goes to a later menu entry slides the old page out to the left and the new one in from the right, an
// earlier entry the other way. It is the browser's View Transitions API through React's <ViewTransition>;
// a route change is already a transition, so there is no reload and nothing to wire per page. Only links
// that carry a direction (the menus, via slideTypes) animate; every other navigation, the browser's back
// button, a refresh, and a loading reveal swap in place as before. The pathname is the key, so a move
// between two pages under one layout (CRM, Marketing, Content) is an exit and an enter like any other.
// The chrome (sidebar, top bar, top menu) is held still by its own names in admin-shell.css. Reduced motion
// turns the slide off there, and a browser without the API just swaps.
export function ConsoleSlide({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  return (
    <ViewTransition
      key={pathname}
      enter={{ 'nav-forward': 'fq-slide-forward-in', 'nav-back': 'fq-slide-back-in', default: 'none' }}
      exit={{ 'nav-forward': 'fq-slide-forward-out', 'nav-back': 'fq-slide-back-out', default: 'none' }}
      default="none"
    >
      <div className="ad-slide">{children}</div>
    </ViewTransition>
  )
}
