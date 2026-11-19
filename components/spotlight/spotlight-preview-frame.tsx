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

export function SpotlightPreviewFrame({ slug, version }: { slug: string; version: number }) {
  const nodeStore = useNodeLayout()
  const legacyStore = useProfileLayout()
  const saving = !!(nodeStore?.saving || nodeStore?.dirty || legacyStore?.saving || legacyStore?.dirty)
  const frame = useRef<HTMLIFrameElement | null>(null)
  const scrollY = useRef(0)
  const [loading, setLoading] = useState(true)
  const [loads, setLoads] = useState(0)
  const wasSaving = useRef(saving)
  const lastVersion = useRef(version)

  // The freshest store, read from the frame's own listeners without re-binding them on every edit.
  const live = useRef({ nodeStore, legacyStore })
  useEffect(() => {
    live.current = { nodeStore, legacyStore }
  }, [nodeStore, legacyStore])

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
    <div className="relative mx-auto w-full max-w-sm">
      <div className="overflow-hidden rounded-card border border-border bg-canvas lift-1">
        <iframe
          ref={frame}
          src={`/spaces/${slug}/spotlight/preview`}
          title="Preview of your Spotlight"
          onLoad={onLoad}
          className="block h-[calc(100dvh-9rem)] max-h-[48rem] w-full"
        />
      </div>
      {(loading || saving) && (
        <span className="absolute right-3 top-3 flex items-center gap-1 rounded-pill bg-surface px-2 py-1 text-2xs text-muted lift-1" role="status" aria-live="polite">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Updating
        </span>
      )}
      <p className="mt-2 text-center text-meta text-muted">Click anything in the preview to edit it.</p>
    </div>
  )
}
