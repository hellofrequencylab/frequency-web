'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

// After a client-side move on a Space website's host, the root's design follows the page: the site's own
// pages wear DAWN (its house theme's base) and /admin (the platform's site editor) wears the platform
// design (SCAN-891). The first paint is handled by SiteDesignReset's inline script.
export function SiteDesignFollow({ design }: { design: string }) {
  const pathname = usePathname() ?? ''
  useEffect(() => {
    // The browser's own path, not the router's: on a site host the proxy rewrites to /hosted/<host>/...,
    // and only the address the visitor sees says whether this is the admin.
    const admin = /^\/admin(\/|$)/.test(window.location.pathname)
    document.documentElement.setAttribute('data-design', admin ? design : 'dawn')
  }, [pathname, design])
  return null
}
