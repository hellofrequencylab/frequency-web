'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useNodeLayout } from '@/components/entity-blocks/node-layout-store'
import { useProfileLayout } from '@/components/entity-blocks/profile-layout-context'
import { linkForHref, previewLinks, sameLinkUrl } from '@/lib/spotlight/preview-target'

// THE SPOTLIGHT EDITOR'S PREVIEW (LIVE-2452). The real Spotlight page (app/spaces/[slug]/spotlight/preview) in a
// phone-width frame that stays in view while the owner scrolls the editor. Inside an iframe the page wears only
// its own theme: no member or console style can reach it, so what the owner sees is what a visitor gets. The
// editor saves as it goes; when a save lands (or `version` moves, for a theme or look change) the frame reloads
// and keeps its scroll place.
//
// SNAP TO FRAME, BOTH WAYS (LIVE-2453), the Space page editor's behaviour: picking a block in the editor scrolls
// the page to it and outlines it; a press on the page picks that block in the editor (a link picks its own row).
// Blocks carry `data-spotlight-nid` on the preview render; a link drawn by a theme's own layout is found by its
// address (lib/spotlight/preview-target.ts). The frame is same-origin, so the editor reads it directly.
// Voice canon: no em dashes.

const OUTLINE_CSS = `
[data-spotlight-pick]{outline:2px solid var(--color-primary,currentColor);outline-offset:6px;border-radius:12px;scroll-margin:96px}
[data-spotlight-hover]:not([data-spotlight-pick]){outline:1px dashed var(--color-primary,currentColor);outline-offset:6px;border-radius:12px}
[data-spotlight-nid],a[href]{cursor:pointer}
html{scrollbar-width:none}html::-webkit-scrollbar{display:none}
`

/** The event's target as an Element. The frame is its own realm, so `instanceof Element` from the editor is false. */
function asElement(target: EventTarget | null): Element | null {
  return target && typeof (target as Element).closest === 'function' ? (target as Element) : null
}

// THE DEVICE (LIVE-2486). The page is drawn at a real phone's width (390 by 844, the common iPhone size) so it lays out
// exactly as a visitor's phone does, then the whole device is scaled down to fit the column and the window. Drawing it
// narrower than a phone squeezed the page (titles wrapped, the main button spilled out of its pill).
const DEVICE_W = 390
const DEVICE_H = 844
const BEZEL = 10
/** The bezel's padding (p-2.5) and its 1px border, so the screen inside is exactly DEVICE_W by DEVICE_H. */
const OUTER_W = DEVICE_W + (BEZEL + 1) * 2
const OUTER_H = DEVICE_H + (BEZEL + 1) * 2
/** Room the sticky column keeps above and below the device: the header offset, the label and the hint line. */
const CHROME_H = 176

