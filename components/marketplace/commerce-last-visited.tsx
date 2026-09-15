'use client'

import { useEffect } from 'react'
import {
  COMMERCE_LAST_COOKIE,
  COMMERCE_LAST_MAX_AGE,
  type CommerceSurface,
} from '@/lib/marketplace/last-visited'

// Writes the Marketplace umbrella's last-visited cookie on mount (ADR-868). Mounted once in each
// of the four umbrella subtree layouts (Classifieds, Housing, Market, Events) — the ONE shared
// component every surface uses — so /marketplace can land the member back on whichever they
// browsed last. Housing and Events joined on 2026-09-15 (LIVE-243); before that they had no
// layout, so two of the four areas never taught the umbrella anything. Renders
// nothing; a plain document.cookie write (the value is a whitelisted token, and the
// server side re-validates through parseCommerceSurface before redirecting).
export function CommerceLastVisited({ surface }: { surface: CommerceSurface }) {
  useEffect(() => {
    document.cookie = `${COMMERCE_LAST_COOKIE}=${surface}; path=/; max-age=${COMMERCE_LAST_MAX_AGE}; samesite=lax`
  }, [surface])
  return null
}
