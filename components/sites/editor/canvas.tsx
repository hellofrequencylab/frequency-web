'use client'

import { useState, useRef, useEffect, type ReactNode, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { ArrowUp, ArrowDown, Copy, MessageSquare, Trash2, GripVertical, Bold, Italic, Link, AlignLeft, Check } from 'lucide-react'
import type { Config, Metadata, Data, ContentItem } from '@/lib/page-editor/types'
import type { MwLive } from '@/lib/sites/menswork-data'
import type { SiteLinkMap } from '@/lib/sites/house-theme'
import { mensworkSeason } from '@/lib/theme/menswork'
import { websiteThemeVars, WEBSITE_TOKEN_CSS } from '@/lib/sites/editor/theme'
import { EDITABLE_GRIDS, sectionDeviceLayout } from '@/lib/sites/editor/layout'
import type { WebsiteTheme, Device, SiteComment, SectionDisplay, WebsitePresence } from '@/lib/sites/editor/state'
import { WebsiteDocument } from '../website-document'
import { SiteChrome } from '../site-chrome'

const CANVAS_CSS = `
html,body{margin:0;min-height:100%;}body{background:var(--th-bg)}
.we-canvas-root{padding-bottom:160px}.we-section{position:relative;outline:0;min-height:36px}
.we-section[data-selected=true]{outline:2px solid var(--th-accent);outline-offset:-2px}
.we-section:focus-visible{outline:2px solid var(--th-accent-text);outline-offset:-2px}
.we-section-label{position:absolute;right:12px;top:8px;z-index:4;font:600 11px var(--th-body);display:flex;gap:6px;align-items:center;padding:4px 8px;background:var(--ed-field);color:var(--th-secondary);border-radius:var(--th-r)}
.we-section:not(:hover):not([data-selected=true]) .we-section-label{opacity:0}
.we-micro{position:sticky;top:8px;display:flex;align-items:center;gap:2px;z-index:5;width:max-content;margin:0 auto -42px;padding:4px;background:var(--ed-field);border:1px solid var(--th-muted);color:var(--th-text);border-radius:var(--th-r)}
.we-micro button{display:grid;place-items:center;width:32px;height:32px;border:0;background:transparent;color:inherit;cursor:pointer}.we-micro button:hover{background:var(--ed-chrome)}.we-micro button:disabled{opacity:.3;cursor:default}
.we-micro button:focus-visible{outline:2px solid var(--th-accent)}
.we-section [contenteditable=true]{outline:2px solid var(--th-accent);outline-offset:6px;cursor:text}
.we-grid{position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(to right,color-mix(in srgb,var(--th-accent) 8%,transparent) 0 calc(100%/12 - 16px),transparent calc(100%/12 - 16px) calc(100%/12));z-index:1}
.we-collaborator-cursor{position:absolute;z-index:8;pointer-events:none;display:flex;align-items:flex-start;gap:4px;color:var(--th-season);font:700 12px var(--th-body);transform:translate(-2px,-2px)}.we-collaborator-cursor>span:first-child{font-size:24px;line-height:1}.we-collaborator-cursor>span:last-child{background:var(--th-season);color:var(--th-on-season);padding:4px 7px;border-radius:var(--th-r);white-space:nowrap}.we-layout-handles{position:absolute;inset:0;pointer-events:none;z-index:6}.we-layout-handles button{pointer-events:auto;position:absolute;width:26px;height:26px;background:var(--ed-field);border:1px solid var(--th-accent);color:var(--th-text);cursor:grab}.we-move-handle{top:0;left:0}.we-resize-handle{bottom:0;right:0;cursor:ew-resize!important}.we-pin{position:absolute;right:12%;top:25%;z-index:6;display:grid;place-items:center;width:30px;height:30px;border-radius:50% 50% 50% 0;background:var(--th-accent);color:var(--th-on-accent);border:1px solid var(--th-muted);font:800 12px var(--th-body);cursor:pointer}
.we-insert{display:block;width:100%;height:22px;border:0;background:transparent;color:var(--th-accent-text);font:600 12px var(--th-body);cursor:pointer}.we-insert:hover,.we-insert:focus-visible{background:color-mix(in srgb,var(--th-accent) 12%,transparent);outline:1px solid var(--th-accent)}
@media(pointer:coarse){.we-micro button{width:44px;height:44px}.we-section-label{opacity:1!important}.we-insert{height:44px}}
`

function inlineMarkdown(node: Node): string {
  if (node.nodeType === 3) return node.textContent ?? ''
  const element = node as HTMLElement
  const text = Array.from(node.childNodes).map(inlineMarkdown).join('')
  if (element.tagName === 'BR') return '\n'
  if (['B', 'STRONG'].includes(element.tagName)) return `**${text}**`
  if (['I', 'EM'].includes(element.tagName)) return `*${text}*`
  if (element.tagName === 'A') {
    const href = element.getAttribute('href') ?? ''
    return /^https?:\/\//.test(href) ? `[${text}](${href})` : text
  }
  return text
}

export function WebsiteCanvas({ doc, theme, device, config, metadata, live, links, nav, origin, title, brandName, logo, brandAccent, selectedId, preview, comments, onSelect, onEdit, onAction, onInsert, onDisplay, people = [], pageSlug = 'home', onCursor }: {
  doc: Data; theme: WebsiteTheme; device: Device; config: Config; metadata?: Metadata; live: MwLive; links: SiteLinkMap; origin: string
  title: string; brandName: string; logo?: string | null; brandAccent?: string | null
  nav: { slug: string; label: string }[]
  selectedId: string | null; preview: boolean; comments: SiteComment[]
  onSelect: (id: string) => void; onEdit: (id: string, field: string, value: string) => void
  onAction: (id: string, action: 'up' | 'down' | 'copy' | 'comment' | 'delete') => void
  people?: WebsitePresence[]; pageSlug?: string; onCursor?: (cursor: WebsitePresence['cursor']) => void
  onDisplay?: (id: string, value: SectionDisplay) => void
  onInsert: (index: number) => void
}) {
  const [mount, setMount] = useState<HTMLElement | null>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const editing = useRef<HTMLElement | null>(null)
  const cursorReportedAt = useRef(0)
  const [textTarget, setTextTarget] = useState<{ id: string; field: string; node: HTMLElement } | null>(null)
  useEffect(() => {
    if (!mount || !selectedId || preview || textTarget || !onDisplay) return
    const section = Array.from(mount.querySelectorAll<HTMLElement>('.we-section')).find((node) => node.dataset.blockId === selectedId)
    const root = section?.querySelector<HTMLElement>('.site-doc-section')
    if (!root) return
    const cleanup: (() => void)[] = []
    const display = sectionDeviceLayout(doc, selectedId, device)
    for (const grid of root.querySelectorAll<HTMLElement>(EDITABLE_GRIDS)) {
      const children = Array.from(grid.children).filter((node): node is HTMLElement => node instanceof mount.ownerDocument.defaultView!.HTMLElement)
      if (children.length < 2) continue
      for (const child of children) {
        const path: number[] = []
        let current: HTMLElement | null = child
        while (current && current !== root) { const parent: HTMLElement | null = current.parentElement; if (!parent) break; path.unshift(Array.from(parent.children).indexOf(current)); current = parent }
        const key = path.join('.')
        const controls = mount.ownerDocument.createElement('div')
        controls.className = 'we-layout-handles'
        child.style.position ||= 'relative'
        for (const resize of [false, true]) {
          const button = mount.ownerDocument.createElement('button')
          button.type = 'button'; button.className = resize ? 'we-resize-handle' : 'we-move-handle'
          button.setAttribute('aria-label', resize ? 'Resize block on 12-column grid' : 'Move block on 12-column grid')
          button.textContent = resize ? '↔' : '⠿'
          const down = (event: PointerEvent) => {
            event.preventDefault(); event.stopPropagation()
            const bounds = grid.getBoundingClientRect(), childBounds = child.getBoundingClientRect()
            const unit = bounds.width / 12
            const baseline: NonNullable<SectionDisplay['placements']> = { ...display.placements }
            const tops = [...new Set(children.map((sibling) => Math.round(sibling.getBoundingClientRect().top)))].sort((a, b) => a - b)
            for (const sibling of children) {
              const siblingPath: number[] = []
              let current: HTMLElement | null = sibling
              while (current && current !== root) { const parent: HTMLElement | null = current.parentElement; if (!parent) break; siblingPath.unshift(Array.from(parent.children).indexOf(current)); current = parent }
              const siblingKey = siblingPath.join('.'), rect = sibling.getBoundingClientRect()
              const column = Math.min(12, Math.max(1, Math.round((rect.left - bounds.left) / unit) + 1))
              const placement = baseline[siblingKey] ?? { column, span: Math.min(13 - column, Math.max(1, Math.round(rect.width / unit))), row: tops.indexOf(Math.round(rect.top)) + 1 }
              baseline[siblingKey] = placement
              sibling.style.gridColumn = `${placement.column} / span ${placement.span}`; sibling.style.gridRow = String(placement.row)
            }
            const initial = display.placements?.[key] ?? { column: Math.max(1, Math.round((childBounds.left - bounds.left) / unit) + 1), span: Math.max(1, Math.round(childBounds.width / unit)), row: 1 }
            let next = initial
            const move = (e: PointerEvent) => {
              const delta = Math.round((e.clientX - event.clientX) / unit)
              next = resize ? { ...initial, span: Math.min(13 - initial.column, Math.max(1, initial.span + delta)) } : { ...initial, column: Math.min(13 - initial.span, Math.max(1, initial.column + delta)), row: Math.max(1, Math.min(100, initial.row + Math.round((e.clientY - event.clientY) / 48))) }
              grid.style.gridTemplateColumns = 'repeat(12,minmax(0,1fr))'
              child.style.gridColumn = `${next.column} / span ${next.span}`; child.style.gridRow = String(next.row)
            }
            const end = () => { mount.ownerDocument.removeEventListener('pointermove', move); mount.ownerDocument.removeEventListener('pointerup', end); onDisplay(selectedId, { ...display, placements: { ...baseline, [key]: next } }) }
            mount.ownerDocument.addEventListener('pointermove', move); mount.ownerDocument.addEventListener('pointerup', end, { once: true })
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
  function attach() {
    const document = frame.current?.contentDocument
    if (!document) return
    document.documentElement.className = window.document.documentElement.className
    document.body.className = window.document.body.className
    for (const node of window.document.head.querySelectorAll('link[rel=stylesheet],style')) document.head.appendChild(node.cloneNode(true))
    const computed = getComputedStyle(window.document.documentElement)
    for (const key of Array.from(computed)) if (key.startsWith('--font-')) document.documentElement.style.setProperty(key, computed.getPropertyValue(key))
    setMount(document.body)
  }
  function editText(event: MouseEvent<HTMLElement>, block: ContentItem) {
    if (preview || editing.current) return
    const target = (event.target as HTMLElement).closest<HTMLElement>('h1,h2,h3,h4,p')
    if (!target) return
    const plain = (text: string) => text.replace(/<[^>]*>/g, '').replace(/\*/g, '').replace(/\s+/g, ' ').trim()
    const field = Object.entries(config.components[block.type]?.fields ?? {}).find(([key, def]) =>
      (def.type === 'text' || def.type === 'textarea') && typeof block.props[key] === 'string' && plain(block.props[key]) === plain(target.textContent ?? '') && plain(block.props[key]).length,
    )?.[0]
    if (!field) return
    event.preventDefault(); event.stopPropagation()
    editing.current = target
    setTextTarget({ id: block.props.id!, field, node: target })
    const original = target.textContent ?? ''
    target.contentEditable = 'true'; target.focus()
    const end = () => {
      target.contentEditable = 'false'; editing.current = null; setTextTarget(null)
      target.removeEventListener('keydown', key)
      const next = /<[^>]+>/.test(String(block.props[field])) ? target.innerHTML : inlineMarkdown(target)
      if (next !== original) onEdit(block.props.id!, field, next)
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { target.textContent = original; target.blur() }
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
      <section className="we-section" data-selected={selected} data-block-id={id} tabIndex={0} aria-label={label}
        onPointerMove={(e) => {
          if (!onCursor || Date.now() - cursorReportedAt.current < 100) return
          cursorReportedAt.current = Date.now()
          const bounds = e.currentTarget.getBoundingClientRect()
          onCursor({ pageSlug, blockId: id, x: Math.min(1, Math.max(0, (e.clientX - bounds.left) / Math.max(1, bounds.width))), y: Math.min(1, Math.max(0, (e.clientY - bounds.top) / Math.max(1, bounds.height))) })
        }}
        onPointerLeave={() => onCursor?.(null)}
        onClick={(e) => { if ((e.target as HTMLElement).closest('a,button')) e.preventDefault(); onSelect(id); for (const index of indexes) editText(e, doc.content[index]) }}
        onKeyDown={(e) => { if ((e.target as HTMLElement).isContentEditable) return; if (e.key === 'Enter') onSelect(id); if (e.altKey && ['ArrowUp', 'ArrowDown'].includes(e.key)) { e.preventDefault(); onAction(id, e.key === 'ArrowUp' ? 'up' : 'down') } }}>
        <span className="we-section-label"><GripVertical size={12} aria-hidden />{label}</span>
        {selected && !textTarget && <div className="we-micro" role="toolbar" aria-label={`${label} section controls`} onClick={(e) => e.stopPropagation()}>
          <button type="button" title="Move up" aria-label="Move up" disabled={indexes[0] === 0} onClick={() => onAction(id, 'up')}><ArrowUp size={15} /></button>
          <button type="button" title="Move down" aria-label="Move down" disabled={indexes.at(-1) === doc.content.length - 1} onClick={() => onAction(id, 'down')}><ArrowDown size={15} /></button>
          <button type="button" title="Duplicate" aria-label="Duplicate" onClick={() => onAction(id, 'copy')}><Copy size={15} /></button>
          <button type="button" title="Comment" aria-label="Comment" onClick={() => onAction(id, 'comment')}><MessageSquare size={15} /></button>
          <button type="button" title="Delete" aria-label="Delete" onClick={() => onAction(id, 'delete')}><Trash2 size={15} /></button>
        </div>}
        {selected && !!textTarget && indexes.some((index) => doc.content[index].props.id === textTarget.id) && <div className="we-micro" role="toolbar" aria-label="Text controls" onMouseDown={(e) => e.preventDefault()} onClick={(e) => e.stopPropagation()}>
          <button type="button" title="Bold" aria-label="Bold" onClick={() => textTarget.node.ownerDocument.execCommand('bold')}><Bold size={15} /></button>
          <button type="button" title="Italic" aria-label="Italic" onClick={() => textTarget.node.ownerDocument.execCommand('italic')}><Italic size={15} /></button>
          <button type="button" title="Align text" aria-label="Align text" onClick={() => { const node = textTarget.node; const value = sectionDeviceLayout(doc, id, device); const align = value.align === 'center' ? 'left' : 'center'; node.style.textAlign = align; onDisplay?.(id, { ...value, align }) }}><AlignLeft size={15} /></button>
          <button type="button" title="Link" aria-label="Link" onClick={() => { const url = window.prompt('Link URL'); if (url && /^https?:\/\//.test(url)) textTarget.node.ownerDocument.execCommand('createLink', false, url) }}><Link size={15} /></button>
          <button type="button" title="Done editing" aria-label="Done editing" onClick={() => textTarget.node.blur()}><Check size={15} /></button>
        </div>}
        {selected && !textTarget && <div className="we-grid" aria-hidden />}
        {node}
        {people.filter((person) => person.cursor?.pageSlug === pageSlug && person.cursor.blockId === id).map((person) => <div key={person.profileId} className="we-collaborator-cursor" aria-label={`${person.name} is editing this section`} style={{ left: `${Math.min(1, Math.max(0, person.cursor!.x)) * 100}%`, top: `${Math.min(1, Math.max(0, person.cursor!.y)) * 100}%` }}><span aria-hidden>↖</span><span>{person.name}</span></div>)}
        {!!pins.length && <button className="we-pin" type="button" aria-label={`Open ${pins.length} comments on ${label}`} onClick={(e) => { e.stopPropagation(); onAction(id, 'comment') }}>{pins.length}</button>}
      </section>
    </div>
  }
  return <iframe ref={frame} className="we-frame" title={`${title}, ${device} website canvas`} srcDoc="<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'></head><body></body></html>" sandbox="allow-same-origin" onLoad={attach}>
    {mount && createPortal(<div data-website-theme={theme} style={websiteThemeVars(theme, brandAccent)} className="we-canvas-root" onClickCapture={(e) => { if ((e.target as HTMLElement).closest('a')) e.preventDefault() }}>
      <style>{WEBSITE_TOKEN_CSS + CANVAS_CSS}</style>
      <SiteChrome brandName={brandName} homeHref="/" links={nav.map((p) => ({ label: p.label, href: p.slug === 'home' ? '/' : `/${p.slug}` }))} cta={null} themeFonts logoUrl={logo} skin={theme === 'Menswork' ? { theme: 'menswork', season: mensworkSeason(new Date()) } : null}>
        <WebsiteDocument doc={doc} theme={theme} config={config} metadata={metadata} live={live} links={links} origin={origin} title={title} wrapSection={wrap} />
        {!preview && <button className="we-insert" type="button" onClick={() => onInsert(doc.content.length)}>+ Add section</button>}
      </SiteChrome>
    </div>, mount)}
  </iframe>
}