export function SpotlightPreviewFrame({
  slug,
  version,
  onPick,
}: {
  slug: string
  version: number
  /** A press on the page picked something: the editor brings its Page tab (and, on a phone, its Edit view) forward. */
  onPick?: () => void
}) {
  const nodeStore = useNodeLayout()
  const legacyStore = useProfileLayout()
  const saving = !!(nodeStore?.saving || nodeStore?.dirty || legacyStore?.saving || legacyStore?.dirty)
  const frame = useRef<HTMLIFrameElement | null>(null)
  const stage = useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(0.8)
  // Fit the device to the column's width and the window's height, never larger than life.
  useEffect(() => {
    const el = stage.current
    if (!el) return
    const fit = () => {
      const byWidth = el.clientWidth / OUTER_W
      const byHeight = (window.innerHeight - CHROME_H) / OUTER_H
      const next = Math.max(0.5, Math.min(1, byWidth || 1, byHeight))
      setScale((s) => (Math.abs(s - next) < 0.005 ? s : next))
    }
    fit()
    // Window resizes alone still refit where ResizeObserver is missing (an older browser).
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit)
    ro?.observe(el)
    window.addEventListener('resize', fit)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', fit)
    }
  }, [])
  const scrollY = useRef(0)
  const [loading, setLoading] = useState(true)
  const [loads, setLoads] = useState(0)
  const wasSaving = useRef(saving)
  const lastVersion = useRef(version)

  // The freshest store, read from the frame's own listeners without re-binding them on every edit.
  const live = useRef({ nodeStore, legacyStore, onPick })
  useEffect(() => {
    live.current = { nodeStore, legacyStore, onPick }
  }, [nodeStore, legacyStore, onPick])

  // Draw the page again when a save has just finished, or a theme or look change has landed.
  useEffect(() => {
    const saved = wasSaving.current && !saving
    const restyled = lastVersion.current !== version
    wasSaving.current = saving
    lastVersion.current = version
    if (!saved && !restyled) return
    const win = frame.current?.contentWindow
    if (!win) return
    try {
      scrollY.current = win.scrollY
      win.location.reload()
    } catch {
      // A frame we cannot reach (navigated away): leave it as it is.
    }
  }, [saving, version])

  const doc = useCallback((): Document | null => {
    try {
      return frame.current?.contentDocument ?? null
    } catch {
      return null
    }
  }, [])

  /** The element on the page that stands for the current pick, if it is drawn. */
  const pickedElement = useCallback((): Element | null => {
    const d = doc()
    if (!d) return null
    const { nodeStore: ns, legacyStore: ls } = live.current
    if (ns?.selectedNid) {
      const nid = ns.selectedNid
      const links = previewLinks(ns.layout).filter((l) => l.nid === nid)
      if (links.length) {
        const want = ns.selectedItemIndex != null ? links.find((l) => l.index === ns.selectedItemIndex) : links[0]
        const anchor = want ? [...d.querySelectorAll('a[href]')].find((a) => sameLinkUrl(a.getAttribute('href') ?? '', want.url)) : null
        if (anchor) return anchor
      }
      const byNid = [...d.querySelectorAll('[data-spotlight-nid]')].find((el) => el.getAttribute('data-spotlight-nid') === nid)
      if (byNid) return byNid
      const type = ns.layout?.rows.flatMap((r) => r.cells.flat()).find((n) => n.nid === nid)?.type
      return type ? [...d.querySelectorAll('[data-spotlight-block]')].find((el) => el.getAttribute('data-spotlight-block') === type) ?? null : null
    }
    if (ls?.selectedId) {
      const id = ls.selectedId
      return [...d.querySelectorAll('[data-spotlight-block]')].find((el) => el.getAttribute('data-spotlight-block') === id) ?? null
    }
    return null
  }, [doc])

  /** Outline the pick and bring it into the frame. */
  const showPick = useCallback(
    (scroll: boolean) => {
      const d = doc()
      if (!d) return
      d.querySelectorAll('[data-spotlight-pick]').forEach((el) => el.removeAttribute('data-spotlight-pick'))
      const el = pickedElement()
      if (!el) return
      el.setAttribute('data-spotlight-pick', '')
      if (scroll) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    },
    [doc, pickedElement],
  )

  // The editor picked something: snap the page to it.
  const pickKey = `${nodeStore?.selectedNid ?? legacyStore?.selectedId ?? ''}:${nodeStore?.selectedItemIndex ?? ''}`
  const fromPage = useRef(false)
  useEffect(() => {
    showPick(!fromPage.current)
    fromPage.current = false
  }, [pickKey, loads, showPick])

  const onLoad = () => {
    setLoading(false)
    const d = doc()
    const win = frame.current?.contentWindow
    if (!d || !win) return
    win.scrollTo(0, scrollY.current)
    const style = d.createElement('style')
    style.textContent = OUTLINE_CSS
    d.head.appendChild(style)
    // A short page stops partway down the phone. Paint the rest of the screen in the page's own colour, the way the
    // theme fills a visitor's screen, so the phone never shows a pale band under the page.
    const fill = [...d.querySelectorAll('.spotlight-root, .nws')]
      .map((el) => win.getComputedStyle(el).backgroundColor)
      .find((c) => c && c !== 'transparent' && c !== 'rgba(0, 0, 0, 0)')
    if (fill) {
      d.documentElement.style.background = fill
      d.body.style.background = fill
    }

    // A press on the page picks what was pressed in the editor. On the window, capturing, so it runs before the
    // page's own guard (SpotlightPreviewBridge) swallows the press.
    win.addEventListener('click', (e) => {
      const t = asElement(e.target)
      if (!t) return
      const { nodeStore: ns, legacyStore: ls } = live.current
      const anchor = t.closest('a[href]')
      const link = anchor && ns ? linkForHref(ns.layout, anchor.getAttribute('href') ?? '') : null
      const block = t.closest('[data-spotlight-nid]')
      fromPage.current = true
      if (link && ns) {
        ns.select(link.nid)
        ns.selectItem(link.index)
      } else if (block && ns) {
        ns.select(block.getAttribute('data-spotlight-nid'))
      } else if (block && ls) {
        ls.select(block.getAttribute('data-spotlight-block'))
      } else {
        fromPage.current = false
      }
      if (fromPage.current) live.current.onPick?.()
    }, true)
    // Hover outlines what a press would pick.
    d.addEventListener('mouseover', (e) => {
      const t = asElement(e.target)
      d.querySelectorAll('[data-spotlight-hover]').forEach((el) => el.removeAttribute('data-spotlight-hover'))
      t?.closest('a[href], [data-spotlight-nid]')?.setAttribute('data-spotlight-hover', '')
    })
    setLoads((n) => n + 1)
  }

  return (
    <div ref={stage} className="relative w-full">
      <div className="mx-auto" style={{ width: OUTER_W * scale, height: OUTER_H * scale }}>
        <div
          className="origin-top-left rounded-[2.75rem] border border-border-strong bg-surface-elevated p-2.5 lift-2"
          style={{ width: OUTER_W, height: OUTER_H, transform: `scale(${scale})` }}
        >
          <div className="h-full w-full overflow-hidden rounded-[2.25rem] bg-canvas">
            <iframe
              ref={frame}
              src={`/spaces/${slug}/spotlight/preview`}
              title="Preview of your Spotlight"
              onLoad={onLoad}
              className="block h-full w-full"
            />
          </div>
        </div>
      </div>
      {(loading || saving) && (
        <span className="absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-1 rounded-pill bg-surface px-2 py-1 text-2xs text-muted lift-1" role="status" aria-live="polite">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Updating
        </span>
      )}
      <p className="mt-2 text-center text-meta text-muted">Click anything in the preview to edit it.</p>
    </div>
  )
}
