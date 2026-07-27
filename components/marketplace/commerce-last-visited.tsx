'use client'

import { useEffect } from 'react'
import {
  COMMERCE_LAST_COOKIE,
  COMMERCE_LAST_MAX_AGE,
  type CommerceSurface,
} from '@/lib/marketplace/last-visited'

// Writes the Marketplace umbrella's last-visited cookie on mount (ADR-868). Mounted once
// in the Classifieds and Market layouts — the ONE shared component both surfaces use —
// so /marketplace can land the member back on whichever they browsed last. Renders
// nothing; a plain document.cookie write (the value is a whitelisted token, and the
// server side re-validates through parseCommerceSurface before redirecting).
export function CommerceLastVisited({ surface }: { surface: CommerceSurface }) {
  useEffect(() => {
    document.cookie = `${COMMERCE_LAST_COOKIE}=${surface}; path=/; max-age=${COMMERCE_LAST_MAX_AGE}; samesite=lax`
  }, [surface])
  return null
}
