'use client'

/* eslint-disable @next/next/no-img-element -- website assets retain their original host and crop */

import { slugify } from '@/lib/utils'
import { Input, Textarea } from '@/components/ui/field'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode, type KeyboardEvent } from 'react'
import { ArrowUp, ArrowRight, ChevronDown, ChevronLeft, ChevronRight, Copy, Eye, FileText, Globe, Layers, MessageSquare, Monitor, PanelLeft, PanelRight, Palette, Plus, Radio, Redo2, Search, Settings2, Home, ExternalLink, Trash2, Smartphone, Sparkles, Tablet, Undo2, X, ZoomIn, ZoomOut } from 'lucide-react'
import type { Config, Data, Metadata } from '@/lib/page-editor/types'
import { addBlock, buildOutline, derivePickerGroups, duplicateBlockDeep, findBlockDeep, moveBlockTo, nudgeBlock, removeBlockDeep, updateBlockPropsDeep, type OutlineNode } from '@/components/page-editor/mobile/data-ops'
import { inlineFieldValue, replaceInlineField } from '@/lib/sites/editor/inline-edit'
import { resetDocumentPlacements, sectionDeviceLayout } from '@/lib/sites/editor/layout'
import { publishChecks } from '@/lib/sites/editor/publish-checks'
import { websiteThemeVars, WEBSITE_TOKEN_CSS } from '@/lib/sites/editor/theme'
import { WEBSITE_PAGE_TEMPLATES, websiteTemplateSections } from '@/lib/sites/editor/templates'
import { WEBSITE_THEMES, WEBSITE_THEMES_LIVE, RESERVED_WEBSITE_SLUGS, validWebsiteSnapshot, resolveWebsiteBrand, updateSectionDisplay, type WebsiteSnapshot, type WebsiteEditorState, type Device, type WebsitePresence, type SectionDisplay } from '@/lib/sites/editor/state'
import type { MwLive } from '@/lib/sites/menswork-data'
import { SITE_LOOK_OPTIONS, SITE_THEMES, THEME_LOOK, siteLook, siteLookOverrides, type SiteLookKey, type SiteStyle, type SiteThemeId } from '@/lib/theme/site-style'
import type { SiteLinkMap } from '@/lib/sites/house-theme'
import { LoomPicker } from '@/components/loom/loom-picker'
import dynamic from 'next/dynamic'
const WebsiteCanvas = dynamic(() => import('./canvas').then((module) => module.WebsiteCanvas), { ssr: false })
import { WebsiteInspector, WebsiteChromeInspector } from './inspector'
import { SiteMenuEditor } from '@/components/spaces/site-menu-editor'
import { VeraDock } from './vera-dock'
import { FQ_EDITOR, k, on } from './skin'
import './editor.css'
import '@/app/themes/frequency/kit-editor.css'
import '@/app/themes/frequency/editor-shell.css'

type Panel = 'inspect' | 'comments' | 'seo' | 'header' | 'footer' | 'page'
/** The Frequency inspector's tabs (the design's Content / Design / Advanced / Notes). Notes is the comments
 *  panel; the other three show the matching part of the same WebsiteInspector. */
type InspectorTab = 'content' | 'design' | 'advanced' | 'notes'
const INSPECTOR_TABS: { id: InspectorTab; label: string }[] = [{ id: 'content', label: 'Content' }, { id: 'design', label: 'Design' }, { id: 'advanced', label: 'Advanced' }, { id: 'notes', label: 'Notes' }]
type Tab = 'Pages' | 'Layers' | 'Add' | 'Theme' | 'Site'
type Proposal = { pageSlug: string; blockId: string; field: string; path: (string | number)[]; before: string; after: string }
type SaveResult = { ok: true; state: WebsiteEditorState } | { ok: false; error: string; conflict?: boolean }
export interface WebsiteEditorShellProps {
  host: string; brandName: string; logo?: string | null; brandAccent?: string | null; author: string
  initial: WebsiteEditorState; config: Config; metadata?: Metadata; live: MwLive; links: SiteLinkMap; origin: string
  onSave: (revision: number, draft: WebsiteSnapshot, publish: boolean, scheduledAt?: string | null) => Promise<SaveResult>
  onPresence?: (cursor: WebsitePresence['cursor']) => Promise<{ ok: true; people: WebsitePresence[] } | { ok: false; error: string }>
  onPropose?: (request: string, value: string) => Promise<{ ok: true; text: string } | { ok: false; error: string }>
  /** The site's global styles (ADR-1728), shared with Identity and branding, and their live save. */
  siteStyle?: SiteStyle
  onStyle?: (patch: { theme?: SiteThemeId; look?: Partial<Record<SiteLookKey, string | null>>; pages?: Record<string, SiteThemeId | null> }) => Promise<{ ok: true; style: SiteStyle } | { ok: false; error: string }>
}
function readMobileViewport() { return window.matchMedia('(max-width:767px)').matches }
function subscribeViewport(callback: () => void) {
  const query = window.matchMedia('(max-width:767px)')
  query.addEventListener('change', callback)
  return () => query.removeEventListener('change', callback)
}

/** The editor's stored theme ids under their names (ADR-1726): Menswork is Bold, DAWN is Frequency. Midnight
 *  is retired (ADR-1728): a draft that still carries it is offered the two themes. */
const WEBSITE_THEME_LABEL: Record<(typeof WEBSITE_THEMES)[number], string> = { Menswork: 'Bold', DAWN: 'Default', Midnight: 'Midnight', Wildheart: 'Wildheart' }
const EDITOR_THEME: Record<SiteThemeId, (typeof WEBSITE_THEMES)[number]> = { frequency: 'DAWN', bold: 'Menswork', wildheart: 'Wildheart' }
/** The site theme an editor theme stands for (the inverse of EDITOR_THEME; a retired theme reads as Frequency). */
const siteThemeOf = (theme: (typeof WEBSITE_THEMES)[number]): SiteThemeId => (theme === 'Menswork' ? 'bold' : theme === 'Wildheart' ? 'wildheart' : 'frequency')
const LOOK_LABEL: Record<SiteLookKey, string> = { corners: 'Corners', spacing: 'Spacing', header: 'Header', footer: 'Footer' }
const DEFAULT_STYLE: SiteStyle = { theme: 'frequency', fonts: 'frequency', synced: true, spaceFonts: 'frequency', look: { corners: null, spacing: null, header: null, footer: null } }

const TABS: { label: Tab; icon: typeof FileText }[] = [{ label: 'Pages', icon: FileText }, { label: 'Layers', icon: Layers }, { label: 'Add', icon: Plus }, { label: 'Theme', icon: Palette }, { label: 'Site', icon: Settings2 }]
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
  return <div ref={root} className={k('we-modal')} role="dialog" aria-modal="true" aria-label={label} onKeyDown={trap} onClick={(event) => event.stopPropagation()}>{children}</div>
}

