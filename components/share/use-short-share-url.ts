'use client'

import { useEffect, useState } from 'react'
import { shortShareLink } from '@/lib/share/short-link-actions'

/** The URL a share button copies, shows and encodes (LIVE-1960). It starts as the long URL so the first
 *  paint is never empty, then becomes the short `<origin>/s/<code>` once the server has made it. The long URL stays when the page cannot be
 *  shortened or the request fails. `enabled` should be true only while the share panel is open, so a page
 *  view alone never makes a link. `canShorten` says a short code exists. */
export function useShortShareUrl(
  longUrl: string,
  sharePath: string,
  origin: string,
  enabled: boolean,
): { url: string; canShorten: boolean; opens: number | null } {
  const [short, setShort] = useState<{ path: string; rel: string; opens: number | null } | null>(null)
  useEffect(() => {
    if (!enabled || !origin) return
    let live = true
    shortShareLink(sharePath)
      .then((res) => {
        if (live && res) setShort({ path: sharePath, rel: res.rel, opens: res.opens })
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [enabled, sharePath, origin])
  const hit = short && short.path === sharePath ? short : null
  if (!hit) return { url: longUrl, canShorten: false, opens: null }
  return { url: `${origin}${hit.rel}`, canShorten: true, opens: hit.opens }
}
