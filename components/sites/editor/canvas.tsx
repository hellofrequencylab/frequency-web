'use client'

import { useState, useRef, useEffect, useCallback, type ReactNode, type MouseEvent, type ComponentProps } from 'react'
import { createPortal } from 'react-dom'
import { ArrowUp, ArrowDown, Copy, MessageSquare, Trash2, GripVertical, Bold, Italic, Link, AlignLeft, Type } from 'lucide-react'
import { sanitizeInlineHtml } from '@/lib/entity-blocks/block-content'
import type { Config, Metadata, Data, ContentItem } from '@/lib/page-editor/types'
import type { MwLive } from '@/lib/sites/menswork-data'
import type { SiteLinkMap } from '@/lib/sites/house-theme'
import { mensworkSeason } from '@/lib/theme/menswork'
import { websiteThemeVars, WEBSITE_TOKEN_CSS } from '@/lib/sites/editor/theme'
import { findInlineTextMatch, inlineTextValue, inlineFieldValue, replaceInlineField, replaceInlineTextSegment, type InlineTextMatch } from '@/lib/sites/editor/inline-edit'
import { EDITABLE_GRIDS, dragElementPlacement, placeElementWithoutOverlap, sectionDeviceLayout, snapSectionSpacing, SECTION_SPACING_STEPS } from '@/lib/sites/editor/layout'
import type { WebsiteTheme, Device, SiteComment, SectionDisplay, WebsitePresence } from '@/lib/sites/editor/state'
import { WebsiteDocument } from '../website-document'
import { SiteChrome, siteHref } from '../site-chrome'

const CANVAS_CSS = `
html,body{margin:0;min-height:100%;}body{background:var(--th-bg)}
.we-canvas-root{padding-bottom:32px}.we-section{position:relative;outline:0;min-height:36px}
.we-section [data-manipulating=true]{background-image:linear-gradient(to right,color-mix(in srgb,var(--th-accent) 25%,transparent) 1px,transparent 1px),linear-gradient(to bottom,color-mix(in srgb,var(--th-accent) 15%,transparent) 1px,transparent 1px);background-size:calc(100% / 12) 100%,100% 48px}.we-section[data-selected=true]{outline:2px solid var(--th-accent);outline-offset:-2px}
.we-section .site-doc-section{animation:none!important}.we-section[data-hidden=true]{opacity:.5}.we-section[data-drop-target=true]{outline:2px dashed var(--th-accent);outline-offset:-2px}.we-section-label{cursor:grab;border:0}.we-section:focus-visible{outline:2px solid var(--th-accent-text);outline-offset:-2px}
.we-section-label{position:absolute;right:12px;top:8px;z-index:4;font:600 11px var(--th-body-render);display:flex;gap:6px;align-items:center;padding:4px 8px;background:var(--ed-field);color:var(--th-secondary);border-radius:var(--th-r)}
.we-section:not(:hover):not([data-selected=true]) .we-section-label{opacity:0}
.we-micro{position:sticky;top:8px;display:flex;align-items:center;gap:2px;z-index:5;width:max-content;margin:0 auto -42px;padding:4px;background:var(--ed-field);border:1px solid var(--th-muted);color:var(--th-text);border-radius:var(--th-r)}
.we-micro button{display:grid;place-items:center;width:32px;height:32px;border:0;background:transparent;color:inherit;cursor:pointer}.we-micro button:hover{background:var(--ed-chrome)}.we-micro button:disabled{opacity:.3;cursor:default}
.we-typography{position:relative}.we-typography summary{display:grid;place-items:center;width:32px;height:32px;cursor:pointer;list-style:none}.we-typography-panel{position:absolute;top:40px;right:0;min-width:190px;display:grid;gap:8px;background:var(--ed-field);border:1px solid var(--ed-line);padding:12px;color:var(--th-text)}.we-typography-panel button{width:auto!important;padding:4px;font-size:11px}.we-typography-panel label{display:grid;gap:4px;font:12px var(--th-body-render)}.we-typography-panel select{background:var(--th-raised);color:var(--th-text);border:1px solid var(--ed-line);padding:5px}.we-spacing-handle{position:absolute;left:35%;width:30%;height:10px;z-index:7;border:0;background:var(--th-accent);opacity:.45;cursor:ns-resize;touch-action:none}.we-spacing-top{top:0}.we-spacing-bottom{bottom:0}.we-micro button:focus-visible{outline:2px solid var(--th-accent)}
.we-section [data-site-text-selected=true]{outline:1px solid var(--th-accent);outline-offset:4px;cursor:text}.we-section [contenteditable=true]{outline:2px solid var(--th-accent);outline-offset:6px;cursor:text}
.we-collaborator-cursor{position:absolute;z-index:8;pointer-events:none;display:flex;align-items:flex-start;gap:4px;color:var(--th-season);font:700 12px var(--th-body-render);transform:translate(-2px,-2px)}.we-collaborator-cursor>span:first-child{font-size:24px;line-height:1}.we-collaborator-cursor>span:last-child{background:var(--th-season);color:var(--th-on-season);padding:4px 7px;border-radius:var(--th-r);white-space:nowrap}.we-layout-handles{position:absolute;inset:0;pointer-events:none;z-index:6}.we-layout-handles{border:1px dashed transparent}.we-layout-handles[data-active=true]{border-color:var(--th-accent)}.we-layout-handles:not([data-active=true]) button{opacity:0}.we-layout-handles:hover button{opacity:1}.we-layout-handles button{pointer-events:auto;position:absolute;width:26px;height:26px;background:var(--ed-field);border:1px solid var(--th-accent);color:var(--th-text);cursor:grab;touch-action:none}.we-move-handle{top:-6px;left:0}.we-resize-handle{bottom:-6px;right:0;cursor:nwse-resize!important}.we-pin{position:absolute;right:12%;top:25%;z-index:6;display:grid;place-items:center;width:30px;height:30px;border-radius:50% 50% 50% 0;background:var(--th-accent);color:var(--th-on-accent);border:1px solid var(--th-muted);font:800 12px var(--th-body-render);cursor:pointer}
.we-insert{display:block;width:100%;height:22px;border:0;background:transparent;color:var(--th-accent-text);font:600 12px var(--th-body-render);cursor:pointer}.we-insert:hover,.we-insert:focus-visible{background:color-mix(in srgb,var(--th-accent) 12%,transparent);outline:1px solid var(--th-accent)}
@media(pointer:coarse){.we-micro button{width:44px;height:44px}.we-section-label{opacity:1!important}.we-insert{height:44px}}
`