function Icon({ label, children, className = '', ...props }: { label: string; children: ReactNode; className?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={k(`we-icon ${className}`)} aria-label={label} title={label} {...props}>{children}</button>
}

export function WebsiteEditorShell({ host, brandName, logo, brandAccent, author, initial, config, metadata, live, links, origin, onSave, onPropose, onPresence, siteStyle, onStyle }: WebsiteEditorShellProps) {
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
  const [style, setStyle] = useState<SiteStyle>(() => siteStyle ?? { ...DEFAULT_STYLE, theme: siteThemeOf(initial.draft.theme) })
  const [styleError, setStyleError] = useState('')
  const lookStyle = { ...style, theme: siteThemeOf(draft.theme) }
  async function saveStyle(patch: Parameters<NonNullable<WebsiteEditorShellProps['onStyle']>>[0], optimistic: SiteStyle) {
    const before = style
    setStyle(optimistic)
    setStyleError('')
    if (!onStyle) return
    const result = await onStyle(patch)
    if (result.ok) setStyle(result.style)
    else { setStyle(before); setStyleError(result.error) }
  }
  const [choosingLogo, setChoosingLogo] = useState(false)
  const websiteBrand = resolveWebsiteBrand(draft, { logo, accent: brandAccent })
  const activeLogo = websiteBrand.logo
  const chromeDefaults = { name: brandName, tagline: (metadata?.websiteChrome as { tagline?: string | null } | undefined)?.tagline ?? null, cta: (metadata?.websiteChrome as { cta?: { label: string; href: string } | null } | undefined)?.cta ?? null }
  const activeAccent = draft.theme === 'Menswork' || draft.theme === 'Wildheart' ? websiteBrand.accent : draft.brand?.accent
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
  const [modal, setModal] = useState<'publish' | 'templates' | 'insert' | 'delete-page' | 'menu' | null>(null)
  const [filter, setFilter] = useState('')
  const [insertAt, setInsertAt] = useState<number | null>(null)
  const [pageName, setPageName] = useState('')
  const [publishWhen, setPublishWhen] = useState<'now' | 'schedule'>('now')
  const [scheduledAt, setScheduledAt] = useState('')
  const [comment, setComment] = useState('')
  const [pinPosition, setPinPosition] = useState<{ blockId: string; x: number; y: number } | null>(null)
  const [replies, setReplies] = useState<Record<string, string>>({})
  const [request, setRequest] = useState('')
  const [textSelection, setTextSelection] = useState<{ blockId: string; field: string; path: (string | number)[]; value: string } | null>(null)
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [veraStatus, setVeraStatus] = useState('')
  const [asking, setAsking] = useState(false)
  // Frequency-only view state (no effect on the draft): the top bar's page menu and the inspector tab.
  const [pickOpen, setPickOpen] = useState(false)
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('content')
  // The stage zoom (design: 50 to 100 percent in tens), the Layers drop marker and the toast line. View only.
  const [zoom, setZoom] = useState(100)
  const [dropId, setDropId] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const toastTimer = useRef<number | undefined>(undefined)
  function say(message: string) {
    setToast(message)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 2600)
  }
  /** Share: copy the live website's address (the design's Share button). */
  async function share() {
    const url = `https://${host}/`
    try { await navigator.clipboard.writeText(url); say('Website link copied. Anyone with it can view your live site.') }
    catch { say(`Copy this link: ${url}`) }
  }
  const history = useRef<WebsiteSnapshot[]>([])
  const future = useRef<WebsiteSnapshot[]>([])
  const [historyCounts, setHistoryCounts] = useState({ past: 0, future: 0 })
  const snapshotKey = JSON.stringify(draft)
  const page = draft.pages.find((p) => p.slug === pageSlug) ?? draft.pages[0]
  // A THEME PER PAGE (LIVE-699): the page's own theme from the shared site style, else the draft's. The canvas
  // wears it, with the page theme's own defaults for any global style left to "the theme's own".
  const pageTheme = style.pages?.[page.slug] ?? null
  const canvasTheme = pageTheme ? EDITOR_THEME[pageTheme] : draft.theme
  const pageLookStyle = { ...style, theme: siteThemeOf(canvasTheme) }
  const selected = selectedId ? findBlockDeep(page.doc, config, selectedId) : null
  const outline = useMemo(() => buildOutline(page.doc, config), [page.doc, config])
  const groups = useMemo(() => derivePickerGroups(config, page.doc, 'website'), [page.doc, config])
  const activeComments = page.comments.filter((c) => !c.resolved)
  const changedPages = draft.pages.filter((p) => {
    const published = persisted.published?.pages.find((b) => b.slug === p.slug)
    return !published || JSON.stringify({ ...p, comments: [] }) !== JSON.stringify(published)
  })
  const removedPages = persisted.published?.pages.filter((item) => !draft.pages.some((current) => current.slug === item.slug)) ?? []
  const navigationChanged = JSON.stringify(draft.pages.map(({ slug, label }) => ({ slug, label }))) !== JSON.stringify(persisted.published?.pages.map(({ slug, label }) => ({ slug, label })))
  const chromeChanged = JSON.stringify(draft.chrome) !== JSON.stringify(persisted.published?.chrome)
  const brandChanged = JSON.stringify(draft.brand) !== JSON.stringify(persisted.published?.brand)
  const dirty = changedPages.length > 0 || draft.theme !== persisted.published?.theme || brandChanged || chromeChanged || navigationChanged

  const commit = useCallback((next: WebsiteSnapshot) => {
    if (!validWebsiteSnapshot(next)) { setError('This change exceeds the website’s supported limits. Keep up to 30 pages, 200 sections per page and 100 comments per page. Your saved draft is unchanged.'); return }
    if (JSON.stringify(next) === JSON.stringify(latest.current)) return
    setError('')
    history.current = [...history.current.slice(-29), latest.current]
    future.current = []
    setDraft(next); latest.current = next; setStatus('unsaved'); setHistoryCounts({ past: history.current.length, future: future.current.length })
  }, [])
  function updateDoc(doc: Data) {
    const layout = doc.root.props?.websiteLayout
    if (layout && typeof layout === 'object') doc = { ...doc, root: { ...doc.root, props: { ...doc.root.props, websiteLayout: Object.fromEntries(Object.entries(layout).filter(([id]) => !!findBlockDeep(doc, config, id))) } } }
    commit({ ...latest.current, pages: latest.current.pages.map((p) => p.slug === page.slug ? { ...p, doc, comments: p.comments.filter((comment) => !!findBlockDeep(doc, config, comment.blockId)) } : p) }) }
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
  const save = useCallback(async (publish = false, schedule?: string | null) => {
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
  function select(id: string) { if (id !== selectedId) setTextSelection(null); setSelectedId(id); setPanel('inspect'); setRight(true) }
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
  function pickPage(slug: string) { setTextSelection(null); setPageSlug(slug); setSelectedId(null); setPanel('inspect'); if (window.matchMedia('(max-width:767px)').matches) setLeft(false) }
  function keys(e: KeyboardEvent) {
    const target = e.target as HTMLElement
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void save(); return }
    if (e.key === 'Escape') { setModal(null); setPreview(false); setPickOpen(false); return }
    if (target.closest('input,textarea,select,[contenteditable=true]')) return
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); travel(e.shiftKey) }
    if (e.key === '/') { e.preventDefault(); insert(page.doc.content.length) }
  }
  function newPage(template: string) {
    const label = pageName.trim()
    if (!label) return
    if (draft.pages.length >= 30) { setError('This website already has 30 pages. Remove a page before adding another.'); return }
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
    if (page.comments.length >= 100) { setError('This page has reached its 100-comment limit.'); return }
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
    setVeraStatus(''); setRequest('')
    const selection = textSelection?.blockId === selectedId ? textSelection : null
    const field = selection?.field ?? (selected && Object.entries(config.components[selected.type]?.fields ?? {}).find(([k, f]) => (f.type === 'textarea' || f.type === 'text') && typeof selected.props[k] === 'string' && selected.props[k].length > 30)?.[0])
    if (!selected || !selectedId || !field) { setVeraStatus('Select a section with text first. I can propose a rewrite for you to review.'); return }
    if (!onPropose) { setVeraStatus('Vera is not connected for this website yet.'); return }
    setAsking(true)
    try {
      const path = selection?.path ?? []
      const before = inlineFieldValue(selected.props, { field, path, start: 0, end: 0 })
      const result = await onPropose(text, before)
      if (result.ok) { setProposal({ pageSlug: page.slug, blockId: selectedId, field, path, before, after: result.text }); setVeraStatus('Here is a proposed change. It stays in your draft until you publish.') }
      else setVeraStatus(result.error)
    } catch { setVeraStatus('Vera could not reply. Try again in a moment.') }
    finally { setAsking(false) }
  }
  function applyProposal() {
    if (!proposal) return
    const target = draft.pages.find((p) => p.slug === proposal.pageSlug)
    const block = target && findBlockDeep(target.doc, config, proposal.blockId)
    if (!target || !block || inlineFieldValue(block.props, { field: proposal.field, path: proposal.path, start: 0, end: 0 }) !== proposal.before) { setVeraStatus('That text has changed. Ask for a new proposal before applying.'); return }
    commit({ ...draft, pages: draft.pages.map((p) => p.slug === target.slug ? { ...p, doc: updateBlockPropsDeep(p.doc, config, proposal.blockId, { [proposal.field]: replaceInlineField(block.props, { field: proposal.field, path: proposal.path, start: 0, end: proposal.before.length }, proposal.after) }) } : p) })
    setProposal(null); setVeraStatus('Applied to your draft. Undo is available above.')
  }
  function openChrome(area: 'header' | 'footer') { setTextSelection(null); setSelectedId(null); setPanel(area); setRight(true) }
  function movePage(direction: -1 | 1) {
    const index = draft.pages.indexOf(page), target = index + direction
    if (page.slug === 'home' || target < 1 || target >= draft.pages.length) return
    const pages = [...draft.pages]; [pages[index], pages[target]] = [pages[target], pages[index]]
    commit({ ...draft, pages })
  }
  function renderLayers(nodes: OutlineNode[], parentId: string | null = null, slotKey: string | null = null, depth = 0): ReactNode {
    return nodes.map((node, index) => <div key={node.id} draggable onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', node.id) }} onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); if (dropId !== node.id) setDropId(node.id) }} onDragEnd={() => setDropId(null)} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); setDropId(null); const id = event.dataTransfer.getData('text/plain'); if (id !== node.id && findBlockDeep(page.doc, config, id)) updateDoc(moveBlockTo(page.doc, config, id, { parentId, slotKey, index })) }}>
      {FQ_EDITOR
        ? <button type="button" className={`row${on(selectedId === node.id)}${dropId === node.id ? ' drop-before' : ''}${depth === 0 && sectionDeviceLayout(page.doc, node.id, device).hidden ? ' off' : ''}`} style={{ paddingLeft: 8 + depth * 14 }} aria-pressed={selectedId === node.id} onClick={() => select(node.id)}><span className="grip" aria-hidden>⋮⋮</span><span className="ic"><Layers size={16} aria-hidden /></span><span className="t">{node.label}{node.summary && node.summary !== node.label && <small>{node.summary}</small>}</span>{/^(Space|Live)/.test(node.type) && <span className="meta">Live</span>}</button>
        : <button type="button" className="we-row" style={{ paddingLeft: 10 + depth * 14 }} aria-pressed={selectedId === node.id} onClick={() => select(node.id)}><Layers size={15} aria-hidden /><span>{node.summary || node.label}</span>{/^(Space|Live)/.test(node.type) && <small>Live</small>}</button>}
      {node.slots.map((slot) => <div key={slot.key}>{slot.children.length > 0 && <span className={k('we-layer-slot')} style={{ paddingLeft: 24 + depth * 14 }}>{slot.label}</span>}{renderLayers(slot.children, node.id, slot.key, depth + 1)}</div>)}
    </div>)
  }
  const palette = FQ_EDITOR ? <>
    <label className="search"><Search size={17} aria-hidden /><span className="sr-only">Filter sections</span><Input placeholder="Search blocks" value={filter} onChange={(e) => setFilter(e.target.value)} /></label>
    {insertAt !== null && <div className="note">Adding at position <b>{insertAt + 1}</b>. Pick a block.</div>}
    {groups.map((group) => { const items = group.items.filter((c) => c.label.toLowerCase().includes(filter.toLowerCase())); return items.length ? <div key={group.key}><div className="cap">{group.title}</div><div className="blocks">{items.map((c) => <button key={c.type} type="button" className="blk" disabled={c.disabled} onClick={() => pickBlock(c.type)}><span className="th" aria-hidden><i className="a s" /><i className="w" /><i /></span>{c.label}<small>{/^(Space|Live)/.test(c.type) ? 'From your Space' : 'Editable'}</small></button>)}</div></div> : null })}
  </> : <>
    <label className="we-field"><span className="sr-only">Filter sections</span><Input variant="seamless" className="we-search" placeholder="Type to filter sections" value={filter} onChange={(e) => setFilter(e.target.value)} /></label>
    {groups.map((group) => <div key={group.key}><div className="we-caption">{group.title}</div>{group.items.filter((c) => c.label.toLowerCase().includes(filter.toLowerCase())).map((c) => <button key={c.type} type="button" className="we-row" disabled={c.disabled} onClick={() => pickBlock(c.type)}><span>{/^(Space|Live)/.test(c.type) ? <Radio size={16} /> : <Plus size={16} />}</span><span>{c.label}</span></button>)}</div>)}
  </>
  // ── The rail tabs and inspector panels, shared by both designs. Class names go through k() (skin.ts): the
  // DAWN names under DAWN, the Frequency kit's under Frequency. The handlers are the same either way.
  const pressedChoice = (pressed: boolean) => (FQ_EDITOR ? on(pressed).trim() || undefined : 'we-action secondary')
  const layersTab = FQ_EDITOR
    ? <><div className="cap">Page · {page.label}<button type="button" onClick={() => insert(page.doc.content.length)}>+ Add</button></div><button type="button" className="row chrome" onClick={() => openChrome('header')}><span className="ic"><Layers size={16} aria-hidden /></span><span className="t">Header and navigation</span><span className="meta">Site</span></button>{renderLayers(outline)}<button type="button" className="row chrome" onClick={() => openChrome('footer')}><span className="ic"><Layers size={16} aria-hidden /></span><span className="t">Footer</span><span className="meta">Site</span></button><button type="button" className="row" onClick={() => insert(page.doc.content.length)}><span className="ic"><Plus size={16} aria-hidden /></span><span className="t">Add section</span></button></>
    : <><div className="we-caption">{page.label}</div><button type="button" className="we-row" onClick={() => openChrome('header')}>Header and navigation</button>{renderLayers(outline)}<button type="button" className="we-row" onClick={() => openChrome('footer')}>Footer</button><button type="button" className="we-row" onClick={() => insert(page.doc.content.length)}><Plus size={15} />Add section</button></>
  const pagesTab = FQ_EDITOR
    ? <><div className="cap">{draft.pages.length} {draft.pages.length === 1 ? 'page' : 'pages'}<button type="button" disabled={draft.pages.length >= 30} onClick={() => setModal('templates')}>+ New page</button></div>{draft.pages.map((p) => { const isLive = !!persisted.published?.pages.some((b) => b.slug === p.slug); return <button type="button" className={`row${on(p.slug === page.slug)}`} key={p.slug} aria-current={p.slug === page.slug} onClick={() => pickPage(p.slug)}><span className="ic"><FileText size={16} aria-hidden /></span><span className="t">{p.label}<small>/{p.slug === 'home' ? '' : p.slug} · {isLive ? 'Live' : 'Draft'}</small></span><span className={`dot ${isLive ? 'live' : 'draft'}`} aria-hidden /></button> })}
      <button type="button" className="row" onClick={() => { setPanel('page'); setRight(true) }}><span className="ic"><Settings2 size={16} aria-hidden /></span><span className="t">Page settings</span></button>
      <div className="cap">Site</div><a className="row" href={`https://${host}/`} target="_blank" rel="noreferrer"><span className="ic"><Globe size={16} aria-hidden /></span><span className="t">{host}</span></a><button type="button" className="row" onClick={() => { setPanel('seo'); setRight(true) }}><span className="ic"><Search size={16} aria-hidden /></span><span className="t">SEO and sharing</span></button></>
    : <><div className="we-caption">Pages</div>{draft.pages.map((p) => <button type="button" className="we-row" key={p.slug} aria-current={p.slug === page.slug} onClick={() => pickPage(p.slug)}><FileText size={15} aria-hidden /><span>{p.label}</span><small>{persisted.published?.pages.some((b) => b.slug === p.slug) ? 'Live' : 'Draft'}</small></button>)}
      <button type="button" className="we-row" disabled={draft.pages.length >= 30} onClick={() => setModal('templates')}><Plus size={15} />New page</button><button type="button" className="we-row" onClick={() => { setPanel('page'); setRight(true) }}><Settings2 size={15} />Page settings</button>
      <div className="we-caption">Site</div><a className="we-row" href={`https://${host}/`} target="_blank" rel="noreferrer"><Globe size={15} />{host}</a><button type="button" className="we-row" onClick={() => { setPanel('seo'); setRight(true) }}><Search size={15} />SEO and sharing</button></>
  const siteTab = <><div className={k('we-caption')}>Website settings</div><button type="button" className={k('we-row')} onClick={() => openChrome('header')}>Header and navigation</button><button type="button" className={k('we-row')} onClick={() => openChrome('footer')}>Footer</button><button type="button" className={k('we-row')} onClick={() => { setTab('Theme'); setLeft(true) }}>Theme and logo</button><button type="button" className={k('we-row')} onClick={() => { setPanel('page'); setRight(true) }}>Page settings</button><button type="button" className={k('we-row')} onClick={() => { setPanel('seo'); setRight(true) }}>SEO and sharing</button><a className={k('we-row')} href={`https://${host}/`} target="_blank" rel="noreferrer">Open live website</a><a className={k('we-row')} href={`${origin}/spaces/${links.slug}`} target="_blank" rel="noreferrer">Space home</a></>
  const themeTab = <><div className={k('we-caption')}>Theme</div>{SITE_THEMES.map((t) => { const theme = EDITOR_THEME[t.id]; return <button type="button" key={t.id} className={`${k('we-theme-card')}${on(draft.theme === theme)}`} aria-pressed={draft.theme === theme} onClick={() => { if (theme === draft.theme) return; commit({ ...draft, theme, pages: draft.pages.map((item) => ({ ...item, doc: resetDocumentPlacements(item.doc) })) }); void saveStyle({ theme: t.id }, { ...style, theme: t.id, fonts: t.defaultFonts }) }}>
      <span className={k('we-theme-swatch')} style={websiteThemeVars(theme)}><i style={{ background: 'var(--ed-chrome)' }} /><i style={{ background: 'var(--th-bg)' }}><b /></i></span><span><strong>{WEBSITE_THEME_LABEL[theme]}</strong><small>{t.description}</small></span>
    </button> })}{draft.theme === 'Midnight' && <p role="note" className={k('we-note')}>Midnight is retired. Pick Frequency or Bold to keep editing in a theme your live site can wear.</p>}
    {/* GLOBAL STYLES (ADR-1728): the same setting Identity and branding edits, live at once. */}
    <div className={k('we-caption')}>Global styles</div>{(Object.keys(SITE_LOOK_OPTIONS) as SiteLookKey[]).map((key) => <div key={key} className={k('we-field')}>{FQ_EDITOR ? <span className="l">{LOOK_LABEL[key]}</span> : LOOK_LABEL[key]}<div className={k('we-choice-row')} role="group" aria-label={LOOK_LABEL[key]}>{SITE_LOOK_OPTIONS[key].map((o) => <button type="button" key={o.id} className={pressedChoice(siteLook(lookStyle)[key] === o.id)} aria-pressed={siteLook(lookStyle)[key] === o.id} onClick={() => { const stored = o.id === THEME_LOOK[lookStyle.theme][key] ? null : o.id; void saveStyle({ look: { [key]: stored } }, { ...style, look: { ...style.look, [key]: stored } }) }}>{o.label}</button>)}</div></div>)}
    {styleError && <p role="alert" className={k('we-note')}>{styleError}</p>}
    <div className={k('we-caption')}>Logo</div>{activeLogo && <img src={activeLogo} alt={`${brandName} logo`} style={{ width: 44, height: 44, objectFit: 'contain', margin: 8 }} />}
    <div className={k('we-actions')}><button type="button" className={k('we-action secondary')} onClick={() => setChoosingLogo(true)}>Change logo</button>{activeLogo && <button type="button" className={k('we-action secondary')} onClick={() => commit({ ...draft, brand: { ...draft.brand, logo: null } })}>Remove logo</button>}</div>
    <div className={k('we-caption')}>Brand accent</div><label className={k('we-field')}>Accent color<Input variant="seamless" type="color" value={colorInputValue} onChange={(event) => commit({ ...draft, brand: { ...draft.brand, accent: event.target.value } })} /></label><button type="button" className={k('we-action secondary')} onClick={() => commit({ ...draft, brand: { ...draft.brand, accent: null } })}>Use theme accent</button><div className={k('we-swatch-list')}><span className={k('we-swatch')} style={{ background: 'var(--th-accent)' }} /><span className={k('we-swatch')} style={{ background: 'var(--th-season)' }} /><span className={k('we-swatch')} style={{ background: 'var(--th-text)' }} /></div>
    <div className={k('we-caption')}>Type</div>{['display', 'body', 'mono'].map((role) => <div className={k('we-note')} key={role}>{role}<strong style={{ display: 'block', color: 'var(--th-text)', fontFamily: `var(--th-${role}-render)` }}>{String(websiteThemeVars(draft.theme)[`--th-${role}` as keyof React.CSSProperties]).split(',')[0].replaceAll("'", '')}</strong></div>)}
    <div className={k('we-note')}>The editor wears the theme it edits. The theme and global styles change your live site as soon as you pick them, here or in Identity and branding. Words, photos and live blocks stay as they are. Switching themes resets element positions to the new layout; Undo restores them.</div></>
  const railBody = <>
    {tab === 'Pages' && pagesTab}
    {tab === 'Layers' && layersTab}
    {tab === 'Add' && palette}
    {tab === 'Site' && siteTab}
    {tab === 'Theme' && themeTab}
  </>
  const inspectorTitle = panel === 'comments' ? 'Comments' : panel === 'seo' ? 'SEO and sharing' : panel === 'header' ? 'Header and navigation' : panel === 'footer' ? 'Footer' : panel === 'page' ? 'Page settings' : selected ? config.components[selected.type]?.label ?? selected.type : 'Page'
  const inspectorScope = panel === 'header' || panel === 'footer' ? 'All pages and devices' : panel !== 'inspect' ? 'This page' : device === 'phone' ? 'Phone only' : device === 'tablet' ? 'Tablet only' : 'All devices'
  // Frequency's inspector tab: Notes IS the comments panel; the others split the section inspector.
  const shownTab: InspectorTab = panel === 'comments' ? 'notes' : inspectorTab === 'notes' ? 'content' : inspectorTab
  const inspectorBody = <>
    {!!error && <div className={k('we-error')} role="alert">{error}{status === 'error' && <button type="button" className={k('we-row')} onClick={() => void save()}>Retry save</button>}{status === 'conflict' && <button type="button" className={k('we-row')} onClick={() => window.location.reload()}>Reload newer draft</button>}</div>}
    {panel === 'inspect' && (selected ? <WebsiteInspector key={`${page.slug}:${selectedId}`} part={FQ_EDITOR ? (shownTab === 'notes' ? 'content' : shownTab) : undefined} metadata={metadata} sourceSettingsHref={`${origin}/spaces/${links.slug}/settings/${selected.type === 'SpaceOfferings' || selected.props.source === 'offerings' ? 'offerings' : /Events/.test(selected.type) || selected.props.source === 'events' ? 'calendar' : selected.props.source === 'memberships' ? 'memberships' : selected.props.source === 'tickets' ? 'tickets' : ''}`} config={config} block={selected} doc={page.doc} device={device} onChange={(props) => editProps(selectedId!, props)} onDisplay={(value) => updateDisplay(selectedId!, value)} /> : <div className={k('we-note')}>Click text to select it. Double-click or press Enter to edit. Drag a grip to move or resize. Press / to add a section.</div>)}
    {(panel === 'header' || panel === 'footer') && <WebsiteChromeInspector area={panel} chrome={draft.chrome} defaults={chromeDefaults} sourceSettingsHref={`${origin}/spaces/${links.slug}/settings`} onChange={(chrome) => commit({ ...draft, chrome })} onTheme={() => { setTab('Theme'); setLeft(true) }} onPages={() => { setTab('Pages'); setLeft(true) }} onMenu={() => setModal('menu')} />}
    {panel === 'page' && <><label className={k('we-field')}>Page name<Input variant="seamless" key={`${page.slug}:${page.label}`} defaultValue={page.label} maxLength={80} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { event.currentTarget.value = page.label; event.currentTarget.blur() } }} onBlur={(event) => { if (event.target.value.trim()) commit({ ...draft, pages: draft.pages.map((item) => item.slug === page.slug ? { ...item, label: event.target.value } : item) }) }} /></label><p className={k('we-note')}>Changing the name updates navigation. The page address stays the same.</p>
      {/* A THEME PER PAGE (LIVE-699): the shared site style's per-page override, live at once like the theme. */}
      <div className={k('we-field')}>{FQ_EDITOR ? <span className="l">Page theme</span> : 'Page theme'}<div className={k('we-choice-row')} role="group" aria-label="Page theme">{[{ id: null as SiteThemeId | null, label: 'Same as site' }, ...SITE_THEMES.map((t) => ({ id: t.id as SiteThemeId | null, label: t.label }))].map((o) => <button type="button" key={o.id ?? 'site'} className={pressedChoice(pageTheme === o.id)} aria-pressed={pageTheme === o.id} onClick={() => { if (pageTheme === o.id) return; const pages = { ...style.pages }; if (o.id) pages[page.slug] = o.id; else delete pages[page.slug]; void saveStyle({ pages: { [page.slug]: o.id } }, { ...style, pages }) }}>{o.label}</button>)}</div></div>
      <p className={k('we-note')}>This page can wear the other theme. Same as site follows the Theme tab, and the change shows on your live website at once.</p>{styleError && <p role="alert" className={k('we-note')}>{styleError}</p>}<div className={k('we-actions')}><button type="button" className={k('we-action secondary')} disabled={draft.pages.indexOf(page) <= 1 || page.slug === 'home'} onClick={() => movePage(-1)}>Move earlier</button><button type="button" className={k('we-action secondary')} disabled={draft.pages.indexOf(page) >= draft.pages.length - 1 || page.slug === 'home'} onClick={() => movePage(1)}>Move later</button></div><button type="button" className={k('we-row')} onClick={() => { setPanel('seo'); setRight(true) }}>SEO and sharing</button>{page.slug !== 'home' && <button type="button" className={k('we-row')} onClick={() => setModal('delete-page')}><Trash2 size={15} />Remove page</button>}</>}
    {panel === 'seo' && <><label className={k('we-field')}>Page title<Input variant="seamless" value={page.seo.title} placeholder={`${page.label} | ${brandName}`} maxLength={200} onChange={(e) => commit({ ...draft, pages: draft.pages.map((p) => p.slug === page.slug ? { ...p, seo: { ...p.seo, title: e.target.value } } : p) })} /></label><label className={k('we-field')}>Description<Textarea variant="seamless" value={page.seo.description} maxLength={500} onChange={(e) => commit({ ...draft, pages: draft.pages.map((p) => p.slug === page.slug ? { ...p, seo: { ...p.seo, description: e.target.value } } : p) })} /></label><div className={k('we-caption')}>Share preview</div><div className={k('we-share-card')}><small>{host}</small><strong>{page.seo.title || `${page.label} | ${brandName}`}</strong><p>{page.seo.description}</p></div><div className={k('we-note')}>Search and sharing changes go live when you publish.</div></>}
    {panel === 'comments' && <><div className={k('we-note')}>{selectedId ? pinPosition?.blockId === selectedId ? 'Comment pinned at the selected position.' : 'Shift-click the page to choose a precise pin position.' : 'Select a section to pin a comment.'}</div>{page.comments.filter((c) => !c.resolved).map((c) => <article className={k('we-comment')} key={c.id}><button type="button" className={k('we-row')} onClick={() => setSelectedId(c.blockId)}><strong>{c.author}</strong></button><small>{new Date(c.createdAt).toLocaleString()}</small><p>{c.text}</p>{c.replies?.map((reply) => <div className={k('we-comment-reply')} key={reply.id}><strong>{reply.author}</strong><small>{new Date(reply.createdAt).toLocaleString()}</small><p>{reply.body}</p></div>)}{(c.replies?.length ?? 0) < 100 && <><label className={k('we-field')}>Reply to {c.author}<Textarea variant="seamless" aria-label={`Reply to comment by ${c.author}`} value={replies[c.id] ?? ''} maxLength={2000} onChange={(event) => setReplies((previous) => ({ ...previous, [c.id]: event.target.value }))} /></label><button type="button" className={k('we-action secondary')} disabled={!replies[c.id]?.trim()} onClick={() => replyToComment(c.id)}>Post reply</button></>}<button type="button" className={k('we-row')} onClick={() => commit({ ...draft, pages: draft.pages.map((p) => p.slug === page.slug ? { ...p, comments: p.comments.map((x) => x.id === c.id ? { ...x, resolved: true } : x) } : p) })}>Resolve</button></article>)}
      <label className={k('we-field')}>Comment<Textarea variant="seamless" value={comment} maxLength={2000} onChange={(e) => setComment(e.target.value)} /></label><button type="button" className={k('we-action')} disabled={!comment.trim() || !selectedId} onClick={addComment}>Post comment</button></>}
  </>
  const modalLabel = modal === 'publish' ? 'Publish website' : modal === 'templates' ? 'New page' : modal === 'delete-page' ? 'Remove page' : modal === 'menu' ? 'Menu and logo' : 'Add section'
  const modalTitle = modal === 'publish' ? 'Publish your changes' : modal === 'templates' ? 'Start a new page' : modal === 'delete-page' ? 'Remove this page?' : modal === 'menu' ? 'Menu and logo' : 'Add a section'
  const publishAction = () => { if (publishWhen === 'now') void save(true); else if (!scheduledAt || !Number.isFinite(new Date(scheduledAt).getTime()) || new Date(scheduledAt).getTime() <= Date.now()) setError('Choose a future date and time.'); else void save(false, new Date(scheduledAt).toISOString()) }
  const publishDisabled = !dirty || status === 'saving' || status === 'conflict'
  const publishLabel = status === 'saving' ? 'Saving…' : publishWhen === 'schedule' ? 'Schedule publish' : 'Publish now'
  const changeCount = changedPages.length + removedPages.length + (navigationChanged ? 1 : 0) + (chromeChanged ? 1 : 0) + (brandChanged ? 1 : 0) + (draft.theme !== persisted.published?.theme ? 1 : 0)
  const saveLabel = status === 'saving' ? 'Saving draft…' : status === 'saved' ? `Draft · ${changedPages.length + removedPages.length} changed ${changedPages.length + removedPages.length === 1 ? 'page' : 'pages'}${navigationChanged ? ' · navigation updated' : chromeChanged ? ' · header/footer updated' : brandChanged ? ' · brand updated' : draft.theme !== persisted.published?.theme ? ' · theme updated' : ''}` : status === 'unsaved' ? 'Unsaved changes' : 'Draft needs attention'
  const versionsList = <>{persisted.versions.length ? persisted.versions.map((v) => <div className={k('we-version')} key={v.id}><div><strong>Published version {v.id}</strong><div className={k('we-note')}>{new Date(v.createdAt).toLocaleString()}</div></div><button type="button" className={k('we-action secondary')} onClick={() => { commit(structuredClone(v.snapshot)); setModal(null) }}>Restore to draft</button></div>) : <p className={k('we-note')}>Your first publish creates a version you can restore.</p>}</>
  const scheduledNotice = persisted.scheduled && <div><button type="button" className={k('we-action secondary')} disabled={status === 'saving'} onClick={() => void save(false, null)}>Cancel scheduled publish</button><p className={k('we-note')}>Scheduled for {new Date(persisted.scheduled.at).toLocaleString()}. Later draft edits stay separate from that scheduled version.</p></div>
  const previewNote = !WEBSITE_THEMES_LIVE.has(draft.theme) && <p role="note" className={k('we-note')}>The {WEBSITE_THEME_LABEL[draft.theme]} theme is still in preview in the editor. Publishing saves this version, and your live website keeps its current look until this theme is ready.</p>
  const deletePageBody = <><p className={k('we-note')}>Remove {page.label} from this draft and its navigation? This takes effect on the live website when you publish. Undo restores the page.</p><button type="button" className={k('we-action')} onClick={() => { commit({ ...draft, pages: draft.pages.filter((item) => item.slug !== page.slug) }); setModal(null); pickPage('home') }}>Remove page</button></>
  const logoPicker = <LoomPicker open={choosingLogo} onClose={() => setChoosingLogo(false)} kinds={['image', 'icon']} title="Choose website logo" onSelect={(url) => { commit({ ...draft, brand: { ...draft.brand, logo: url } }); setChoosingLogo(false) }} />
  const veraContext = textSelection ? `Selected text · ${textSelection.field}${textSelection.path.length ? ' in card' : ''}` : selected ? config.components[selected.type]?.label ?? selected.type : page.label

  // ── FREQUENCY (design_handoff/frequency/templates/admin/Page Editor.html): the same editor in the design's
  // layout. Top bar, left rail (Pages, Layers, Add, Theme, Site), the stage with the Vera bar, the inspector
  // (Content, Design, Advanced, Notes) and the publish modal. Folding is the kit's data-lf / data-rf.
  if (FQ_EDITOR) {
    const veraVisible = asking || !!veraStatus || !!proposal
    return <div data-editor-root data-kit="editor" data-website-theme={draft.theme} style={{ ...websiteThemeVars(draft.theme, activeAccent), position: 'relative', zIndex: 60 }} onKeyDown={keys}>
      <style>{WEBSITE_TOKEN_CSS}</style>
      <div className="pe" data-lf={left ? '0' : '1'} data-rf={right ? '0' : '1'} data-preview={preview ? '1' : '0'}>
        <header className="top">
          <a className="ib" aria-label="Back to Space home" title="Back to Space home" href={`${origin}/spaces/${links.slug}`} target="_blank" rel="noreferrer"><ChevronLeft size={18} aria-hidden /></a>
          <div className="brand"><span className="av" style={activeLogo ? { backgroundImage: `url(${JSON.stringify(activeLogo)})`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat' } : { backgroundImage: 'none' }} aria-hidden /><span><b>{draft.chrome?.name || brandName}</b><small>{host}</small></span></div>
          <div className="pick">
            <button type="button" aria-haspopup="menu" aria-expanded={pickOpen} onClick={() => setPickOpen(!pickOpen)}><span>{page.label}</span><ChevronDown size={16} aria-hidden /></button>
            <div className={`menu${on(pickOpen)}`} role="menu" aria-label="Pages">
              {draft.pages.map((p) => <button type="button" role="menuitem" key={p.slug} onClick={() => { pickPage(p.slug); setPickOpen(false) }}>{p.label}<span className="sp" /><span className={`dot ${persisted.published?.pages.some((b) => b.slug === p.slug) ? 'live' : 'draft'}`} aria-hidden /></button>)}
              <div className="sep" />
              <button type="button" role="menuitem" disabled={draft.pages.length >= 30} onClick={() => { setModal('templates'); setPickOpen(false) }}>+ New page</button>
            </div>
          </div>
          <button type="button" className={`save${status === 'saved' ? '' : ' dirty'}`} onClick={() => void save()} title="Save draft" aria-label="Save draft" role="status"><i aria-hidden /><span>{saveLabel}</span></button>
          <span className="sp" />
          {!!error && <button type="button" className="save-alert" role="alert" onClick={() => setRight(true)}>{error}</button>}
          <Icon label={left ? 'Fold left rail' : 'Open left rail'} onClick={() => setLeft(!left)}><PanelLeft size={18} aria-hidden /></Icon>
          <div className="seg dev" role="group" aria-label="Preview width">{DEVICES.map(({ id, icon: DeviceIcon, label }) => <button type="button" key={id} className={on(device === id).trim() || undefined} aria-label={label} title={label} aria-pressed={device === id} onClick={() => setDevice(id)}><DeviceIcon size={17} aria-hidden /></button>)}</div>
          <Icon label={right ? 'Fold inspector' : 'Open inspector'} onClick={() => setRight(!right)}><PanelRight size={18} aria-hidden /></Icon>
          <Icon label="Undo" disabled={!historyCounts.past} onClick={() => travel(false)}><Undo2 size={18} aria-hidden /></Icon>
          <Icon label="Redo" disabled={!historyCounts.future} onClick={() => travel(true)}><Redo2 size={18} aria-hidden /></Icon>
          <Icon label={preview ? 'Back to editor' : 'Preview'} aria-pressed={preview} onClick={() => setPreview(!preview)}><Eye size={18} aria-hidden /></Icon>
          <span className="faces" title={[`${author} · editing`, ...people.map((person) => `${person.name} · editing`)].join(', ')}>{[{ key: 'me', name: author }, ...people.map((person) => ({ key: person.profileId, name: person.name }))].map((person) => <span key={person.key} aria-label={`${person.name} · editing`}>{person.name.split(' ').slice(0, 2).map((n) => n[0]).join('')}</span>)}</span>
          <button type="button" className="btn sm" onClick={() => void share()}>Share</button>
          <button type="button" className="btn pa" onClick={() => setModal('publish')}>Publish{changeCount > 0 && <span className="pubn">{changeCount}</span>}</button>
        </header>
        <aside className="rail" aria-label="Website navigation">
          <div className="tabs" role="tablist" aria-label="Website tools">{TABS.map(({ label, icon: TabIcon }) => <button type="button" role="tab" key={label} aria-selected={tab === label} className={on(tab === label).trim() || undefined} title={label} onClick={() => { setTab(label); setLeft(true) }}><TabIcon size={18} aria-hidden /><span>{label}</span></button>)}</div>
          <div className="body" role="tabpanel" aria-label={tab}>{railBody}</div>
          <div className="foot"><span className="lbl">Changes save as a draft</span><a className="btn sm txt" aria-label="Website home" href={`https://${host}/`} target="_blank" rel="noreferrer">Live site</a></div>
        </aside>
        <main className="stage" data-device={device} aria-label="Website editor canvas" style={{ ['--pe-zoom' as string]: preview ? 1 : zoom / 100 }}>
          <div className="scroller"><WebsiteCanvas key={page.slug} pageSlug={page.slug} people={people} onCursor={(value) => { cursor.current = value }} doc={page.doc} theme={canvasTheme} device={device} config={config} metadata={metadata} live={live} nav={draft.pages} links={{ ...links, pages: draft.pages.map((p) => p.slug) }} origin={origin} title={page.label} brandName={brandName} logo={activeLogo} brandAccent={activeAccent} selectedId={selectedId} preview={preview} comments={page.comments} onSelect={select} onTextSelect={setTextSelection} onChromeSelect={openChrome} chrome={draft.chrome} onEdit={(id, field, value) => editProps(id, { [field]: value })} onAction={action} onCommentPin={(id, position) => { setSelectedId(id); setPinPosition({ blockId: id, ...position }); setPanel('comments'); setRight(true) }} onReorder={reorderSections} onInsert={insert} onDisplay={updateDisplay} look={siteLookOverrides(pageLookStyle)} fullFooter={siteLook(pageLookStyle).footer === 'full'} /></div>
          {!preview && <div className="zoom" role="group" aria-label="Zoom"><Icon label="Zoom out" disabled={zoom <= 50} onClick={() => setZoom((z) => Math.max(50, z - 10))}><ZoomOut size={16} aria-hidden /></Icon><span aria-live="polite">{zoom}%</span><Icon label="Zoom in" disabled={zoom >= 100} onClick={() => setZoom((z) => Math.min(100, z + 10))}><ZoomIn size={16} aria-hidden /></Icon></div>}
          {!preview && <div className="vera">
            <div className={`reply${on(veraVisible)}`} role="status">{asking ? 'Vera is preparing a proposal…' : veraStatus}{proposal && <><b className="lbl">Proposed text</b><p>{proposal.after}</p><div className="acts"><button type="button" className="btn sm pa" onClick={applyProposal}>Apply</button><button type="button" className="btn sm" onClick={() => { setProposal(null); setVeraStatus('Proposal discarded.') }}>Discard</button></div></>}</div>
            <form className="bar" onSubmit={(e) => { e.preventDefault(); void askVera() }}>
              <span className="orb" aria-hidden />
              <Input aria-label="Ask Vera" placeholder="Ask Vera to change something, or type / to add" value={request} onChange={(e) => { setRequest(e.target.value); if (e.target.value === '/') { setRequest(''); insert(page.doc.content.length) } }} />
              <span className="ctx">{veraContext}</span>
              <button type="submit" className="btn sm ink" disabled={asking} aria-label="Send to Vera">Ask</button>
            </form>
            <div className="chips"><button type="button" onClick={() => void askVera('Make this shorter while keeping every fact.')}>Make it shorter</button><button type="button" onClick={() => void askVera('Make this warmer and more welcoming. Keep every fact.')}>Make it warmer</button><button type="button" onClick={() => insert(page.doc.content.length)}>Add a section</button></div>
          </div>}
        </main>
        <aside className="insp" aria-label="Inspector">
          {right && <>
            <div className="ih"><span className="ic">{panel === 'comments' ? <MessageSquare size={18} aria-hidden /> : <Settings2 size={18} aria-hidden />}</span><span className="grow"><b>{inspectorTitle}</b><small>{inspectorScope}</small></span><Icon label="Close inspector" onClick={() => setRight(false)}><PanelRight size={18} aria-hidden /></Icon></div>
            {(panel === 'inspect' || panel === 'comments') && <div className="isub"><div className="seg" role="tablist" aria-label="Inspector">{INSPECTOR_TABS.map((t) => <button type="button" role="tab" key={t.id} aria-selected={shownTab === t.id} className={on(shownTab === t.id).trim() || undefined} onClick={() => { if (t.id === 'notes') setPanel('comments'); else { setInspectorTab(t.id); setPanel('inspect') } }}>{t.label}{t.id === 'notes' && activeComments.length > 0 ? ` ${activeComments.length}` : ''}</button>)}</div></div>}
            <div className="fields">{inspectorBody}</div>
            {panel === 'inspect' && selected && selectedId && <div className="ifoot"><button type="button" className="btn sm" onClick={() => action(selectedId, 'copy')}><Copy size={16} aria-hidden />Duplicate</button><button type="button" className="btn sm danger" onClick={() => action(selectedId, 'delete')}><Trash2 size={16} aria-hidden />Delete</button></div>}
          </>}
        </aside>
      </div>
      {logoPicker}
      <div className={`toast${on(!!toast)}`} role="status" aria-live="polite">{toast}</div>
      {modal && <div className="ov on" onClick={() => setModal(null)}><Dialog label={modalLabel}>
        <Icon label="Close dialog" className="x" onClick={() => setModal(null)}><X size={18} aria-hidden /></Icon>
        {modal === 'publish' && <span className="eyebrow">{draft.chrome?.name || brandName} · {page.label}</span>}
        <h2>{modal === 'publish' ? 'Ready to publish?' : modalTitle}</h2>
        {modal === 'menu' && <SiteMenuEditor slug={links.slug} />}
        {modal === 'insert' && <div className="modal-body">{palette}</div>}
        {modal === 'delete-page' && deletePageBody}
        {modal === 'templates' && <><label className="fld"><span className="l">Page name</span><Input className="in" autoFocus value={pageName} maxLength={80} onChange={(e) => setPageName(e.target.value)} /></label>{error && <p role="alert" className="note err">{error}</p>}<div className="blocks">{WEBSITE_PAGE_TEMPLATES.map(({ name, description }) => <button type="button" key={name} className="blk" disabled={!pageName.trim()} onClick={() => newPage(name)}><span className="th" aria-hidden><i className="a s" /><i className="w" /><i /></span>{name}<small>{description}</small><small>{draft.theme} layout</small></button>)}</div></>}
        {modal === 'publish' && <>{previewNote}
          <div className="chg">{changedPages.map((p) => <div key={p.slug}><FileText size={16} aria-hidden /><b>{p.label}</b><span className="sp" />Updated</div>)}{removedPages.map((item) => <div key={item.slug}><Trash2 size={16} aria-hidden /><b>{item.label}</b><span className="sp" />Removed</div>)}{navigationChanged && <div><Layers size={16} aria-hidden /><b>Navigation</b><span className="sp" />Updated</div>}{chromeChanged && <div><Settings2 size={16} aria-hidden /><b>Header and footer</b><span className="sp" />Updated</div>}{brandChanged && <div><Palette size={16} aria-hidden /><b>Brand settings</b><span className="sp" />Updated</div>}{draft.theme !== persisted.published?.theme && <div><Palette size={16} aria-hidden /><b>Theme</b><span className="sp" />{draft.theme}</div>}{changeCount === 0 && <div>No page content changes.</div>}</div>
          {publishChecks(draft.pages, config).map((check) => <div className="chk" key={check.text}><i className={check.ok ? undefined : 'w'} aria-hidden>{check.ok ? '✓' : '!'}</i>{check.text}</div>)}
          <div className="seg when" role="group" aria-label="When"><button type="button" className={on(publishWhen === 'now').trim() || undefined} aria-pressed={publishWhen === 'now'} onClick={() => setPublishWhen('now')}>Publish now</button><button type="button" className={on(publishWhen === 'schedule').trim() || undefined} aria-pressed={publishWhen === 'schedule'} onClick={() => setPublishWhen('schedule')}>Schedule</button></div>
          {publishWhen === 'schedule' && <label className="fld"><span className="l">Publish date and time <em>Your local time zone</em></span><Input className="in" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} /></label>}
          {scheduledNotice}
          <div className="acts end"><a className="btn" href={`https://${host}/`} target="_blank" rel="noreferrer">View website</a><button type="button" className="btn pa" disabled={publishDisabled} onClick={publishAction}>{publishLabel}<ArrowRight size={16} aria-hidden /></button></div>{error && <p className="note err" role="alert">{error}</p>}
          <div className="cap">Versions</div>{versionsList}</>}
      </Dialog></div>}
    </div>
  }

  return <div data-editor-root data-website-theme={draft.theme} style={websiteThemeVars(draft.theme, activeAccent)} className="we-shell" data-left-folded={!left} data-right-folded={!right} data-preview={preview} onKeyDown={keys}>
    <style>{WEBSITE_TOKEN_CSS}</style>
    <header className="we-top">
      <a className="we-icon" aria-label="Website home" title="Website home" href={`https://${host}/`} target="_blank" rel="noreferrer"><Home size={18} /></a>
      <a className="we-icon" aria-label="Back to Space home" title="Back to Space home" href={`${origin}/spaces/${links.slug}`} target="_blank" rel="noreferrer"><ExternalLink size={17} /></a>
      <div className="we-brand">{activeLogo && <img className="we-logo" src={activeLogo} alt="" />}<div><strong>{draft.chrome?.name || brandName}</strong><small>{host}</small></div></div>
      <button type="button" className="we-page-pick" onClick={() => { setLeft(true); setTab('Pages') }}><FileText size={14} aria-hidden />{page.label}<ChevronDown size={13} aria-hidden /></button>
      <button type="button" className="we-save" onClick={() => void save()} title="Save draft" aria-label="Save draft" role="status">{saveLabel}</button>
      <span className="we-spacer" />
      {!!error && <button type="button" className="we-save-alert" role="alert" onClick={() => setRight(true)}>{error}</button>}
      <div className="we-device" aria-label="Preview width">{DEVICES.map(({ id, icon: DeviceIcon, label }) => <Icon key={id} label={label} aria-pressed={device === id} onClick={() => setDevice(id)}><DeviceIcon size={15} aria-hidden /></Icon>)}</div>
      <Icon label="Undo" className="we-history" disabled={!historyCounts.past} onClick={() => travel(false)}><Undo2 size={17} aria-hidden /></Icon>
      <Icon label="Redo" className="we-history" disabled={!historyCounts.future} onClick={() => travel(true)}><Redo2 size={17} aria-hidden /></Icon>
      <details className="we-mobile-history"><summary aria-label="Editor tools">Tools</summary><div>{DEVICES.map(({ id, label }) => <button key={id} type="button" className="we-row" aria-pressed={device === id} onClick={() => setDevice(id)}>{label} width</button>)}<button type="button" className="we-row" disabled={!historyCounts.past} onClick={() => travel(false)}>Undo</button><button type="button" className="we-row" disabled={!historyCounts.future} onClick={() => travel(true)}>Redo</button><button type="button" className="we-row" onClick={() => void save()}>Save draft</button></div></details>
      <div className="we-presence" title={`${author} · editing`}><span className="we-avatar">{author.split(' ').slice(0, 2).map((n) => n[0]).join('')}</span>{people.map((person) => <span key={person.profileId} className="we-avatar" title={`${person.name} · editing`}>{person.name.split(' ').slice(0, 2).map((n) => n[0]).join('')}</span>)}</div>
      <Icon label={`Comments (${activeComments.length})`} onClick={() => { setPanel('comments'); setRight(true) }}><MessageSquare size={17} aria-hidden /></Icon>
      <button type="button" className="we-action secondary" aria-pressed={preview} onClick={() => setPreview(!preview)}>{preview ? 'Back to editor' : 'Preview'}</button>
      <button type="button" className="we-action" onClick={() => setModal('publish')}>Publish</button>
    </header>
    <aside className={`we-rail we-left ${left ? '' : 'we-folded'}`} aria-label="Website navigation" style={preview ? { visibility: 'hidden' } : undefined}>
      {left ? <><div className="we-tabs" role="tablist" aria-label="Website tools">{TABS.map((t) => <button type="button" role="tab" key={t.label} aria-selected={tab === t.label} onClick={() => setTab(t.label)}>{t.label}</button>)}</div>
        <div className="we-rail-scroll" role="tabpanel" aria-label={tab}>
          {railBody}
        </div></> : <div className="we-strip">{TABS.map(({ label, icon: TabIcon }) => <Icon key={label} label={label} onClick={() => { setTab(label); setLeft(true) }}><TabIcon size={18} /></Icon>)}</div>}
      <div className="we-fold"><Icon label={left ? 'Fold left rail' : 'Open left rail'} onClick={() => setLeft(!left)}>{left ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}</Icon></div>
    </aside>
    <main className="we-stage" data-device={device} aria-label="Website editor canvas">
      <div className="we-frame-scroller"><WebsiteCanvas key={page.slug} pageSlug={page.slug} people={people} onCursor={(value) => { cursor.current = value }} doc={page.doc} theme={canvasTheme} device={device} config={config} metadata={metadata} live={live} nav={draft.pages} links={{ ...links, pages: draft.pages.map((p) => p.slug) }} origin={origin} title={page.label} brandName={brandName} logo={activeLogo} brandAccent={activeAccent} selectedId={selectedId} preview={preview} comments={page.comments} onSelect={select} onTextSelect={setTextSelection} onChromeSelect={openChrome} chrome={draft.chrome} onEdit={(id, field, value) => editProps(id, { [field]: value })} onAction={action} onCommentPin={(id, position) => { setSelectedId(id); setPinPosition({ blockId: id, ...position }); setPanel('comments'); setRight(true) }} onReorder={reorderSections} onInsert={insert} onDisplay={updateDisplay} look={siteLookOverrides(pageLookStyle)} fullFooter={siteLook(pageLookStyle).footer === 'full'} /></div>
      {!preview && <VeraDock>
        {(asking || veraStatus || proposal) && <div className="we-thread">
          <p role="status">{asking ? 'Vera is preparing a proposal…' : veraStatus}</p>{proposal && <div className="we-proposal"><div className="we-caption">Proposed text</div><p>{proposal.after}</p><div className="we-actions"><button type="button" className="we-action" onClick={applyProposal}>Apply</button><button type="button" className="we-action secondary" onClick={() => { setProposal(null); setVeraStatus('Proposal discarded.') }}>Discard</button></div></div>}</div>}
        <form className="we-vera-main" onSubmit={(e) => { e.preventDefault(); void askVera() }}>
          <span className="we-context"><Layers size={12} />{veraContext}</span>
          <div className="we-vera-input"><Sparkles size={18} style={{ color: 'var(--th-accent-text)' }} /><Input variant="seamless" aria-label="Ask Vera" placeholder="Ask Vera to change something, or type / to add" value={request} onChange={(e) => { setRequest(e.target.value); if (e.target.value === '/') { setRequest(''); insert(page.doc.content.length) } }} /><Icon label="Send to Vera" disabled={asking} type="submit"><ArrowUp size={16} /></Icon></div>
          <div className="we-suggestions"><button type="button" onClick={() => void askVera('Make this shorter while keeping every fact.')}>Make it shorter</button><button type="button" onClick={() => void askVera('Make this warmer and more welcoming. Keep every fact.')}>Make it warmer</button><button type="button" onClick={() => insert(page.doc.content.length)}>Add a section</button></div>
        </form>
      </VeraDock>}
    </main>
    <aside className={`we-rail we-right ${right ? '' : 'we-folded'}`} aria-label="Inspector" style={preview ? { visibility: 'hidden' } : undefined}>
      {right ? <><div className="we-inspector-head"><Settings2 size={16} /><span className="we-spacer">{inspectorTitle}<small style={{ display: 'block' }}>{inspectorScope}</small></span><Icon label="Close inspector" onClick={() => setRight(false)}><X size={16} /></Icon></div>
        <div className="we-rail-scroll">
          {inspectorBody}
        </div></> : <div className="we-strip"><Icon label="Open inspector" onClick={() => { setPanel('inspect'); setRight(true) }}><Settings2 size={18} /></Icon><Icon label="Open comments" onClick={() => { setPanel('comments'); setRight(true) }}><MessageSquare size={18} /></Icon><Icon label="SEO and sharing" onClick={() => { setPanel('seo'); setRight(true) }}><Search size={18} /></Icon></div>}
      <div className="we-fold"><Icon label={right ? 'Fold right rail' : 'Open right rail'} onClick={() => setRight(!right)}>{right ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}</Icon></div>
    </aside>
    {logoPicker}
    {modal && <div className="we-overlay" onClick={() => setModal(null)}><Dialog label={modalLabel}>
      <div className="we-modal-head"><h2>{modalTitle}</h2><Icon label="Close dialog" onClick={() => setModal(null)}><X size={18} /></Icon></div>
      {modal === 'menu' && <SiteMenuEditor slug={links.slug} />}
      {modal === 'insert' && palette}
      {modal === 'delete-page' && deletePageBody}
      {modal === 'templates' && <><label className="we-field">Page name<Input variant="seamless" autoFocus value={pageName} maxLength={80} onChange={(e) => setPageName(e.target.value)} /></label>{error && <p role="alert" className="we-error">{error}</p>}<div className="we-template-grid">{WEBSITE_PAGE_TEMPLATES.map(({ name, description }) => <button type="button" key={name} className="we-template" disabled={!pageName.trim()} onClick={() => newPage(name)}><span className="we-template-mark"><span /><span /><span /></span><strong>{name}</strong><small>{description}</small><small>{draft.theme} layout</small></button>)}</div></>}
      {modal === 'publish' && <>{previewNote}<div className="we-caption">Changes</div>{changedPages.length ? changedPages.map((p) => <div className="we-row" key={p.slug}><FileText size={15} />{p.label}<small>Updated</small></div>) : <p className="we-note">No page content changes.</p>}{removedPages.map((item) => <div className="we-row" key={item.slug}><Trash2 size={15} />{item.label}<small>Removed</small></div>)}{navigationChanged && <div className="we-row"><Layers size={15} />Navigation updated</div>}{chromeChanged && <div className="we-row"><Settings2 size={15} />Header and footer updated</div>}{brandChanged && <div className="we-row"><Palette size={15} />Brand settings updated</div>}{draft.theme !== persisted.published?.theme && <div className="we-row"><Palette size={15} />Theme: {draft.theme}</div>}
        <div className="we-caption">When</div>
        <label className="we-row"><Input variant="seamless" type="radio" name="publish-when" checked={publishWhen === 'now'} onChange={() => setPublishWhen('now')} />Publish now</label>
        <label className="we-row"><Input variant="seamless" type="radio" name="publish-when" checked={publishWhen === 'schedule'} onChange={() => setPublishWhen('schedule')} />Schedule</label>
        {publishWhen === 'schedule' && <label className="we-field">Publish date and time<Input variant="seamless" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} /><span>Uses your local time zone.</span></label>}
        {scheduledNotice}<div className="we-actions"><button type="button" className="we-action" disabled={publishDisabled} onClick={publishAction}>{publishLabel}<ArrowRight size={15} /></button><a className="we-action secondary" href={`https://${host}/`} target="_blank" rel="noreferrer">View website</a></div>{error && <p className="we-error" role="alert">{error}</p>}
        <div className="we-caption">Versions</div>{versionsList}</>}
    </Dialog></div>}
  </div>
}
