'use client'

import { useEffect, useMemo, useState } from 'react'
import { skinFamiliesIn, skinFamilyOf, type SkinFamily } from '@/lib/sites/skin-family'

// TRY IT ON (docs/THEME-COHESION.md section 4, ADR-1923, LIVE-1863). Wearing another theme over the Space's own pages is
// a client swap, never a server render: the canvas takes the candidate theme as one React commit, so its tokens, its
// sheet and its `data-website-theme` attribute change together and no frame is drawn half-styled. What can arrive
// late is the contract skin, the sheet that dresses a legacy theme-named block in the host's colors and faces. It lives
// in a heavy module, so it is loaded on demand, warmed when the pointer reaches a card, and the swap waits for it (see
// `useTryItOnSkin`). Nothing here touches the server, a cookie client or a member page: a site theme never reaches one.

type SkinModule = typeof import('./contract-skin-css')
let skinModule: Promise<SkinModule> | null = null

/** Start loading the contract skin. Called on hover and focus of a theme card; safe to call again. */
export function prefetchTheme(): Promise<SkinModule> {
  return (skinModule ??= import('./contract-skin-css'))
}

/** Count the blocks in these pages that belong to a different theme-named family than `themeId`. Those render their
 *  own shapes through the contract skin on `themeId`, so the owner is told before they keep the look. */
export function legacyBlocksOn(docs: readonly unknown[], themeId: string): { count: number; families: SkinFamily[] } {
  let count = 0
  const found = new Set<SkinFamily>()
  for (const doc of docs) {
    for (const m of JSON.stringify(doc ?? null).matchAll(/"type":"([A-Z][A-Za-z]+)"/g)) {
      const family = skinFamilyOf(m[1])
      if (family && family !== themeId) { count += 1; found.add(family) }
    }
  }
  return { count, families: [...found] }
}

/** The contract skin sheet for the legacy families a trial carries. `undefined`: no trial. `null`: still loading, so
 *  the caller keeps the current look on screen rather than drawing the new one bare. `''`: nothing to dress. */
export function useTryItOnSkin(docs: readonly unknown[], themeId: string | null): string | null | undefined {
  const families = useMemo(() => {
    if (!themeId) return []
    const all = new Set<SkinFamily>()
    for (const doc of docs) for (const f of skinFamiliesIn(doc)) if (f !== themeId) all.add(f)
    return [...all]
  }, [docs, themeId])
  const key = `${themeId ?? ''}|${families.join(',')}`
  const [done, setDone] = useState<{ key: string; css: string } | null>(null)
  useEffect(() => {
    if (!themeId || families.length === 0) return
    let live = true
    prefetchTheme().then((m) => { if (live) setDone({ key, css: m.contractSkinCss(families) }) })
    return () => { live = false }
  }, [key, themeId, families])
  if (!themeId) return undefined
  if (families.length === 0) return ''
  return done?.key === key ? done.css : null
}

/** The legacy sheet inside the canvas root. It renders with the theme, so both change in the same commit. */
export function TryItOnSheet({ css, themeId }: { css: string; themeId: string }) {
  return css ? <style data-try-it-on={themeId}>{css}</style> : null
}

/** The bar over the editor while a theme is tried on: what it is, what it costs, and the two ways out. */
export function TryItOnBar({ label, legacyCount, onKeep, onLeave }: { label: string; legacyCount: number; onKeep: () => void; onLeave: () => void }) {
  return <div className="we-try-bar" role="status" data-try-it-on-bar>
    <span><b>Trying on {label}.</b> Nothing is saved until you keep it.
      {legacyCount > 0 && <> {legacyCount === 1 ? '1 block was drawn for another theme. It keeps its shape and wears these colors and type.' : `${legacyCount} blocks were drawn for another theme. They keep their shape and wear these colors and type.`}</>}</span>
    <button type="button" onClick={onKeep}>Keep this look</button>
    <button type="button" onClick={onLeave}>Back to mine</button>
  </div>
}
