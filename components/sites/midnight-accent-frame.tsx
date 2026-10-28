'use client'

// The wrapper of the Midnight demo site (LIVE-1382). It takes its accent from the feature page that frames it:
// the page posts { type: 'nocturne-accent', accent } and the five accent variables are recomputed here with the
// same midnightAccentVars the real sites use, so "Make it yours" shows the real contrast rules. Same origin
// only; anything that is not a six-digit hex is ignored.
import { useEffect, useState } from 'react'
import { midnightAccentVars } from '@/lib/theme/midnight'

export function MidnightAccentFrame({ children }: { children: React.ReactNode }) {
  const [accent, setAccent] = useState<string | null>(null)
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return
      const d = e.data as { type?: string; accent?: unknown } | null
      if (d?.type !== 'nocturne-accent') return
      setAccent(typeof d.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(d.accent) ? d.accent : null)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])
  return <div style={midnightAccentVars(accent) as React.CSSProperties}>{children}</div>
}