function inlineMarkdown(node: Node): string {
  if (node.nodeType === 3) return node.textContent ?? ''
  const element = node as HTMLElement
  const text = Array.from(node.childNodes).map(inlineMarkdown).join('')
  if (element.classList?.contains('mw-accent')) return `*${text}*`
  if (element.tagName === 'BR') return '\n'
  if (['B', 'STRONG'].includes(element.tagName)) return `**${text}**`
  if (['I', 'EM'].includes(element.tagName)) return `_${text}_`
  if (element.tagName === 'A') {
    const href = element.getAttribute('href') ?? ''
    return /^https?:\/\//.test(href) ? `[${text}](${href})` : text
  }
  return text
}

export function WebsiteCanvas({ doc, theme, device, config, metadata, live, links, nav, origin, title, brandName, logo, brandAccent, selectedId, preview, comments, onSelect, onEdit, onAction, onInsert, onDisplay, onReorder, onCommentPin, people = [], pageSlug = 'home', onCursor }: {
  doc: Data; theme: WebsiteTheme; device: Device; config: Config; metadata?: Metadata; live: MwLive; links: SiteLinkMap; origin: string
  title: string; brandName: string; logo?: string | null; brandAccent?: string | null
  nav: { slug: string; label: string }[]
  selectedId: string | null; preview: boolean; comments: SiteComment[]
  onSelect: (id: string) => void; onEdit: (id: string, field: string, value: unknown) => void
  onAction: (id: string, action: 'up' | 'down' | 'copy' | 'comment' | 'delete') => void
  people?: WebsitePresence[]; pageSlug?: string; onCursor?: (cursor: WebsitePresence['cursor']) => void
  onDisplay?: (id: string, value: SectionDisplay) => void
  onCommentPin?: (id: string, point: { x: number; y: number }) => void
  onReorder?: (sourceIds: string[], targetId: string) => void
  onInsert: (index: number) => void
}) {
  // Resolved by the same server reader as the public site; preview links stay inert.
  const chrome = metadata?.websiteChrome as Partial<Pick<ComponentProps<typeof SiteChrome>, 'cta' | 'tagline' | 'seasonNow' | 'admin' | 'themeFonts'>> | undefined
  const pageLinks = nav.map((page) => ({ label: page.label, href: siteHref(links.siteBase, page.slug) }))
  if (links.contactHref && !pageLinks.some((page) => page.href === links.contactHref)) pageLinks.push({ label: 'Contact', href: links.contactHref })
  const [mount, setMount] = useState<HTMLElement | null>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const editing = useRef<HTMLElement | null>(null)
  const cursorReportedAt = useRef(0)
  const draggingSections = useRef<string[]>([])
  const [textTarget, setTextTarget] = useState<{ id: string; field: string; node: HTMLElement; editing: boolean; rich: boolean } | null>(null)
  const selectedTextNode = useRef<HTMLElement | null>(null)
  const beginSelectedEdit = useRef<(() => void) | null>(null)
  useEffect(() => {
    if (!mount || mount.ownerDocument !== frame.current?.contentDocument || !mount.ownerDocument.defaultView || !selectedId || preview || textTarget?.editing || !onDisplay) return
    const section = Array.from(mount.querySelectorAll<HTMLElement>('.we-section')).find((node) => node.dataset.blockId === selectedId)
    const root = section?.querySelector<HTMLElement>('.site-doc-section')
    if (!root) return
    const cleanup: (() => void)[] = []
    const display = sectionDeviceLayout(doc, selectedId, device)
    for (const edge of ['top', 'bottom'] as const) {
      const button = mount.ownerDocument.createElement('button')
      button.type = 'button'; button.className = `we-spacing-handle we-spacing-${edge}`
      button.setAttribute('aria-label', `Drag ${edge} section spacing`)
      const start = (event: PointerEvent) => {
        if (event.button !== 0 || event.isPrimary === false) return
        event.preventDefault(); event.stopPropagation(); button.focus({ preventScroll: true }); button.setPointerCapture(event.pointerId)
        const original = root.style.paddingBlock
        let next = display.padding ?? 0
        const move = (e: PointerEvent) => { if (e.pointerId !== event.pointerId) return; next = snapSectionSpacing((display.padding ?? 0) + (e.clientY - event.clientY) * (edge === 'top' ? -1 : 1)); root.style.paddingBlock = `${next}px`; button.setAttribute('aria-valuetext', `${next} pixels`) }
        const stop = () => { mount.ownerDocument.removeEventListener('pointermove', move); mount.ownerDocument.removeEventListener('pointerup', end); mount.ownerDocument.removeEventListener('pointercancel', cancel); mount.ownerDocument.removeEventListener('keydown', escape, true); button.removeEventListener('lostpointercapture', cancel); if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId) }
        const end = (e: PointerEvent) => { if (e.pointerId !== event.pointerId) return; stop(); root.style.paddingBlock = original; onDisplay(selectedId, { ...display, padding: next }) }
        const cancel = (e?: PointerEvent) => { if (e && e.pointerId !== event.pointerId) return; stop(); root.style.paddingBlock = original }
        const escape = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel() } }
        mount.ownerDocument.addEventListener('keydown', escape, true); button.addEventListener('lostpointercapture', cancel)
        mount.ownerDocument.addEventListener('pointermove', move); mount.ownerDocument.addEventListener('pointerup', end); mount.ownerDocument.addEventListener('pointercancel', cancel); cleanup.push(cancel)
      }
      const keyboard = (e: KeyboardEvent) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); onDisplay(selectedId, { ...display, padding: SECTION_SPACING_STEPS[Math.min(SECTION_SPACING_STEPS.length - 1, Math.max(0, SECTION_SPACING_STEPS.findIndex((value) => value === snapSectionSpacing(display.padding ?? 0)) + (e.key === 'ArrowUp' ? 1 : -1)))] }) } }
      button.addEventListener('pointerdown', start); button.addEventListener('keydown', keyboard); section!.appendChild(button)
      cleanup.push(() => { button.removeEventListener('pointerdown', start); button.removeEventListener('keydown', keyboard); button.remove() })
    }
    for (const grid of root.querySelectorAll<HTMLElement>(EDITABLE_GRIDS)) {
      const children = Array.from(grid.children).filter((node): node is HTMLElement => node.nodeType === 1 && node.namespaceURI === 'http://www.w3.org/1999/xhtml' && !node.classList.contains('we-layout-handles') && !['STYLE', 'SCRIPT', 'LINK'].includes(node.tagName))
      if (children.length < 1) continue
      const originalGridStyle = grid.style.gridTemplateColumns
      const originalGridPosition = grid.style.position
      cleanup.push(() => { grid.style.position = originalGridPosition })
      cleanup.push(() => { grid.style.gridTemplateColumns = originalGridStyle })
      for (const child of children) {
        const path: number[] = []
        let current: HTMLElement | null = child
        while (current && current !== root) { const parent: HTMLElement | null = current.parentElement; if (!parent) break; path.unshift(Array.from(parent.children).indexOf(current)); current = parent }
        const key = path.join('.')
        const controls = mount.ownerDocument.createElement('div')
        controls.className = 'we-layout-handles'
        controls.dataset.active = String(!!textTarget && child.contains(textTarget.node) && textTarget.node.closest(EDITABLE_GRIDS) === grid)
        const activate = (event?: Event) => { if (event && (event.target as HTMLElement).closest(EDITABLE_GRIDS) !== grid) return; root.querySelectorAll<HTMLElement>('.we-layout-handles').forEach((node) => { node.dataset.active = String(node === controls) }) }
        child.addEventListener('click', activate); cleanup.push(() => child.removeEventListener('click', activate))
        const originalStyle = { position: child.style.position, column: child.style.gridColumn, row: child.style.gridRow, height: child.style.height, minHeight: child.style.minHeight }
        cleanup.push(() => { child.style.position = originalStyle.position; child.style.gridColumn = originalStyle.column; child.style.gridRow = originalStyle.row; child.style.height = originalStyle.height; child.style.minHeight = originalStyle.minHeight })
        child.style.position ||= 'relative'
        for (const resize of [false, true]) {
          const button = mount.ownerDocument.createElement('button')
          button.type = 'button'; button.className = resize ? 'we-resize-handle' : 'we-move-handle'
          button.setAttribute('aria-label', resize ? 'Resize element width and height' : 'Move element on grid')
          button.textContent = resize ? '↘' : '⠿'
          const down = (event: PointerEvent) => {
            const target = event.target as HTMLElement
            if (event.button !== 0 || event.isPrimary === false || (!resize && event.currentTarget === child && ((!target.matches('img,video,picture') && target.closest('[contenteditable=true],p,h1,h2,h3,h4,h5,h6,blockquote,span,a,input,textarea,select,button')) || target.closest(EDITABLE_GRIDS) !== grid))) return
            activate()
            event.preventDefault(); event.stopPropagation()
            button.focus({ preventScroll: true }); button.setPointerCapture(event.pointerId)
            const bounds = grid.getBoundingClientRect()
            const gap = parseFloat(mount.ownerDocument.defaultView!.getComputedStyle(grid).columnGap) || 0
            const unit = Math.max(1, (bounds.width + gap) / 12)
            const initialHeight = child.getBoundingClientRect().height
            const rowStep = Math.max(48, child.getBoundingClientRect().height + gap)
            const baseline: NonNullable<SectionDisplay['placements']> = { ...display.placements }
            const siblingStyles = children.map((node) => ({ node, column: node.style.gridColumn, row: node.style.gridRow, height: node.style.height, minHeight: node.style.minHeight }))
            const siblingPlacements: { node: HTMLElement; placement: NonNullable<SectionDisplay['placements']>[string] }[] = []
            const rows: { top: number; bottom: number }[] = []
            const siblingRows = new Map<HTMLElement, number>()
            for (const sibling of [...children].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)) {
              const rect = sibling.getBoundingClientRect()
              let row = rows.findIndex((band) => rect.top < band.bottom - 1 && rect.bottom > band.top + 1)
              if (row < 0) { row = rows.length; rows.push({ top: rect.top, bottom: rect.bottom }) }
              else rows[row].bottom = Math.max(rows[row].bottom, rect.bottom)
              siblingRows.set(sibling, row + 1)
            }
            for (const sibling of children) {
              const siblingPath: number[] = []
              let current: HTMLElement | null = sibling
              while (current && current !== root) { const parent: HTMLElement | null = current.parentElement; if (!parent) break; siblingPath.unshift(Array.from(parent.children).indexOf(current)); current = parent }
              const siblingKey = siblingPath.join('.'), rect = sibling.getBoundingClientRect()
              const column = Math.min(12, Math.max(1, Math.round((rect.left - bounds.left) / unit) + 1))
              const placement = baseline[siblingKey] ?? { column, span: Math.min(13 - column, Math.max(1, Math.round((rect.width + gap) / unit))), row: siblingRows.get(sibling) ?? 1 }
              baseline[siblingKey] = placement
              siblingPlacements.push({ node: sibling, placement })
            }
            const initial = baseline[key]
            let next = initial
            let resolved = baseline
            let changed = false
            const move = (e: PointerEvent) => {
              if (e.pointerId !== event.pointerId) return
              if (!changed && Math.hypot(e.clientX - event.clientX, e.clientY - event.clientY) < 4) return
              if (!changed) for (const { node, placement } of siblingPlacements) { node.style.gridColumn = `${placement.column} / span ${placement.span}`; node.style.gridRow = String(placement.row) }
              changed = true
              section!.dataset.manipulating = 'true'
              grid.dataset.manipulating = 'true'
              next = dragElementPlacement(initial, e.clientX - event.clientX, e.clientY - event.clientY, unit, rowStep, resize, initial.height ?? initialHeight)
              resolved = placeElementWithoutOverlap(baseline, key, next)
              for (const { node } of siblingPlacements) {
                const siblingPath: number[] = []; let current: HTMLElement | null = node
                while (current && current !== root) { const parent: HTMLElement | null = current.parentElement; if (!parent) break; siblingPath.unshift(Array.from(parent.children).indexOf(current)); current = parent }
                const placement = resolved[siblingPath.join('.')]
                node.style.gridColumn = `${placement.column} / span ${placement.span}`; node.style.gridRow = String(placement.row)
              }
              grid.style.gridTemplateColumns = 'repeat(12,minmax(0,1fr))'
              const placed = resolved[key]
              child.style.gridColumn = `${placed.column} / span ${placed.span}`; child.style.gridRow = String(placed.row)
              if (typeof placed.height === 'number') {
                if (child.matches('p,h1,h2,h3,h4,h5,h6,li,blockquote') || child.querySelector('p,h1,h2,h3,h4,h5,h6,li,blockquote') || (!child.matches('img,video,picture') && !child.querySelector('img,video,picture'))) { child.style.minHeight = `${placed.height}px`; child.style.height = 'auto' }
                else child.style.height = `${placed.height}px`
              }
              if (controls.parentElement === grid) { controls.style.left = `${child.offsetLeft}px`; controls.style.top = `${child.offsetTop}px`; controls.style.width = `${child.offsetWidth}px`; controls.style.height = `${child.offsetHeight}px` }
            }
            const stop = () => { mount.ownerDocument.removeEventListener('pointermove', move); mount.ownerDocument.removeEventListener('pointerup', end); mount.ownerDocument.removeEventListener('pointercancel', cancel); mount.ownerDocument.removeEventListener('keydown', escape, true); button.removeEventListener('lostpointercapture', cancel); if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId) }
            const end = (e: PointerEvent) => { if (e.pointerId !== event.pointerId) return; cancel(); if (changed && JSON.stringify(next) !== JSON.stringify(initial)) onDisplay(selectedId, { ...display, placements: resolved }) }
            const cancel = (e?: PointerEvent) => { if (e && e.pointerId !== event.pointerId) return; stop(); delete section!.dataset.manipulating; delete grid.dataset.manipulating; grid.style.gridTemplateColumns = originalGridStyle; for (const original of siblingStyles) { original.node.style.gridColumn = original.column; original.node.style.gridRow = original.row; original.node.style.height = original.height; original.node.style.minHeight = original.minHeight } if (controls.parentElement === grid) { controls.style.left = `${child.offsetLeft}px`; controls.style.top = `${child.offsetTop}px`; controls.style.width = `${child.offsetWidth}px`; controls.style.height = `${child.offsetHeight}px` } }
            const escape = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel() } }
            mount.ownerDocument.addEventListener('keydown', escape, true); button.addEventListener('lostpointercapture', cancel)
            mount.ownerDocument.addEventListener('pointermove', move); mount.ownerDocument.addEventListener('pointerup', end); mount.ownerDocument.addEventListener('pointercancel', cancel)
            cleanup.push(cancel)
          }
          button.addEventListener('pointerdown', down)
          if (!resize) child.addEventListener('pointerdown', down)
          controls.appendChild(button)
          cleanup.push(() => { button.removeEventListener('pointerdown', down); if (!resize) child.removeEventListener('pointerdown', down) })
        }
        if (['IMG', 'VIDEO', 'HR'].includes(child.tagName)) {
          grid.style.position ||= 'relative'
          controls.style.inset = 'auto'; controls.style.left = `${child.offsetLeft}px`; controls.style.top = `${child.offsetTop}px`; controls.style.width = `${child.offsetWidth}px`; controls.style.height = `${child.offsetHeight}px`
          grid.appendChild(controls)
        } else child.appendChild(controls)
        cleanup.push(() => controls.remove())
      }
    }
    return () => cleanup.forEach((fn) => fn())
  }, [mount, selectedId, preview, textTarget, doc, device, onDisplay])
  // A real iframe viewport, not a div at a pretend width. One React tree through
  // a portal; events remain local and no document is passed through postMessage.
  const attach = useCallback(() => {
    const document = frame.current?.contentDocument
    if (!document?.body || !document.documentElement || !document.head) return
    document.documentElement.setAttribute('class', window.document.documentElement.className)
    document.body.setAttribute('class', window.document.body.className)
    if (!document.documentElement.hasAttribute('data-website-styles-loaded')) {
      for (const node of window.document.head.querySelectorAll('link[rel=stylesheet],style')) document.head.appendChild(node.cloneNode(true))
      document.documentElement.setAttribute('data-website-styles-loaded', 'true')
    }
    const computed = getComputedStyle(window.document.documentElement)
    for (const key of Array.from(computed)) if (key.startsWith('--font-')) document.documentElement.style.setProperty(key, computed.getPropertyValue(key))
    setMount(document.body)
  }, [])
  useEffect(() => {
    const iframe = frame.current
    if (!iframe) return
    iframe.addEventListener('load', attach)
    // A complete body can exist while readyState is still loading. Mount now;
    // native load mounts again if the browser replaces its initial document.
    attach()
    let attempts = 0
    const retry = window.setInterval(() => {
      attach()
      if (iframe.contentDocument?.readyState === 'complete' || ++attempts >= 20) window.clearInterval(retry)
    }, 50)
    return () => { iframe.removeEventListener('load', attach); window.clearInterval(retry) }
  }, [attach])
  function renderedText(node: HTMLElement): string {
    const copy = node.cloneNode(true) as HTMLElement
    for (const decoration of copy.querySelectorAll('[aria-hidden=true],.we-layout-handles,.we-spacing-handle,svg,style,script')) decoration.remove()
    const text = copy.textContent ?? ''
    return node.matches('.mw-strip-end') && text.trimEnd().endsWith('→') ? text.trimEnd().slice(0, -1).trimEnd() : text
  }
  function editText(event: MouseEvent<HTMLElement>, block: ContentItem): boolean {
    if (preview || editing.current || (event.target as HTMLElement).closest('.we-micro,.we-section-label,.we-pin,.we-layout-handles,.we-spacing-handle')) return false
    const schema = config.components[block.type]?.fields ?? {}
    const fields = { ...schema }
    if (block.type === 'SpaceOfferings' && Array.isArray(metadata?.space?.profile?.offerings) && metadata.space.profile.offerings.length > 0) {
      delete fields.items
      if ((event.target as HTMLElement).closest('.grid')) return false
    }
    if (block.type === 'FeatureGrid' && ['offerings','events','memberships','tickets'].includes(String(block.props.source))) {
      delete fields.items
      if ((event.target as HTMLElement).closest('.mw-grid,.grid,.hs-cards')) return false
    }
    const aliasFields: Record<string, [string, string]> = { Heading: ['title', 'text'], DisplayHeading: ['text', 'title'], Text: ['body', 'text'], Prose: ['text', 'body'] }
    const alias = aliasFields[block.type]
    if (alias && typeof block.props[alias[0]] !== 'string' && typeof block.props[alias[1]] === 'string') fields[alias[1]] = { type: 'textarea' }
    const variants = block.type === 'EditorialSection' ? ['lead', 'prose', 'faq', 'stats'] : block.type === 'Zigzag' ? ['lead', 'list', 'quote'] : null
    if (variants && typeof block.props.body === 'string' && !variants.includes(block.props.body)) fields.body = { type: 'textarea' }
    const region = (event.target as HTMLElement).closest('.site-doc-section')
    const leaf = (event.target as HTMLElement).closest<HTMLElement>('span,small')
    let target: HTMLElement | null = leaf?.matches('.mw-display,.mw-label,.mw-kicker,.hs-kicker,.hs-label') ? leaf : (event.target as HTMLElement).closest<HTMLElement>('h1,h2,h3,h4,h5,h6,p,blockquote,figcaption,li,dt,dd,a,button,label,summary') ?? leaf
    let match: InlineTextMatch | null = null
    while (target && target !== region) {
      if (target.matches('h1,h2,h3,h4,h5,h6,p,blockquote,figcaption,li,dt,dd,a,button,label,summary,span,small,strong,em') && !target.querySelector('h1,h2,h3,h4,h5,h6,p,li,button,input,textarea,select')) {
        const plain = renderedText(target)
        const siblings = Array.from(region?.querySelectorAll<HTMLElement>(target.tagName) ?? [target]).filter((node) => node.className === target!.className && inlineTextValue(renderedText(node)) === inlineTextValue(plain))
        const preferred = target.matches('h1,h2,h3,h4,h5,h6,dt') ? ['title','headline','heading','text'] : target.matches('a,button') ? ['ctaLabel','label','linkLabel','text','title'] : ['lead','body','text','description','caption','kicker']
        const ordered = Object.fromEntries(Object.entries(fields).sort(([a], [b]) => (preferred.includes(a) ? preferred.indexOf(a) : 100) - (preferred.includes(b) ? preferred.indexOf(b) : 100)))
        match = findInlineTextMatch(block.props, ordered, plain, Math.max(0, siblings.indexOf(target)), target.matches('h1,h2,h3,h4,h5,h6,dt') ? 'heading' : target.matches('a,button,summary') ? 'label' : 'body')
        if (match) break
      }
      target = target.parentElement
    }
    if (!target || !match) {
      for (const [field, definition] of Object.entries(schema)) if (definition.type === 'slot' && Array.isArray(block.props[field])) for (const child of block.props[field] as ContentItem[]) if (editText(event, child)) return true
      return false
    }
    const node = target, matched = match
    const rich = node.matches('h1,h2,h3,h4,h5,h6,p,blockquote')
    selectedTextNode.current?.removeAttribute('data-site-text-selected')
    selectedTextNode.current = node
    node.setAttribute('data-site-text-selected', 'true')
    node.tabIndex = 0
    setTextTarget({ id: block.props.id!, field: matched.field, node, editing: false, rich })
    event.stopPropagation()
    const begin = () => {
      if (editing.current || !node.isConnected) return
      editing.current = node
      setTextTarget({ id: block.props.id!, field: matched.field, node, editing: true, rich })
      const original = inlineFieldValue(block.props, matched)
      const originalHTML = node.innerHTML
      let canceled = false
      const selection = node.ownerDocument.getSelection()
      const range = selection?.rangeCount && node.contains(selection.anchorNode) && node.contains(selection.focusNode) ? selection.getRangeAt(0).cloneRange() : null
      node.contentEditable = 'true'; node.focus({ preventScroll: true })
      if (range && selection) { selection.removeAllRanges(); selection.addRange(range) }
      const end = () => {
        node.contentEditable = 'false'; editing.current = null; beginSelectedEdit.current = null; setTextTarget(null)
        node.removeAttribute('data-site-text-selected')
        node.removeEventListener('keydown', key)
        const edited = !rich ? renderedText(node) : /<[^>]+>/.test(original) ? sanitizeInlineHtml(node.innerHTML) : inlineMarkdown(node)
        if (!canceled && node.innerHTML !== originalHTML && replaceInlineTextSegment(original, matched, edited) !== original) onEdit(block.props.id!, matched.field, replaceInlineField(block.props, matched, edited))
      }
      const key = (e: KeyboardEvent) => {
        if (e.key === 'Escape') { canceled = true; node.innerHTML = originalHTML; node.blur() }
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); node.blur() }
      }
      node.addEventListener('keydown', key)
      node.addEventListener('blur', end, { once: true })
    }
    beginSelectedEdit.current = begin
    if (event.detail >= 2) begin()
    else node.focus({ preventScroll: true })
    return true
  }
  const wrap = preview ? undefined : (node: ReactNode, indexes: number[]) => {
    const block = doc.content[indexes[0]]
    const id = block.props.id!
    const selected = id === selectedId
    const textSelectedHere = !!textTarget && textTarget.node.closest('.we-section')?.getAttribute('data-block-id') === id
    const label = String(block.props.title || config.components[block.type]?.label || block.type).replace(/\*/g, '')
    const pins = comments.filter((c) => indexes.some((i) => doc.content[i].props.id === c.blockId) && !c.resolved)
    return <div key={id}>
      <button className="we-insert" type="button" aria-label={`Insert section before ${label}`} onClick={() => onInsert(indexes[0])}>+ Add section</button>
      <section className="we-section" data-selected={selected} data-hidden={sectionDeviceLayout(doc, id, device).hidden ?? false} data-block-id={id} tabIndex={0} aria-label={label}
        onDragOver={(e) => { if (draggingSections.current.length && !draggingSections.current.includes(id)) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; e.currentTarget.dataset.dropTarget = 'true' } }}
        onDragLeave={(e) => { e.currentTarget.dataset.dropTarget = 'false' }}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.dataset.dropTarget = 'false'; if (draggingSections.current.length && !draggingSections.current.includes(id)) onReorder?.(draggingSections.current, id); draggingSections.current = [] }}
        onPointerMove={(e) => {
          if (!onCursor || Date.now() - cursorReportedAt.current < 100) return
          cursorReportedAt.current = Date.now()
          const bounds = e.currentTarget.getBoundingClientRect()
          onCursor({ pageSlug, blockId: id, x: Math.min(1, Math.max(0, (e.clientX - bounds.left) / Math.max(1, bounds.width))), y: Math.min(1, Math.max(0, (e.clientY - bounds.top) / Math.max(1, bounds.height))) })
        }}
        onPointerLeave={() => onCursor?.(null)}
        onClick={(e) => { if (e.shiftKey && onCommentPin) { e.preventDefault(); const bounds = e.currentTarget.getBoundingClientRect(); onSelect(id); onCommentPin(id, { x: Math.min(1, Math.max(0, (e.clientX - bounds.left) / Math.max(1, bounds.width))), y: Math.min(1, Math.max(0, (e.clientY - bounds.top) / Math.max(1, bounds.height))) }); return } if ((e.target as HTMLElement).closest('a,button')) e.preventDefault(); onSelect(id); let picked = false; for (const index of indexes) if (editText(e, doc.content[index])) { picked = true; break } if (!picked && !editing.current) { selectedTextNode.current?.removeAttribute('data-site-text-selected'); selectedTextNode.current = null; beginSelectedEdit.current = null; setTextTarget(null) } }}
        onKeyDown={(e) => { if ((e.target as HTMLElement).isContentEditable) return; if (textTarget && (e.target === textTarget.node || textTarget.node.contains(e.target as Node)) && (e.key === 'Enter' || (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey))) { beginSelectedEdit.current?.(); if (e.key === 'Enter') e.preventDefault(); return } if (e.key === 'Enter') onSelect(id); if (e.altKey && ['ArrowUp', 'ArrowDown'].includes(e.key)) { e.preventDefault(); onAction(id, e.key === 'ArrowUp' ? 'up' : 'down') } }}>
        <button type="button" className="we-section-label" aria-label={`Drag ${label} to reorder sections`} draggable={!!onReorder} onClick={(e) => { e.stopPropagation(); onSelect(id) }} onDragStart={(e) => { draggingSections.current = indexes.map((index) => doc.content[index].props.id!); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', label) }} onDragEnd={() => { draggingSections.current = []; for (const target of mount?.querySelectorAll<HTMLElement>('[data-drop-target=true]') ?? []) target.dataset.dropTarget = 'false' }}><GripVertical size={12} aria-hidden />{label}{sectionDeviceLayout(doc, id, device).hidden && ' · Hidden on this device'}</button>
        {selected && !textSelectedHere && <div className="we-micro" role="toolbar" aria-label={`${label} section controls`} onClick={(e) => e.stopPropagation()}>
          <button type="button" title="Move up" aria-label="Move up" disabled={indexes[0] === 0} onClick={() => onAction(id, 'up')}><ArrowUp size={15} /></button>
          <button type="button" title="Move down" aria-label="Move down" disabled={indexes.at(-1) === doc.content.length - 1} onClick={() => onAction(id, 'down')}><ArrowDown size={15} /></button>
          <button type="button" title="Duplicate" aria-label="Duplicate" onClick={() => onAction(id, 'copy')}><Copy size={15} /></button>
          <button type="button" title="Comment" aria-label="Comment" onClick={() => onCommentPin ? onCommentPin(id, { x: .5, y: .5 }) : onAction(id, 'comment')}><MessageSquare size={15} /></button>
          <button type="button" title="Delete" aria-label="Delete" onClick={() => onAction(id, 'delete')}><Trash2 size={15} /></button>
        </div>}
        {selected && textSelectedHere && !!textTarget && <div className="we-micro" role="toolbar" aria-label="Text controls" onMouseDown={(e) => e.preventDefault()} onClick={(e) => e.stopPropagation()}>
          <button type="button" title="Bold" aria-label="Bold" disabled={!textTarget.rich} onClick={() => { beginSelectedEdit.current?.(); textTarget.node.ownerDocument.execCommand('bold') }}><Bold size={15} /></button>
          <button type="button" title="Italic" aria-label="Italic" disabled={!textTarget.rich} onClick={() => { beginSelectedEdit.current?.(); textTarget.node.ownerDocument.execCommand('italic') }}><Italic size={15} /></button>
          <button type="button" title="Align text" aria-label="Align text" onClick={() => { const node = textTarget.node; const value = sectionDeviceLayout(doc, id, device); const align = value.align === 'center' ? 'left' : 'center'; node.style.textAlign = align; onDisplay?.(id, { ...value, align }) }}><AlignLeft size={15} /></button>
          <button type="button" title="Link" aria-label="Link" disabled={!textTarget.rich} onClick={() => { beginSelectedEdit.current?.(); const url = window.prompt('Link URL'); if (url && /^https?:\/\//.test(url)) textTarget.node.ownerDocument.execCommand('createLink', false, url) }}><Link size={15} /></button>
          <details className="we-typography"><summary role="button" title="Typography" aria-label="Typography"><Type size={15} /></summary><div className="we-typography-panel">
            <span>Typeface</span><div role="group" aria-label="Text typeface">{(['display','body','mono'] as const).map((font) => <button type="button" key={font} title={`Theme ${font}`} aria-label={`Theme ${font} typeface`} onClick={() => onDisplay?.(id, { ...sectionDeviceLayout(doc, id, device), [/^H[1-6]$/.test(textTarget.node.tagName) ? 'textFont' : 'bodyFont']: font })}>{font}</button>)}</div>
            <span>Text size</span><div role="group" aria-label="Inline text size" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)' }}>{[0,16,20,24,32,40,48,56,64,80,96,120].map((size) => <button type="button" key={size} aria-label={size ? `${size} pixels` : 'Theme size'} onClick={() => onDisplay?.(id, { ...sectionDeviceLayout(doc, id, device), [/^H[1-6]$/.test(textTarget.node.tagName) ? 'textSize' : 'bodySize']: size })}>{size || 'Auto'}</button>)}</div><button type="button" aria-label="Done editing" onClick={() => { textTarget.node.blur(); if (!textTarget.editing) { textTarget.node.removeAttribute('data-site-text-selected'); setTextTarget(null) } }}>Done</button>
          </div></details>
        </div>}
        {node}
        {people.filter((person) => person.cursor?.pageSlug === pageSlug && person.cursor.blockId === id).map((person) => <div key={person.profileId} className="we-collaborator-cursor" aria-label={`${person.name} is editing this section`} style={{ left: `${Math.min(1, Math.max(0, person.cursor!.x)) * 100}%`, top: `${Math.min(1, Math.max(0, person.cursor!.y)) * 100}%` }}><span aria-hidden>↖</span><span>{person.name}</span></div>)}
        {pins.map((pin, index) => <button key={pin.id} className="we-pin" style={{ left: `${(pin.x ?? .88) * 100}%`, top: `${(pin.y ?? .25) * 100}%`, right: 'auto' }} type="button" aria-label={`Open comment ${index + 1} on ${label}`} onClick={(e) => { e.stopPropagation(); onSelect(pin.blockId); onAction(pin.blockId, 'comment') }}>{index + 1}</button>)}
      </section>
    </div>
  }
  return <iframe ref={frame} className="we-frame" title={`${title}, ${device} website canvas`} srcDoc="<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'></head><body></body></html>" sandbox="allow-same-origin" onLoad={attach}>
    {mount && createPortal(<div data-website-theme={theme} style={websiteThemeVars(theme, brandAccent)} className="we-canvas-root" onClickCapture={(e) => { if ((e.target as HTMLElement).closest('a')) e.preventDefault() }}>
      <style>{WEBSITE_TOKEN_CSS + CANVAS_CSS}</style>
      <SiteChrome brandName={brandName} homeHref={siteHref(links.siteBase, 'home')} links={pageLinks} cta={chrome?.cta ?? null} themeFonts={chrome?.themeFonts ?? true} logoUrl={logo} tagline={chrome?.tagline ?? null} seasonNow={theme === 'Menswork' ? chrome?.seasonNow ?? null : null} admin={chrome?.admin ?? null} skin={theme === 'Menswork' ? { theme: 'menswork', season: mensworkSeason(new Date()) } : null}>
        <WebsiteDocument doc={doc} theme={theme} config={config} metadata={metadata} live={live} links={links} origin={origin} title={title} wrapSection={wrap} />
        {!preview && <button className="we-insert" type="button" onClick={() => onInsert(doc.content.length)}>+ Add section</button>}
      </SiteChrome>
    </div>, mount)}
  </iframe>
}
