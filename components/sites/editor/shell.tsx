'use client'

/* eslint-disable @next/next/no-img-element -- website assets retain their original host and crop */

import { slugify } from '@/lib/utils'
import { Input, Textarea } from '@/components/ui/field'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode, type KeyboardEvent } from 'react'
import { ArrowUp, ArrowRight, ChevronDown, ChevronLeft, ChevronRight, FileText, Globe, Layers, MessageSquare, Monitor, Palette, Plus, Radio, Redo2, Search, Settings2, Smartphone, Sparkles, Tablet, Undo2, X } from 'lucide-react'
import type { Config, Data, Metadata } from '@/lib/page-editor/types'
import { addBlock, buildOutline, derivePickerGroups, duplicateBlockDeep, findBlockDeep, moveBlockTo, nudgeBlock, removeBlockDeep, updateBlockPropsDeep } from '@/components/page-editor/mobile/data-ops'
import { websiteThemeVars, WEBSITE_TOKEN_CSS } from '@/lib/sites/editor/theme'
import { WEBSITE_PAGE_TEMPLATES, websiteTemplateSections } from '@/lib/sites/editor/templates'
import { WEBSITE_THEMES, RESERVED_WEBSITE_SLUGS, resolveWebsiteBrand, updateSectionDisplay, type WebsiteSnapshot, type WebsiteEditorState, type Device, type WebsitePresence, type SectionDisplay } from '@/lib/sites/editor/state'
import type { MwLive } from '@/lib/sites/menswork-data'
import type { SiteLinkMap } from '@/lib/sites/house-theme'
import { LoomPicker } from '@/components/loom/loom-picker'
import dynamic from 'next/dynamic'
const WebsiteCanvas = dynamic(() => import('./canvas').then((module) => module.WebsiteCanvas), { ssr: false })
import { WebsiteInspector } from './inspector'
import './editor.css'

type Panel = 'inspect' | 'comments' | 'seo'
type Tab = 'Pages' | 'Layers' | 'Add' | 'Theme'
type Proposal = { pageSlug: string; blockId: string; field: string; before: string; after: string }
type SaveResult = { ok: true; state: WebsiteEditorState } | { ok: false; error: string; conflict?: boolean }
export interface WebsiteEditorShellProps {
  host: string; brandName: string; logo?: string | null; brandAccent?: string | null; author: string
  initial: WebsiteEditorState; config: Config; metadata?: Metadata; live: MwLive; links: SiteLinkMap; origin: string
  onSave: (revision: number, draft: WebsiteSnapshot, publish: boolean, scheduledAt?: string) => Promise<SaveResult>
  onPresence?: (cursor: WebsitePresence['cursor']) => Promise<{ ok: true; people: WebsitePresence[] } | { ok: false; error: string }>
  onPropose?: (request: string, value: string) => Promise<{ ok: true; text: string } | { ok: false; error: string }>
}
function readMobileViewport() { return window.matchMedia('(max-width:767px)').matches }
function subscribeViewport(callback: () => void) {
  const query = window.matchMedia('(max-width:767px)')
  query.addEventListener('change', callback)
  return () => query.removeEventListener('change', callback)
}

const TABS: { label: Tab; icon: typeof FileText }[] = [{ label: 'Pages', icon: FileText }, { label: 'Layers', icon: Layers }, { label: 'Add', icon: Plus }, { label: 'Theme', icon: Palette }]
const DEVICES: { id: Device; icon: typeof Monitor; label: string }[] = [{ id: 'desktop', icon: Monitor, label: 'Desktop' }, { id: 'tablet', icon: Tablet, label: 'Tablet' }, { id: 'phone', icon: Smartphone, label: 'Phone' }]

function Dialog({ label, children }: { label: string; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const node = root.current
    node?.querySelector<HTMLElement>('button,input,select,textarea,[tabindex="0"]')?.focus()
    return () => previous?.focus()
  }, [])
  function trap(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Tab') return
    const items = Array.from(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]') ?? [])
    const first = items[0], last = items[items.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }
  return <div ref={root} className="we-modal" role="dialog" aria-modal="true" aria-label={label} onKeyDown={trap} onClick={(event) => event.stopPropagation()}>{children}</div>
}

