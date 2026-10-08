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
import { findInlineTextMatch, inlineTextValue, replaceInlineTextSegment } from '@/lib/sites/editor/inline-edit'
import { EDITABLE_GRIDS, sectionDeviceLayout, snapSectionSpacing, SECTION_SPACING_STEPS } from '@/lib/sites/editor/layout'
import type { WebsiteTheme, Device, SiteComment, SectionDisplay, WebsitePresence } from '@/lib/sites/editor/state'
import { WebsiteDocument } from '../website-document'
import { SiteChrome, siteHref } from '../site-chrome'

const CANVAS_CSS = `
html,body{margin:0;min-height:100%;}body{background:var(--th-bg)}
.we-canvas-root{padding-bottom:160px}.we-section{position:relative;outline:0;min-height:36px}
.we-section[data-selected=true]{outline:2px solid var(--th-accent);outline-offset:-2px}
.we-section .site-doc-section{animation:none!important}.we-section[data-hidden=true]{opacity:.5}.we-section[data-drop-target=true]{outline:2px dashed var(--th-accent);outline-offset:-2px}.we-section-label{cursor:grab;border:0}.we-section:focus-visible{outline:2px solid var(--th-accent-text);outline-offset:-2px}
.we-section-label{position:absolute;right:12px;top:8px;z-index:4;font:600 11px var(--th-body-render);display:flex;gap:6px;align-items:center;padding:4px 8px;background:var(--ed-field);color:var(--th-secondary);border-radius:var(--th-r)}
.we-section:not(:hover):not([data-selected=true]) .we-section-label{opacity:0}
.we-micro{position:sticky;top:8px;display:flex;align-items:center;gap:2px;z-index:5;width:max-content;margin:0 auto -42px;padding:4px;background:var(--ed-field);border:1px solid var(--th-muted);color:var(--th-text);border-radius:var(--th-r)}
.we-micro button{display:grid;place-items:center;width:32px;height:32px;border:0;background:transparent;color:inherit;cursor:pointer}.we-micro button:hover{background:var(--ed-chrome)}.we-micro button:disabled{opacity:.3;cursor:default}
.we-typography{position:relative}.we-typography summary{display:grid;place-items:center;width:32px;height:32px;cursor:pointer;list-style:none}.we-typography-panel{position:absolute;top:40px;right:0;min-width:190px;display:grid;gap:8px;background:var(--ed-field);border:1px solid var(--ed-line);padding:12px;color:var(--th-text)}.we-typography-panel button{width:auto!important;padding:4px;font-size:11px}.we-typography-panel label{display:grid;gap:4px;font:12px var(--th-body-render)}.we-typography-panel select{background:var(--th-raised);color:var(--th-text);border:1px solid var(--ed-line);padding:5px}.we-spacing-handle{position:absolute;left:35%;width:30%;height:10px;z-index:7;border:0;background:var(--th-accent);opacity:.45;cursor:ns-resize;touch-action:none}.we-spacing-top{top:0}.we-spacing-bottom{bottom:0}.we-micro button:focus-visible{outline:2px solid var(--th-accent)}
.we-section [contenteditable=true]{outline:2px solid var(--th-accent);outline-offset:6px;cursor:text}
.we-grid{position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(to right,color-mix(in srgb,var(--th-accent) 8%,transparent) 0 calc(100%/12 - 16px),transparent calc(100%/12 - 16px) calc(100%/12));z-index:1}
.we-collaborator-cursor{position:absolute;z-index:8;pointer-events:none;display:flex;align-items:flex-start;gap:4px;color:var(--th-season);font:700 12px var(--th-body-render);transform:translate(-2px,-2px)}.we-collaborator-cursor>span:first-child{font-size:24px;line-height:1}.we-collaborator-cursor>span:last-child{background:var(--th-season);color:var(--th-on-season);padding:4px 7px;border-radius:var(--th-r);white-space:nowrap}.we-layout-handles{position:absolute;inset:0;pointer-events:none;z-index:6}.we-layout-handles button{pointer-events:auto;position:absolute;width:26px;height:26px;background:var(--ed-field);border:1px solid var(--th-accent);color:var(--th-text);cursor:grab;touch-action:none}.we-move-handle{top:0;left:0}.we-resize-handle{bottom:0;right:0;cursor:ew-resize!important}.we-pin{position:absolute;right:12%;top:25%;z-index:6;display:grid;place-items:center;width:30px;height:30px;border-radius:50% 50% 50% 0;background:var(--th-accent);color:var(--th-on-accent);border:1px solid var(--th-muted);font:800 12px var(--th-body-render);cursor:pointer}
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
  onSelect: (id: string) => void; onEdit: (id: string, field: string, value: string) => void
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
  const [textTarget, setTextTarget] = useState<{ id: string; field: string; node: HTMLElement } | null>(null)
  useEffect(() => {
    if (!mount || mount.ownerDocument !== frame.current?.contentDocument || !mount.ownerDocument.defaultView || !selectedId || preview || textTarget || !onDisplay) return
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
        event.preventDefault(); event.stopPropagation(); button.setPointerCapture(event.pointerId)
        const original = root.style.paddingBlock
        let next = display.padding ?? 0
        const move = (e: PointerEvent) => { next = snapSectionSpacing((display.padding ?? 0) + (e.clientY - event.clientY) * (edge === 'top' ? -1 : 1)); root.style.paddingBlock = `${next}px`; button.setAttribute('aria-valuetext', `${next} pixels`) }
        const stop = () => { mount.ownerDocument.removeEventListener('pointermove', move); mount.ownerDocument.removeEventListener('pointerup', end); mount.ownerDocument.removeEventListener('pointercancel', cancel); if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId) }
        const end = () => { stop(); root.style.paddingBlock = original; onDisplay(selectedId, { ...display, padding: next }) }
        const cancel = () => { stop(); root.style.paddingBlock = original }
        mount.ownerDocument.addEventListener('pointermove', move); mount.ownerDocument.addEventListener('pointerup', end, { once: true }); mount.ownerDocument.addEventListener('pointercancel', cancel, { once: true }); cleanup.push(cancel)
      }
      const keyboard = (e: KeyboardEvent) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); onDisplay(selectedId, { ...display, padding: SECTION_SPACING_STEPS[Math.min(SECTION_SPACING_STEPS.length - 1, Math.max(0, SECTION_SPACING_STEPS.findIndex((value) => value === snapSectionSpacing(display.padding ?? 0)) + (e.key === 'ArrowUp' ? 1 : -1)))] }) } }
      button.addEventListener('pointerdown', start); button.addEventListener('keydown', keyboard); section!.appendChild(button)
      cleanup.push(() => { button.removeEventListener('pointerdown', start); button.removeEventListener('keydown', keyboard); button.remove() })
    }
    for (const grid of root.querySelectorAll<HTMLElement>(EDITABLE_GRIDS)) {
      const children = Array.from(grid.children).filter((node): node is HTMLElement => node.nodeType === 1 && node.namespaceURI === 'http://www.w3.org/1999/xhtml' && !node.classList.contains('we-layout-handles') && !['STYLE', 'SCRIPT', 'LINK'].includes(node.tagName))
      if (children.length < 2) continue
      const originalGridStyle = grid.style.gridTemplateColumns
      cleanup.push(() => { grid.style.gridTemplateColumns = originalGridStyle })
      for (const child of children) {
        const path: number[] = []
        let current: HTMLElement | null = child
        while (current && current !== root) { const parent: HTMLElement | null = current.parentElement; if (!parent) break; path.unshift(Array.from(parent.children).indexOf(current)); current = parent }
        const key = path.join('.')
        const controls = mount.ownerDocument.createElement('div')
        controls.className = 'we-layout-handles'
        const originalStyle = { position: child.style.position, column: child.style.gridColumn, row: child.style.gridRow }
        cleanup.push(() => { child.style.position = originalStyle.position; child.style.gridColumn = originalStyle.column; child.style.gridRow = originalStyle.row })
        child.style.position ||= 'relative'
        for (const resize of [false, true]) {
          const button = mount.ownerDocument.createElement('button')
          button.type = 'button'; button.className = resize ? 'we-resize-handle' : 'we-move-handle'
          button.setAttribute('aria-label', resize ? 'Resize block on 12-column grid' : 'Move block on 12-column grid')
          button.textContent = resize ? '↔' : '⠿'
          const down = (event: PointerEvent) => {
            event.preventDefault(); event.stopPropagation()
            button.setPointerCapture(event.pointerId)
            const bounds = grid.getBoundingClientRect()
            const unit = Math.max(1, bounds.width / 12)
            const baseline: NonNullable<SectionDisplay['placements']> = { ...display.placements }
            const siblingStyles = children.map((node) => ({ node, column: node.style.gridColumn, row: node.style.gridRow }))
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
              const placement = baseline[siblingKey] ?? { column, span: Math.min(13 - column, Math.max(1, Math.round(rect.width / unit))), row: siblingRows.get(sibling) ?? 1 }
              baseline[siblingKey] = placement
              sibling.style.gridColumn = `${placement.column} / span ${placement.span}`; sibling.style.gridRow = String(placement.row)
            }
            const initial = baseline[key]
            let next = initial
            const move = (e: PointerEvent) => {
              const delta = Math.round((e.clientX - event.clientX) / unit)
              next = resize ? { ...initial, span: Math.min(13 - initial.column, Math.max(1, initial.span + delta)) } : { ...initial, column: Math.min(13 - initial.span, Math.max(1, initial.column + delta)), row: Math.max(1, Math.min(100, initial.row + Math.round((e.clientY - event.clientY) / 48))) }
              grid.style.gridTemplateColumns = 'repeat(12,minmax(0,1fr))'
              child.style.gridColumn = `${next.column} / span ${next.span}`; child.style.gridRow = String(next.row)
            }
            const stop = () => { mount.ownerDocument.removeEventListener('pointermove', move); mount.ownerDocument.removeEventListener('pointerup', end); mount.ownerDocument.removeEventListener('pointercancel', cancel); if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId) }
            const end = () => { stop(); onDisplay(selectedId, { ...display, placements: { ...baseline, [key]: next } }) }
            const cancel = () => { stop(); grid.style.gridTemplateColumns = originalGridStyle; for (const original of siblingStyles) { original.node.style.gridColumn = original.column; original.node.style.gridRow = original.row } }
            mount.ownerDocument.addEventListener('pointermove', move); mount.ownerDocument.addEventListener('pointerup', end, { once: true }); mount.ownerDocument.addEventListener('pointercancel', cancel, { once: true })
            cleanup.push(stop)
          }
          button.addEventListener('pointerdown', down)
          controls.appendChild(button)
          cleanup.push(() => button.removeEventListener('pointerdown', down))
        }
        child.appendChild(controls); cleanup.push(() => controls.remove())
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
  function editText(event: MouseEvent<HTMLElement>, block: ContentItem) {
    if (preview || editing.current) return
    const target = (event.target as HTMLElement).closest<HTMLElement>('h1,h2,h3,h4,p')
    if (!target) return
    const siblings = Array.from(target.parentElement?.querySelectorAll<HTMLElement>(target.tagName) ?? [target]).filter((node) => node.className === target.className && inlineTextValue(node.textContent ?? '') === inlineTextValue(target.textContent ?? ''))
    const occurrence = Math.max(0, siblings.indexOf(target))
    const schema = config.components[block.type]?.fields ?? {}
    const fields = { ...schema }
    const aliasFields: Record<string, [string, string]> = { Heading: ['title', 'text'], DisplayHeading: ['text', 'title'], Text: ['body', 'text'], Prose: ['text', 'body'] }
    const alias = aliasFields[block.type]
    if (alias && typeof block.props[alias[0]] !== 'string' && typeof block.props[alias[1]] === 'string') fields[alias[1]] = { type: 'textarea' }
    const variants = block.type === 'EditorialSection' ? ['lead', 'prose', 'faq', 'stats'] : block.type === 'Zigzag' ? ['lead', 'list', 'quote'] : null
    if (variants && typeof block.props.body === 'string' && !variants.includes(block.props.body)) fields.body = { type: 'textarea' }
    const match = findInlineTextMatch(block.props, fields, target.textContent ?? '', occurrence)
    if (!match) return
    const { field } = match
    event.preventDefault(); event.stopPropagation()
    editing.current = target
    setTextTarget({ id: block.props.id!, field, node: target })
    const original = String(block.props[field])
    const originalHTML = target.innerHTML
    let canceled = false
    target.contentEditable = 'true'; target.focus()
    const end = () => {
      target.contentEditable = 'false'; editing.current = null; setTextTarget(null)
      target.removeEventListener('keydown', key)
      const edited = /<[^>]+>/.test(original) ? sanitizeInlineHtml(target.innerHTML) : inlineMarkdown(target)
      const next = replaceInlineTextSegment(original, match, edited)
      if (!canceled && target.innerHTML !== originalHTML && next !== original) onEdit(block.props.id!, field, next)
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { canceled = true; target.innerHTML = originalHTML; target.blur() }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); target.blur() }
    }
    target.addEventListener('keydown', key)
    target.addEventListener('blur', end, { once: true })
  }
  const wrap = preview ? undefined : (node: ReactNode, indexes: number[]) => {
    const block = doc.content[indexes[0]]
    const id = block.props.id!
    const selected = id === selectedId
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
        onClick={(e) => { if (e.shiftKey && onCommentPin) { e.preventDefault(); const bounds = e.currentTarget.getBoundingClientRect(); onSelect(id); onCommentPin(id, { x: Math.min(1, Math.max(0, (e.clientX - bounds.left) / Math.max(1, bounds.width))), y: Math.min(1, Math.max(0, (e.clientY - bounds.top) / Math.max(1, bounds.height))) }); return } if ((e.target as HTMLElement).closest('a,button')) e.preventDefault(); onSelect(id); for (const index of indexes) editText(e, doc.content[index]) }}
        onKeyDown={(e) => { if ((e.target as HTMLElement).isContentEditable) return; if (e.key === 'Enter') onSelect(id); if (e.altKey && ['ArrowUp', 'ArrowDown'].includes(e.key)) { e.preventDefault(); onAction(id, e.key === 'ArrowUp' ? 'up' : 'down') } }}>
        <button type="button" className="we-section-label" aria-label={`Drag ${label} to reorder sections`} draggable={!!onReorder} onClick={(e) => { e.stopPropagation(); onSelect(id) }} onDragStart={(e) => { draggingSections.current = indexes.map((index) => doc.content[index].props.id!); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', label) }} onDragEnd={() => { draggingSections.current = []; for (const target of mount?.querySelectorAll<HTMLElement>('[data-drop-target=true]') ?? []) target.dataset.dropTarget = 'false' }}><GripVertical size={12} aria-hidden />{label}{sectionDeviceLayout(doc, id, device).hidden && ' · Hidden on this device'}</button>
        {selected && !textTarget && <div className="we-micro" role="toolbar" aria-label={`${label} section controls`} onClick={(e) => e.stopPropagation()}>
          <button type="button" title="Move up" aria-label="Move up" disabled={indexes[0] === 0} onClick={() => onAction(id, 'up')}><ArrowUp size={15} /></button>
          <button type="button" title="Move down" aria-label="Move down" disabled={indexes.at(-1) === doc.content.length - 1} onClick={() => onAction(id, 'down')}><ArrowDown size={15} /></button>
          <button type="button" title="Duplicate" aria-label="Duplicate" onClick={() => onAction(id, 'copy')}><Copy size={15} /></button>
          <button type="button" title="Comment" aria-label="Comment" onClick={() => onCommentPin ? onCommentPin(id, { x: .5, y: .5 }) : onAction(id, 'comment')}><MessageSquare size={15} /></button>
          <button type="button" title="Delete" aria-label="Delete" onClick={() => onAction(id, 'delete')}><Trash2 size={15} /></button>
        </div>}
        {selected && !!textTarget && indexes.some((index) => doc.content[index].props.id === textTarget.id) && <div className="we-micro" role="toolbar" aria-label="Text controls" onMouseDown={(e) => e.preventDefault()} onClick={(e) => e.stopPropagation()}>
          <button type="button" title="Bold" aria-label="Bold" onClick={() => textTarget.node.ownerDocument.execCommand('bold')}><Bold size={15} /></button>
          <button type="button" title="Italic" aria-label="Italic" onClick={() => textTarget.node.ownerDocument.execCommand('italic')}><Italic size={15} /></button>
          <button type="button" title="Align text" aria-label="Align text" onClick={() => { const node = textTarget.node; const value = sectionDeviceLayout(doc, id, device); const align = value.align === 'center' ? 'left' : 'center'; node.style.textAlign = align; onDisplay?.(id, { ...value, align }) }}><AlignLeft size={15} /></button>
          <button type="button" title="Link" aria-label="Link" onClick={() => { const url = window.prompt('Link URL'); if (url && /^https?:\/\//.test(url)) textTarget.node.ownerDocument.execCommand('createLink', false, url) }}><Link size={15} /></button>
          <details className="we-typography"><summary role="button" title="Typography" aria-label="Typography"><Type size={15} /></summary><div className="we-typography-panel">
            <span>Typeface</span><div role="group" aria-label="Text typeface">{(['display','body','mono'] as const).map((font) => <button type="button" key={font} title={`Theme ${font}`} aria-label={`Theme ${font} typeface`} onClick={() => onDisplay?.(id, { ...sectionDeviceLayout(doc, id, device), [/^H[1-6]$/.test(textTarget.node.tagName) ? 'textFont' : 'bodyFont']: font })}>{font}</button>)}</div>
            <span>Text size</span><div role="group" aria-label="Inline text size" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)' }}>{[0,16,20,24,32,40,48,56,64,80,96,120].map((size) => <button type="button" key={size} aria-label={size ? `${size} pixels` : 'Theme size'} onClick={() => onDisplay?.(id, { ...sectionDeviceLayout(doc, id, device), [/^H[1-6]$/.test(textTarget.node.tagName) ? 'textSize' : 'bodySize']: size })}>{size || 'Auto'}</button>)}</div><button type="button" aria-label="Done editing" onClick={() => textTarget.node.blur()}>Done</button>
          </div></details>
        </div>}
        {selected && !textTarget && <div className="we-grid" aria-hidden />}
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
