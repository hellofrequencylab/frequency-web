'use client'

import { useEffect, useState } from 'react'
import { shortShareLink } from '@/lib/share/short-link-actions'

/** The URL a share button copies, shows and encodes. It starts as the long URL so the first paint is
 *  never empty, then becomes the short `/s/<code>` once the server has made it (LIVE-1960). The long
 *  URL stays when the page cannot be shortened or the request fails. `enabled` should be true only
 *  while the share panel is open, so a page view alone never makes a link. */
export function useShortShareUrl(longUrl: string, sharePath: string, origin: string, enabled: boolean): string {
  const [short, setShort] = useState<{ path: string; url: string } | null>(null)
  useEffect(() => {
    if (!enabled || !origin) return
    let live = true
    shortShareLink(sharePath)
      .then((rel) => {
        if (live && rel) setShort({ path: sharePath, url: `${origin}${rel}` })
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [enabled, sharePath, origin])
  return short && short.path === sharePath ? short.url : longUrl
}