function Icon({ label, children, className = '', ...props }: { label: string; children: ReactNode; className?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={`we-icon ${className}`} aria-label={label} title={label} {...props}>{children}</button>
}

export function WebsiteEditorShell({ host, brandName, logo, brandAccent, author, initial, config, metadata, live, links, origin, onSave, onPropose, onPresence }: WebsiteEditorShellProps) {
  const [people, setPeople] = useState<WebsitePresence[]>([])
  const cursor = useRef<WebsitePresence['cursor']>(null)
  useEffect(() => {
    if (!onPresence) return
    let active = true
    let running = false
    async function sync() {
      if (running || document.hidden) return
      running = true
      try { const result = await onPresence!(cursor.current); if (active && result.ok) setPeople(result.people) } catch { /* Presence expires automatically when a connection drops. */ } finally { running = false }
    }
    void sync()
    const timer = window.setInterval(() => void sync(), 5000)
    return () => { active = false; window.clearInterval(timer) }
  }, [onPresence])
  const [draft, setDraft] = useState(initial.draft)
  const [choosingLogo, setChoosingLogo] = useState(false)
  const websiteBrand = resolveWebsiteBrand(draft, { logo, accent: brandAccent })
  const activeLogo = websiteBrand.logo
  const activeAccent = draft.theme === 'Menswork' ? websiteBrand.accent : draft.brand?.accent
  const accentValue = String(websiteThemeVars(draft.theme, activeAccent)['--th-accent' as keyof React.CSSProperties])
  const colorInputValue = /^#[0-9a-f]{3}$/i.test(accentValue) ? `#${accentValue.slice(1).split('').map((part) => part + part).join('')}` : accentValue
  const latest = useRef(initial.draft)
  const revision = useRef(initial.revision)
  const saved = useRef(JSON.stringify(initial.draft))
  const busy = useRef(false)
  const [persisted, setPersisted] = useState(initial)
  const [status, setStatus] = useState<'saved' | 'saving' | 'unsaved' | 'error' | 'conflict'>('saved')
  const [error, setError] = useState('')
  const [pageSlug, setPageSlug] = useState('home')
  const [selectedId, setSelectedId] = useState<string | null>(initial.draft.pages[0]?.doc.content[0]?.props.id ?? null)
  const [tab, setTab] = useState<Tab>('Layers')
  const [panel, setPanel] = useState<Panel>('inspect')
  const isMobile = useSyncExternalStore(subscribeViewport, readMobileViewport, () => false)
  const [leftChoice, setLeft] = useState<boolean | null>(null)
  const [rightChoice, setRight] = useState<boolean | null>(null)
  const [deviceChoice, setDevice] = useState<Device | null>(null)
  const left = leftChoice ?? !isMobile
  const right = rightChoice ?? !isMobile
  const device = deviceChoice ?? (isMobile ? 'phone' : 'desktop')
  const [preview, setPreview] = useState(false)
  const [modal, setModal] = useState<'publish' | 'templates' | 'insert' | null>(null)
  const [filter, setFilter] = useState('')
  const [insertAt, setInsertAt] = useState<number | null>(null)
  const [pageName, setPageName] = useState('')
  const [publishWhen, setPublishWhen] = useState<'now' | 'schedule'>('now')
  const [scheduledAt, setScheduledAt] = useState('')
  const [comment, setComment] = useState('')
  const [pinPosition, setPinPosition] = useState<{ blockId: string; x: number; y: number } | null>(null)
  const [replies, setReplies] = useState<Record<string, string>>({})
  const [request, setRequest] = useState('')
  const [thread, setThread] = useState(false)
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [veraStatus, setVeraStatus] = useState('')
  const [asking, setAsking] = useState(false)
  const history = useRef<WebsiteSnapshot[]>([])
  const future = useRef<WebsiteSnapshot[]>([])
  const [historyCounts, setHistoryCounts] = useState({ past: 0, future: 0 })
  const snapshotKey = JSON.stringify(draft)
  const page = draft.pages.find((p) => p.slug === pageSlug) ?? draft.pages[0]
  const selected = selectedId ? findBlockDeep(page.doc, config, selectedId) : null
  const outline = useMemo(() => buildOutline(page.doc, config), [page.doc, config])
  const groups = useMemo(() => derivePickerGroups(config, page.doc, 'website'), [page.doc, config])
  const activeComments = page.comments.filter((c) => !c.resolved)
  const changedPages = draft.pages.filter((p) => {
    const published = persisted.published?.pages.find((b) => b.slug === p.slug)
    return !published || JSON.stringify({ ...p, comments: [] }) !== JSON.stringify(published)
  })
  const brandChanged = JSON.stringify(draft.brand) !== JSON.stringify(persisted.published?.brand)
  const dirty = changedPages.length > 0 || draft.theme !== persisted.published?.theme || brandChanged

  const commit = useCallback((next: WebsiteSnapshot) => {
    if (JSON.stringify(next) === JSON.stringify(latest.current)) return
    history.current = [...history.current.slice(-29), latest.current]
    future.current = []
    setDraft(next); latest.current = next; setStatus('unsaved'); setHistoryCounts({ past: history.current.length, future: future.current.length })
  }, [])
  function updateDoc(doc: Data) { commit({ ...latest.current, pages: latest.current.pages.map((p) => p.slug === page.slug ? { ...p, doc, comments: p.comments.filter((comment) => !!findBlockDeep(doc, config, comment.blockId)) } : p) }) }
  const updateDisplay = useCallback((id: string, value: SectionDisplay | null) => {
    const current = latest.current
    commit({ ...current, pages: current.pages.map((p) => p.slug === page.slug ? { ...p, doc: updateSectionDisplay(p.doc, id, device, value) } : p) })
  }, [page.slug, device, commit])
  function editProps(id: string, props: Record<string, unknown>) { updateDoc(updateBlockPropsDeep(page.doc, config, id, props)) }
  function travel(redo: boolean) {
    const stack = redo ? future.current : history.current
    const next = stack.pop()
    if (!next) return
    if (redo) history.current.push(latest.current); else future.current.push(latest.current)
    setDraft(next); latest.current = next; setStatus('unsaved'); setHistoryCounts({ past: history.current.length, future: future.current.length })
  }
  const save = useCallback(async (publish = false, schedule?: string) => {
    if (busy.current) return
    busy.current = true
    const captured = latest.current
    setStatus('saving'); setError('')
    try {
      const result = await onSave(revision.current, captured, publish, schedule)
      if (!result.ok) { setStatus(result.conflict ? 'conflict' : 'error'); setError(result.error); return }
      revision.current = result.state.revision
      saved.current = JSON.stringify(captured)
      setPersisted(result.state)
      setStatus(JSON.stringify(latest.current) === saved.current ? 'saved' : 'unsaved')
      if (publish || schedule) setModal(null)
    } catch { setStatus('error'); setError('Could not reach your website. Your changes are still here. Try saving again.') }
    finally { busy.current = false }
  }, [onSave])
  useEffect(() => {
    if (status !== 'unsaved' || snapshotKey === saved.current) return
    const timer = setTimeout(() => { void save() }, 700)
    return () => clearTimeout(timer)
  }, [snapshotKey, status, save])
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => { if (JSON.stringify(latest.current) !== saved.current) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [])
  function select(id: string) { setSelectedId(id); setPanel('inspect'); setRight(true) }
  function insert(index: number) { setInsertAt(index); setFilter(''); setModal('insert') }
  function pickBlock(type: string) {
    const added = addBlock(page.doc, config, type)
    if (!added.id) return
    const doc = insertAt === null ? added.data : moveBlockTo(added.data, config, added.id, { parentId: null, slotKey: null, index: insertAt })
    updateDoc(doc); select(added.id); setModal(null); setInsertAt(null)
  }
  function action(id: string, kind: 'up' | 'down' | 'copy' | 'comment' | 'delete') {
    if (kind === 'comment') { setSelectedId(id); setPanel('comments'); setRight(true); return }
    if (kind === 'up' || kind === 'down') updateDoc(nudgeBlock(page.doc, config, id, kind === 'up' ? -1 : 1))
    if (kind === 'copy') { const next = duplicateBlockDeep(page.doc, config, id); updateDoc(next.data); if (next.id) select(next.id) }
    if (kind === 'delete') { updateDoc(removeBlockDeep(page.doc, config, id).data); setSelectedId(null) }
  }
  function reorderSections(ids: string[], targetId: string) {
    const content = page.doc.content
    const moving = content.filter((block) => ids.includes(block.props.id!))
    const remaining = content.filter((block) => !ids.includes(block.props.id!))
    const target = remaining.findIndex((block) => block.props.id === targetId)
    if (!moving.length || target < 0) return
    updateDoc({ ...page.doc, content: [...remaining.slice(0, target), ...moving, ...remaining.slice(target)] })
  }
  function pickPage(slug: string) { setPageSlug(slug); setSelectedId(null); setPanel('inspect'); if (window.matchMedia('(max-width:767px)').matches) setLeft(false) }
  function keys(e: KeyboardEvent) {
    const target = e.target as HTMLElement
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void save(); return }
    if (e.key === 'Escape') { setModal(null); setPreview(false); return }
    if (target.closest('input,textarea,select,[contenteditable=true]')) return
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); travel(e.shiftKey) }
    if (e.key === '/') { e.preventDefault(); insert(page.doc.content.length) }
  }
  function newPage(template: string) {
    const label = pageName.trim()
    if (!label) return
    const slug = slugify(label).slice(0, 64).replace(/-+$/, '')
    if (!slug || draft.pages.some((p) => p.slug === slug) || RESERVED_WEBSITE_SLUGS.has(slug)) { setError('Choose a page name that is not already used.'); return }
    const sections = websiteTemplateSections(draft.theme, template)
    let doc: Data = { root: {}, content: [] }
    for (const section of sections) {
      const added = addBlock(doc, config, section.type)
      doc = added.id && section.props ? updateBlockPropsDeep(added.data, config, added.id, section.props) : added.data
    }
    if (doc.content[0]) doc.content[0] = { ...doc.content[0], props: { ...doc.content[0].props, title: label } }
    commit({ ...draft, pages: [...draft.pages, { slug, label, doc, seo: { title: '', description: '' }, comments: [] }] })
    setPageName(''); setError(''); setModal(null); pickPage(slug)
  }
  function addComment() {
    if (!comment.trim() || !selectedId) return
    const added = { id: crypto.randomUUID(), blockId: selectedId, x: pinPosition?.blockId === selectedId ? pinPosition.x : 0.5, y: pinPosition?.blockId === selectedId ? pinPosition.y : 0.5, text: comment.trim().slice(0, 2000), author, createdAt: new Date().toISOString(), resolved: false }
    commit({ ...draft, pages: draft.pages.map((p) => p.slug === page.slug ? { ...p, comments: [...p.comments, added] } : p) }); setComment(''); setPinPosition(null)
  }
  function replyToComment(id: string) {
    const body = replies[id]?.trim()
    if (!body) return
    const reply = { id: crypto.randomUUID(), body: body.slice(0, 2000), author, createdAt: new Date().toISOString() }
    commit({ ...draft, pages: draft.pages.map((p) => p.slug === page.slug ? { ...p, comments: p.comments.map((c) => c.id === id && (c.replies?.length ?? 0) < 100 ? { ...c, replies: [...(c.replies ?? []), reply] } : c) } : p) })
    setReplies((previous) => ({ ...previous, [id]: '' }))
  }
  async function askVera(text = request) {
    if (text.trim().startsWith('/')) { setRequest(''); insert(page.doc.content.length); return }
    if (!text.trim() || asking) return
    setThread(true); setVeraStatus(''); setRequest('')
    const field = selected && Object.entries(config.components[selected.type]?.fields ?? {}).find(([k, f]) => (f.type === 'textarea' || f.type === 'text') && typeof selected.props[k] === 'string' && selected.props[k].length > 30)?.[0]
    if (!selected || !selectedId || !field) { setVeraStatus('Select a section with text first. I can propose a rewrite for you to review.'); return }
    if (!onPropose) { setVeraStatus('Vera is not connected for this website yet.'); return }
    setAsking(true)
    try {
      const before = String(selected.props[field])
      const result = await onPropose(text, before)
      if (result.ok) { setProposal({ pageSlug: page.slug, blockId: selectedId, field, before, after: result.text }); setVeraStatus('Here is a proposed change. It stays in your draft until you publish.') }
      else setVeraStatus(result.error)
    } catch { setVeraStatus('Vera could not reply. Try again in a moment.') }
    finally { setAsking(false) }
  }
  function applyProposal() {
    if (!proposal) return
    const target = draft.pages.find((p) => p.slug === proposal.pageSlug)
    const block = target && findBlockDeep(target.doc, config, proposal.blockId)
    if (!target || block?.props[proposal.field] !== proposal.before) { setVeraStatus('That text has changed. Ask for a new proposal before applying.'); return }
    commit({ ...draft, pages: draft.pages.map((p) => p.slug === target.slug ? { ...p, doc: updateBlockPropsDeep(p.doc, config, proposal.blockId, { [proposal.field]: proposal.after }) } : p) })
    setProposal(null); setVeraStatus('Applied to your draft. Undo is available above.')
  }
  const palette = <>
    <label className="we-field"><span className="sr-only">Filter sections</span><Input variant="seamless" className="we-search" placeholder="Type to filter sections" value={filter} onChange={(e) => setFilter(e.target.value)} /></label>
    {groups.map((group) => <div key={group.key}><div className="we-caption">{group.title}</div>{group.items.filter((c) => c.label.toLowerCase().includes(filter.toLowerCase())).map((c) => <button key={c.type} type="button" className="we-row" disabled={c.disabled} onClick={() => pickBlock(c.type)}><span>{/^(Space|Live)/.test(c.type) ? <Radio size={16} /> : <Plus size={16} />}</span><span>{c.label}</span></button>)}</div>)}
  </>
  return <div data-editor-root data-website-theme={draft.theme} style={websiteThemeVars(draft.theme, activeAccent)} className="we-shell" data-left-folded={!left} data-right-folded={!right} data-preview={preview} onKeyDown={keys}>
    <style>{WEBSITE_TOKEN_CSS}</style>
    <header className="we-top">
      <div className="we-brand">{activeLogo && <img className="we-logo" src={activeLogo} alt="" />}<div><strong>{brandName}</strong><small>{host}</small></div></div>
      <button type="button" className="we-page-pick" onClick={() => { setLeft(true); setTab('Pages') }}><FileText size={14} aria-hidden />{page.label}<ChevronDown size={13} aria-hidden /></button>
      <span className="we-save" role="status">{status === 'saving' ? 'Saving draft…' : status === 'saved' ? `Draft · ${changedPages.length} changed ${changedPages.length === 1 ? 'page' : 'pages'}${brandChanged ? ' · brand updated' : draft.theme !== persisted.published?.theme ? ' · theme updated' : ''}` : status === 'unsaved' ? 'Unsaved changes' : 'Draft needs attention'}</span>
      <span className="we-spacer" />
      <div className="we-device" aria-label="Preview width">{DEVICES.map(({ id, icon: DeviceIcon, label }) => <Icon key={id} label={label} aria-pressed={device === id} onClick={() => setDevice(id)}><DeviceIcon size={15} aria-hidden /></Icon>)}</div>
      <Icon label="Undo" className="we-history" disabled={!historyCounts.past} onClick={() => travel(false)}><Undo2 size={17} aria-hidden /></Icon>
      <Icon label="Redo" className="we-history" disabled={!historyCounts.future} onClick={() => travel(true)}><Redo2 size={17} aria-hidden /></Icon>
      <div className="we-presence" title={`${author} · editing`}><span className="we-avatar">{author.split(' ').slice(0, 2).map((n) => n[0]).join('')}</span>{people.map((person) => <span key={person.profileId} className="we-avatar" title={`${person.name} · editing`}>{person.name.split(' ').slice(0, 2).map((n) => n[0]).join('')}</span>)}</div>
      <Icon label={`Comments (${activeComments.length})`} onClick={() => { setPanel('comments'); setRight(true) }}><MessageSquare size={17} aria-hidden /></Icon>
      <button type="button" className="we-action secondary" aria-pressed={preview} onClick={() => setPreview(!preview)}>{preview ? 'Back to editor' : 'Preview'}</button>
      <button type="button" className="we-action" onClick={() => setModal('publish')}>Publish</button>
    </header>
    <aside className={`we-rail we-left ${left ? '' : 'we-folded'}`} aria-label="Website navigation" style={preview ? { visibility: 'hidden' } : undefined}>
      {left ? <><div className="we-tabs" role="tablist" aria-label="Website tools">{TABS.map((t) => <button type="button" role="tab" key={t.label} aria-selected={tab === t.label} onClick={() => setTab(t.label)}>{t.label}</button>)}</div>
        <div className="we-rail-scroll" role="tabpanel" aria-label={tab}>
          {tab === 'Pages' && <><div className="we-caption">Pages</div>{draft.pages.map((p) => <button type="button" className="we-row" key={p.slug} aria-current={p.slug === page.slug} onClick={() => pickPage(p.slug)}><FileText size={15} aria-hidden /><span>{p.label}</span><small>{persisted.published?.pages.some((b) => b.slug === p.slug) ? 'Live' : 'Draft'}</small></button>)}
            <button type="button" className="we-row" onClick={() => setModal('templates')}><Plus size={15} />New page</button>
            <div className="we-caption">Site</div><a className="we-row" href={`https://${host}/`} target="_blank" rel="noreferrer"><Globe size={15} />{host}</a><button type="button" className="we-row" onClick={() => { setPanel('seo'); setRight(true) }}><Search size={15} />SEO and sharing</button></>}
          {tab === 'Layers' && <><div className="we-caption">{page.label}</div>{outline.map((node, index) => <div key={node.id} draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', node.id)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); if (findBlockDeep(page.doc, config, id)) updateDoc(moveBlockTo(page.doc, config, id, { parentId: null, slotKey: null, index })) }}>
            <button type="button" className="we-row" aria-pressed={selectedId === node.id} onClick={() => select(node.id)}><Layers size={15} aria-hidden /><span>{node.label}</span>{/^(Space|Live)/.test(node.type) && <small>Live</small>}</button>
            {node.slots.flatMap((slot) => slot.children).map((child) => <button type="button" key={child.id} className="we-row" style={{ paddingLeft: 30 }} aria-pressed={selectedId === child.id} onClick={() => select(child.id)}>{child.label}</button>)}
          </div>)}<button type="button" className="we-row" onClick={() => insert(page.doc.content.length)}><Plus size={15} />Add section</button></>}
          {tab === 'Add' && palette}
          {tab === 'Theme' && <><div className="we-caption">Theme</div>{WEBSITE_THEMES.map((theme) => <button type="button" key={theme} className="we-theme-card" aria-pressed={draft.theme === theme} onClick={() => commit({ ...draft, theme })}>
            <span className="we-theme-swatch" style={websiteThemeVars(theme)}><i style={{ background: 'var(--ed-chrome)' }} /><i style={{ background: 'var(--th-bg)' }}><b /></i></span><span><strong>{theme}</strong><small>{theme === 'Menswork' ? 'Charcoal · teal · 60° cut' : theme === 'DAWN' ? 'Warm · bright · rounded' : 'Deep blue · amber'}</small></span>
          </button>)}<div className="we-caption">Logo</div>{activeLogo && <img src={activeLogo} alt={`${brandName} logo`} style={{ width: 44, height: 44, objectFit: 'contain', margin: 8 }} />}
            <div className="we-actions"><button type="button" className="we-action secondary" onClick={() => setChoosingLogo(true)}>Change logo</button>{activeLogo && <button type="button" className="we-action secondary" onClick={() => commit({ ...draft, brand: { ...draft.brand, logo: null } })}>Remove logo</button>}</div>
            <div className="we-caption">Brand accent</div><label className="we-field">Accent color<Input variant="seamless" type="color" value={colorInputValue} onChange={(event) => commit({ ...draft, brand: { ...draft.brand, accent: event.target.value } })} /></label><button type="button" className="we-action secondary" onClick={() => commit({ ...draft, brand: { ...draft.brand, accent: null } })}>Use theme accent</button><div className="we-swatch-list"><span className="we-swatch" style={{ background: 'var(--th-accent)' }} /><span className="we-swatch" style={{ background: 'var(--th-season)' }} /><span className="we-swatch" style={{ background: 'var(--th-text)' }} /></div>
            <div className="we-caption">Type</div>{['display', 'body', 'mono'].map((role) => <div className="we-note" key={role}>{role}<strong style={{ display: 'block', color: 'var(--th-text)', fontFamily: `var(--th-${role}-render)` }}>{String(websiteThemeVars(draft.theme)[`--th-${role}` as keyof React.CSSProperties]).split(',')[0].replaceAll("'", '')}</strong></div>)}
            <div className="we-caption">Corners</div><div className="we-context">{draft.theme === 'Menswork' ? '60° cut' : 'Round'}</div><div className="we-note">The editor wears the theme it edits. Rails use the site’s own colors, lifted a step lighter. Words, photos and live blocks stay as they are.</div></>}
        </div></> : <div className="we-strip">{TABS.map(({ label, icon: TabIcon }) => <Icon key={label} label={label} onClick={() => { setTab(label); setLeft(true) }}><TabIcon size={18} /></Icon>)}</div>}
      <div className="we-fold"><Icon label={left ? 'Fold left rail' : 'Open left rail'} onClick={() => setLeft(!left)}>{left ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}</Icon></div>
    </aside>
    <main className="we-stage" data-device={device} aria-label="Website editor canvas">
      <div className="we-frame-scroller"><WebsiteCanvas key={page.slug} pageSlug={page.slug} people={people} onCursor={(value) => { cursor.current = value }} doc={page.doc} theme={draft.theme} device={device} config={config} metadata={metadata} live={live} nav={draft.pages} links={{ ...links, pages: draft.pages.map((p) => p.slug) }} origin={origin} title={page.label} brandName={brandName} logo={activeLogo} brandAccent={activeAccent} selectedId={selectedId} preview={preview} comments={page.comments} onSelect={select} onEdit={(id, field, value) => editProps(id, { [field]: value })} onAction={action} onCommentPin={(id, position) => { setSelectedId(id); setPinPosition({ blockId: id, ...position }); setPanel('comments'); setRight(true) }} onReorder={reorderSections} onInsert={insert} onDisplay={updateDisplay} /></div>
      {!preview && <div className="we-vera">
        {thread && <div className="we-thread"><div className="we-thread-head"><Sparkles size={14} /><span className="we-spacer">Vera · changes stay in your draft until you publish</span><Icon label="Close Vera thread" onClick={() => setThread(false)}><ChevronDown size={16} /></Icon></div>
          <p role="status">{asking ? 'Vera is preparing a proposal…' : veraStatus}</p>{proposal && <div className="we-proposal"><div className="we-caption">Proposed text</div><p>{proposal.after}</p><div className="we-actions"><button type="button" className="we-action" onClick={applyProposal}>Apply</button><button type="button" className="we-action secondary" onClick={() => { setProposal(null); setVeraStatus('Proposal discarded.') }}>Discard</button></div></div>}</div>}
        <form className="we-vera-main" onSubmit={(e) => { e.preventDefault(); void askVera() }}>
          <span className="we-context"><Layers size={12} />{selected ? config.components[selected.type]?.label ?? selected.type : page.label}</span>
          <div className="we-vera-input"><Sparkles size={18} style={{ color: 'var(--th-accent-text)' }} /><Input variant="seamless" aria-label="Ask Vera" placeholder="Ask Vera to change something, or type / to add" value={request} onChange={(e) => { setRequest(e.target.value); if (e.target.value === '/') { setRequest(''); insert(page.doc.content.length) } }} /><Icon label="Send to Vera" disabled={asking} type="submit"><ArrowUp size={16} /></Icon></div>
          <div className="we-suggestions"><button type="button" onClick={() => void askVera('Make this shorter while keeping every fact.')}>Make it shorter</button><button type="button" onClick={() => void askVera('Make this warmer and more welcoming. Keep every fact.')}>Make it warmer</button><button type="button" onClick={() => insert(page.doc.content.length)}>Add a section</button></div>
        </form>
      </div>}
    </main>
    <aside className={`we-rail we-right ${right ? '' : 'we-folded'}`} aria-label="Inspector" style={preview ? { visibility: 'hidden' } : undefined}>
      {right ? <><div className="we-inspector-head"><Settings2 size={16} /><span className="we-spacer">{panel === 'comments' ? 'Comments' : panel === 'seo' ? 'SEO and sharing' : selected ? config.components[selected.type]?.label ?? selected.type : 'Page'}<small style={{ display: 'block' }}>{device === 'phone' ? 'Phone only' : device === 'tablet' ? 'Tablet only' : 'All devices'}</small></span><Icon label="Close inspector" onClick={() => setRight(false)}><X size={16} /></Icon></div>
        <div className="we-rail-scroll">
          {!!error && <div className="we-error" role="alert">{error}{status === 'error' && <button type="button" className="we-row" onClick={() => void save()}>Retry save</button>}{status === 'conflict' && <button type="button" className="we-row" onClick={() => window.location.reload()}>Reload newer draft</button>}</div>}
          {panel === 'inspect' && (selected ? <WebsiteInspector key={`${page.slug}:${selectedId}`} config={config} block={selected} doc={page.doc} device={device} onChange={(props) => editProps(selectedId!, props)} onDisplay={(value) => updateDisplay(selectedId!, value)} /> : <div className="we-note">Click a section to select it. Click its text to type. Press / to add a section.</div>)}
          {panel === 'seo' && <><label className="we-field">Page title<Input variant="seamless" value={page.seo.title} placeholder={`${page.label} | ${brandName}`} maxLength={200} onChange={(e) => commit({ ...draft, pages: draft.pages.map((p) => p.slug === page.slug ? { ...p, seo: { ...p.seo, title: e.target.value } } : p) })} /></label><label className="we-field">Description<Textarea variant="seamless" value={page.seo.description} maxLength={500} onChange={(e) => commit({ ...draft, pages: draft.pages.map((p) => p.slug === page.slug ? { ...p, seo: { ...p.seo, description: e.target.value } } : p) })} /></label><div className="we-caption">Share preview</div><div className="we-share-card"><small>{host}</small><strong>{page.seo.title || `${page.label} | ${brandName}`}</strong><p>{page.seo.description}</p></div><div className="we-note">Search and sharing changes go live when you publish.</div></>}
          {panel === 'comments' && <><div className="we-note">{selectedId ? pinPosition?.blockId === selectedId ? 'Comment pinned at the selected position.' : 'Shift-click the page to choose a precise pin position.' : 'Select a section to pin a comment.'}</div>{page.comments.filter((c) => !c.resolved).map((c) => <article className="we-comment" key={c.id}><button type="button" className="we-row" onClick={() => setSelectedId(c.blockId)}><strong>{c.author}</strong></button><small>{new Date(c.createdAt).toLocaleString()}</small><p>{c.text}</p>{c.replies?.map((reply) => <div className="we-comment-reply" key={reply.id}><strong>{reply.author}</strong><small>{new Date(reply.createdAt).toLocaleString()}</small><p>{reply.body}</p></div>)}{(c.replies?.length ?? 0) < 100 && <><label className="we-field">Reply to {c.author}<Textarea variant="seamless" aria-label={`Reply to comment by ${c.author}`} value={replies[c.id] ?? ''} maxLength={2000} onChange={(event) => setReplies((previous) => ({ ...previous, [c.id]: event.target.value }))} /></label><button type="button" className="we-action secondary" disabled={!replies[c.id]?.trim()} onClick={() => replyToComment(c.id)}>Post reply</button></>}<button type="button" className="we-row" onClick={() => commit({ ...draft, pages: draft.pages.map((p) => p.slug === page.slug ? { ...p, comments: p.comments.map((x) => x.id === c.id ? { ...x, resolved: true } : x) } : p) })}>Resolve</button></article>)}
            <label className="we-field">Comment<Textarea variant="seamless" value={comment} maxLength={2000} onChange={(e) => setComment(e.target.value)} /></label><button type="button" className="we-action" disabled={!comment.trim() || !selectedId} onClick={addComment}>Post comment</button></>}
        </div></> : <div className="we-strip"><Icon label="Open inspector" onClick={() => { setPanel('inspect'); setRight(true) }}><Settings2 size={18} /></Icon><Icon label="Open comments" onClick={() => { setPanel('comments'); setRight(true) }}><MessageSquare size={18} /></Icon><Icon label="SEO and sharing" onClick={() => { setPanel('seo'); setRight(true) }}><Search size={18} /></Icon></div>}
      <div className="we-fold"><Icon label={right ? 'Fold right rail' : 'Open right rail'} onClick={() => setRight(!right)}>{right ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}</Icon></div>
    </aside>
    <LoomPicker open={choosingLogo} onClose={() => setChoosingLogo(false)} kinds={['image', 'icon']} title="Choose website logo" onSelect={(url) => { commit({ ...draft, brand: { ...draft.brand, logo: url } }); setChoosingLogo(false) }} />
    {modal && <div className="we-overlay" onClick={() => setModal(null)}><Dialog label={modal === 'publish' ? 'Publish website' : modal === 'templates' ? 'New page' : 'Add section'}>
      <div className="we-modal-head"><h2>{modal === 'publish' ? 'Publish your changes' : modal === 'templates' ? 'Start a new page' : 'Add a section'}</h2><Icon label="Close dialog" onClick={() => setModal(null)}><X size={18} /></Icon></div>
      {modal === 'insert' && palette}
      {modal === 'templates' && <><label className="we-field">Page name<Input variant="seamless" autoFocus value={pageName} maxLength={80} onChange={(e) => setPageName(e.target.value)} /></label>{error && <p role="alert" className="we-error">{error}</p>}<div className="we-template-grid">{WEBSITE_PAGE_TEMPLATES.map(({ name, description }) => <button type="button" key={name} className="we-template" disabled={!pageName.trim()} onClick={() => newPage(name)}><span className="we-template-mark"><span /><span /><span /></span><strong>{name}</strong><small>{description}</small><small>{draft.theme} layout</small></button>)}</div></>}
      {modal === 'publish' && <><div className="we-caption">Changes</div>{changedPages.length ? changedPages.map((p) => <div className="we-row" key={p.slug}><FileText size={15} />{p.label}<small>Updated</small></div>) : <p className="we-note">No page content changes.</p>}{brandChanged && <div className="we-row"><Palette size={15} />Brand settings updated</div>}{draft.theme !== persisted.published?.theme && <div className="we-row"><Palette size={15} />Theme: {draft.theme}</div>}
        <div className="we-caption">When</div>
        <label className="we-row"><Input variant="seamless" type="radio" name="publish-when" checked={publishWhen === 'now'} onChange={() => setPublishWhen('now')} />Publish now</label>
        <label className="we-row"><Input variant="seamless" type="radio" name="publish-when" checked={publishWhen === 'schedule'} onChange={() => setPublishWhen('schedule')} />Schedule</label>
        {publishWhen === 'schedule' && <label className="we-field">Publish date and time<Input variant="seamless" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} /><span>Uses your local time zone.</span></label>}
        {persisted.scheduled && <p className="we-note">Scheduled for {new Date(persisted.scheduled.at).toLocaleString()}. Later draft edits stay separate from that scheduled version.</p>}<div className="we-actions"><button type="button" className="we-action" disabled={!dirty || status === 'saving' || status === 'conflict'} onClick={() => { if (publishWhen === 'now') void save(true); else if (!scheduledAt || !Number.isFinite(new Date(scheduledAt).getTime()) || new Date(scheduledAt).getTime() <= Date.now()) setError('Choose a future date and time.'); else void save(false, new Date(scheduledAt).toISOString()) }}>{status === 'saving' ? 'Saving…' : publishWhen === 'schedule' ? 'Schedule publish' : 'Publish now'}<ArrowRight size={15} /></button><a className="we-action secondary" href={`https://${host}/`} target="_blank" rel="noreferrer">View website</a></div>{error && <p className="we-error" role="alert">{error}</p>}
        <div className="we-caption">Versions</div>{persisted.versions.length ? persisted.versions.map((v) => <div className="we-version" key={v.id}><div><strong>Published version {v.id}</strong><div className="we-note">{new Date(v.createdAt).toLocaleString()}</div></div><button type="button" className="we-action secondary" onClick={() => { commit(structuredClone(v.snapshot)); setModal(null) }}>Restore to draft</button></div>) : <p className="we-note">Your first publish creates a version you can restore.</p>}</>}
    </Dialog></div>}
  </div>
}
