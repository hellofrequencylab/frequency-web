'use client'

/* eslint-disable @next/next/no-img-element -- website assets retain their original host and crop */

import { slugify } from '@/lib/utils'
import { Input, Textarea } from '@/components/ui/field'
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type ReactNode, type KeyboardEvent } from 'react'
import { ArrowRight, ChevronDown, ChevronLeft, Copy, Eye, FileText, Globe, Layers, Lock, MessageSquare, Minus, Monitor, PanelLeft, PanelRight, Palette, Plus, Radio, Redo2, Search, Settings2, Trash2, Smartphone, Tablet, Undo2, X } from 'lucide-react'
import type { Config, Data, Metadata } from '@/lib/page-editor/types'
import { addBlock, buildOutline, derivePickerGroups, duplicateBlockDeep, findBlockDeep, moveBlockTo, nudgeBlock, removeBlockDeep, updateBlockPropsDeep, type OutlineNode } from '@/components/page-editor/mobile/data-ops'
import { inlineFieldValue, replaceInlineField } from '@/lib/sites/editor/inline-edit'
import { resetDocumentPlacements, sectionDeviceLayout } from '@/lib/sites/editor/layout'
import { pendingChangeLabels, publishChecks } from '@/lib/sites/editor/publish-checks'
import { websiteThemeVars, WEBSITE_TOKEN_CSS } from '@/lib/sites/editor/theme'
import { WEBSITE_PAGE_TEMPLATES, websiteTemplateSections } from '@/lib/sites/editor/templates'
import { editorBlockMeta, editorPickerGroups, VERA_SUGGESTIONS } from '@/lib/sites/editor/block-meta'
import { FqIcon, type FqEditorIconName, type FqIconName } from '@/components/frequency/icon'
import { WEBSITE_THEMES, WEBSITE_THEMES_LIVE, RESERVED_WEBSITE_SLUGS, validWebsiteSnapshot, resolveWebsiteBrand, updateSectionDisplay, setSectionVisibility, sectionVisibility, patchSectionBase, type WebsiteSnapshot, type WebsiteEditorState, type Device, type WebsitePresence, type SectionDisplay } from '@/lib/sites/editor/state'
import type { MwLive } from '@/lib/sites/menswork-data'
import { SITE_LOOK_OPTIONS, SITE_THEMES, THEME_LOOK, siteLook, siteLookOverrides, sitePageStyle, type SiteLookKey, type SiteStyle, type SiteThemeId } from '@/lib/theme/site-style'
import { EDITOR_THEME_OF, siteCanvasVars, siteRenderStyle } from '@/lib/sites/site-render-style'
import type { SiteLinkMap } from '@/lib/sites/house-theme'
import { LoomPicker } from '@/components/loom/loom-picker'
import dynamic from 'next/dynamic'
// The canvas loads on the client; until it does the stage says so instead of standing empty.
const WebsiteCanvas = dynamic(() => import('./canvas').then((module) => module.WebsiteCanvas), { ssr: false, loading: () => <div className="we-canvas-loading" role="status">Loading your page…</div> })
import type { FieldFocus } from '@/lib/sites/editor/field-sync'
import { WebsiteInspector, WebsiteChromeInspector } from './inspector'
import { SiteMenuEditor } from '@/components/spaces/site-menu-editor'
import { VeraDock } from './vera-dock'
import { SectionIcon, sectionLine } from './section-icon'
import { FQ_EDITOR, k, on } from './skin'
import './editor.css'
import '@/app/themes/active/kit-editor'
import '@/app/themes/active/editor-shell'

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
  /** The Space type's default accent (defaultAccentForType): what the live site paints when no brand accent is set. */
  defaultAccent?: string | null
  /** The `--font-*` classes of the theme faces the canvas may wear (Network, Wildheart), set on the editor root so
   *  the canvas frame copies them; the editor's own chrome wears the Frequency design system. */
  fontClass?: string
  /** The Space's own domain when it has one (spaces.domain); the Frequency Site tab shows it. */
  domain?: string | null
}
/** What the shortcut handler reads: a React key event (DAWN's root onKeyDown) or the document's (Frequency). */
type KeyLike = Pick<globalThis.KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'target' | 'preventDefault'>
/** The design's search-description length (Page Editor.html, Site tab: "Description 118 / 160") and title length. */
/** Undo depth: the Frequency design's 60 steps; DAWN keeps its 30. */
const HISTORY_DEPTH = FQ_EDITOR ? 60 : 30
const SEO_TITLE_ADVISED = 60
const SEO_DESCRIPTION_ADVISED = 160
function savedAgo(at: number, now: number) {
  const minutes = Math.floor((now - at) / 60000)
  return minutes < 1 ? 'just now' : minutes < 60 ? `${minutes} min ago` : `${Math.floor(minutes / 60)} hr ago`
}
function readMobileViewport() { return window.matchMedia('(max-width:767px)').matches }
function subscribeViewport(callback: () => void) {
  const query = window.matchMedia('(max-width:767px)')
  query.addEventListener('change', callback)
  return () => query.removeEventListener('change', callback)
}

/** The editor's stored theme ids under their names (ADR-1726): Menswork is Bold, DAWN is Frequency. Midnight
 *  is retired (ADR-1728): a draft that still carries it is offered the two themes. */
const WEBSITE_THEME_LABEL: Record<(typeof WEBSITE_THEMES)[number], string> = { Menswork: 'Bold', DAWN: 'Default', Midnight: 'Midnight', Wildheart: 'Wildheart', Network: 'Network' }
const EDITOR_THEME = EDITOR_THEME_OF
/** The site theme an editor theme stands for (the inverse of EDITOR_THEME; a retired theme reads as Frequency). */
const siteThemeOf = (theme: (typeof WEBSITE_THEMES)[number]): SiteThemeId => (theme === 'Menswork' ? 'bold' : theme === 'Wildheart' ? 'wildheart' : theme === 'Network' ? 'network' : 'frequency')
/** A page's publish state in the design's words (Pages tab and page menu dots). */
type PageState = 'live' | 'changed' | 'draft'
const PAGE_STATE_LABEL: Record<PageState, string> = { live: 'Published', changed: 'Draft changes', draft: 'Not published yet' }
const LOOK_LABEL: Record<SiteLookKey, string> = { corners: 'Corners', spacing: 'Spacing', header: 'Header', footer: 'Footer' }
const DEFAULT_STYLE: SiteStyle = { theme: 'frequency', fonts: 'frequency', synced: true, spaceFonts: 'frequency', look: { corners: null, spacing: null, header: null, footer: null } }

/** The design system's faces (Unbounded, Hanken Grotesk, Instrument Serif), asked for by the editor alone: the
 *  root layout never registers them (DEPLOY-SAFETY), and the CSP allows Google Fonts. */
const DS_FACES = 'https://fonts.googleapis.com/css2?family=Unbounded:wght@500;600&family=Hanken+Grotesk:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap'
const TABS: { label: Tab; icon: typeof FileText }[] = [{ label: 'Pages', icon: FileText }, { label: 'Layers', icon: Layers }, { label: 'Add', icon: Plus }, { label: 'Theme', icon: Palette }, { label: 'Site', icon: Settings2 }]
/** The rail tabs' icons in the design (Page Editor.html): page, layers, plus, palette, settings. */
const TAB_ICON: Record<Tab, FqIconName | FqEditorIconName> = { Pages: 'page', Layers: 'layers', Add: 'plus', Theme: 'palette', Site: 'settings' }
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

function Icon({ label, hint, children, className = '', ...props }: { label: string; hint?: string; children: ReactNode; className?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={k(`we-icon ${className}`)} aria-label={label} title={hint ?? label} {...props}>{children}</button>
}

export function WebsiteEditorShell({ host, brandName, logo, brandAccent, author, initial, config, metadata, live, links, origin, onSave, onPropose, onPresence, siteStyle, defaultAccent, onStyle, fontClass, domain }: WebsiteEditorShellProps) {
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
  // The DAWN Site Editor (LIVE-907): the inspector's sub-tabs and the page menu in the top bar.
  const [inspTab, setInspTab] = useState<'content' | 'design' | 'advanced'>('content')
  const [pageMenu, setPageMenu] = useState(false)
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
  // The field the owner is typing in on the inspector, lit on the canvas (lib/sites/editor/field-sync.ts).
  const [fieldFocus, setFieldFocus] = useState<FieldFocus | null>(null)
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
  // When the draft last saved, for the design's "Draft saved · 2 min ago"; the clock ticks once a minute.
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { if (!FQ_EDITOR) return; const timer = window.setInterval(() => setNow(Date.now()), 60000); return () => window.clearInterval(timer) }, [])
  const veraInput = useRef<HTMLInputElement>(null)
  const pickRef = useRef<HTMLDivElement>(null)
  const uid = useId()
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
  // THE PREVIEW IS THE PUBLISHED PAGE: the theme, the font set and the brand accent resolve through the live
  // site's own resolver (lib/sites/site-render-style.ts) over the editor's live style, so a Theme tab pick
  // repaints the canvas at once and a Frequency site wears the owner's fonts and accent, not DAWN's defaults.
  const pageTheme = style.pages?.[page.slug] ?? null
  const pageSlugNow = page.slug
  const draftTheme = draft.theme
  const brandAccentNow = websiteBrand.accent
  const render = useMemo(() => siteRenderStyle(sitePageStyle({ ...style, theme: siteThemeOf(draftTheme) }, pageSlugNow), brandAccentNow, defaultAccent ?? null), [style, draftTheme, pageSlugNow, brandAccentNow, defaultAccent])
  const canvasTheme = render.editorTheme
  const canvasVars = useMemo(() => siteCanvasVars(render), [render])
  const pageLookStyle = render.lookStyle
  const activeAccent = render.accent
  const accentValue = String(canvasVars['--th-accent' as keyof React.CSSProperties])
  const colorInputValue = /^#[0-9a-f]{3}$/i.test(accentValue) ? `#${accentValue.slice(1).split('').map((part) => part + part).join('')}` : accentValue
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

  // THE CHANGE LOG (Frequency, HANDOFF-PAGE-EDITOR.md §7): each mutation's human label ("Edited Hero",
  // "Reordered sections", "Removed FAQ"), deduped, for the Publish badge and the publish modal. View state only;
  // it clears on publish. DAWN ignores the labels.
  const [changes, setChanges] = useState<string[]>(() => (FQ_EDITOR ? pendingChangeLabels(initial.draft, initial.published) : []))
  // A TYPING BURST (Frequency): consecutive edits that share a burst key (one field, one focus) make ONE undo
  // step. Any other mutation, an undo, or focus leaving the field ends the burst.
  const burst = useRef<string | null>(null)
  const commit = useCallback((next: WebsiteSnapshot, meta?: { label?: string; burst?: string }) => {
    if (!validWebsiteSnapshot(next)) { setError('This change exceeds the website’s supported limits. Keep up to 30 pages, 200 sections per page and 100 comments per page. Your saved draft is unchanged.'); return }
    if (JSON.stringify(next) === JSON.stringify(latest.current)) return
    setError('')
    const continuing = FQ_EDITOR && !!meta?.burst && burst.current === meta.burst
    if (!continuing) history.current = [...history.current.slice(-(HISTORY_DEPTH - 1)), latest.current]
    burst.current = FQ_EDITOR ? meta?.burst ?? null : null
    future.current = []
    setDraft(next); latest.current = next; setStatus('unsaved'); setHistoryCounts({ past: history.current.length, future: future.current.length })
    const label = meta?.label
    if (FQ_EDITOR && label) setChanges((list) => (list.includes(label) ? list : [...list, label]))
  }, [])
  // Focus leaving a field closes its typing burst, so the next edit there is a new undo step.
  useEffect(() => {
    if (!FQ_EDITOR) return
    const end = () => { burst.current = null }
    document.addEventListener('focusout', end)
    return () => document.removeEventListener('focusout', end)
  }, [])
  const blockName = (id: string | null | undefined, doc = page.doc) => { const type = id ? findBlockDeep(doc, config, id)?.type : undefined; return type ? config.components[type]?.label ?? type : 'Section' }
  function updateDoc(doc: Data, meta?: { label?: string; burst?: string }) {
    const layout = doc.root.props?.websiteLayout
    if (layout && typeof layout === 'object') doc = { ...doc, root: { ...doc.root, props: { ...doc.root.props, websiteLayout: Object.fromEntries(Object.entries(layout).filter(([id]) => !!findBlockDeep(doc, config, id))) } } }
    commit({ ...latest.current, pages: latest.current.pages.map((p) => p.slug === page.slug ? { ...p, doc, comments: p.comments.filter((comment) => !!findBlockDeep(doc, config, comment.blockId)) } : p) }, meta) }
  const updateDisplay = useCallback((id: string, value: SectionDisplay | null, typing = false) => {
    const current = latest.current
    const target = current.pages.find((p) => p.slug === page.slug)
    const type = target ? findBlockDeep(target.doc, config, id)?.type : undefined
    commit({ ...current, pages: current.pages.map((p) => p.slug === page.slug ? { ...p, doc: updateSectionDisplay(p.doc, id, device, value) } : p) }, { label: `Styled ${type ? config.components[type]?.label ?? type : 'section'}`, burst: typing ? `display:${id}` : undefined })
  }, [page.slug, device, commit, config])
  /** Frequency: write a section's per-device visibility, or its all-device tone / width / anchor. */
  function updateSection(id: string, change: (doc: Data) => Data, label: string) {
    commit({ ...latest.current, pages: latest.current.pages.map((p) => p.slug === page.slug ? { ...p, doc: change(p.doc) } : p) }, { label })
  }
  function setVisible(id: string, target: Device, visible: boolean) {
    updateSection(id, (doc) => setSectionVisibility(doc, id, target, visible), 'Visibility')
    say(visible ? `Showing on ${target}` : `Hidden on ${target}`)
  }
  function editProps(id: string, props: Record<string, unknown>, typing = false) { updateDoc(updateBlockPropsDeep(page.doc, config, id, props), { label: `Edited ${blockName(id)}`, burst: typing ? `props:${page.slug}:${id}` : undefined }) }
  function travel(redo: boolean) {
    const stack = redo ? future.current : history.current
    const next = stack.pop()
    if (!next) return
    burst.current = null
    if (redo) history.current.push(latest.current); else future.current.push(latest.current)
    setDraft(next); latest.current = next; setStatus('unsaved'); setHistoryCounts({ past: history.current.length, future: future.current.length })
    // Undoing back to what is live empties the change log, so the badge and modal never list undone work.
    if (FQ_EDITOR && pendingChangeLabels(next, persisted.published).length === 0) setChanges([])
    say(redo ? 'Redone' : 'Undone')
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
      setSavedAt(Date.now()); setNow(Date.now())
      if (publish || schedule) { setModal(null); setChanges([]); say(schedule ? `Scheduled for ${new Date(schedule).toLocaleString()}` : `Published to ${host}`) }
    } catch { setStatus('error'); setError('Could not reach your website. Your changes are still here. Try saving again.') }
    finally { busy.current = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- say() and host only phrase the toast
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
  function select(id: string) { if (id !== selectedId) { setTextSelection(null); setFieldFocus(null) } setSelectedId(id); setPanel('inspect'); setRight(true) }
  // Frequency opens the rail's Add tab at that position (the design's insert points); DAWN opens its dialog.
  function insert(index: number) { setInsertAt(index); setFilter(''); if (FQ_EDITOR) { setTab('Add'); setLeft(true); setPreview(false) } else setModal('insert') }
  function pickBlock(type: string) {
    const added = addBlock(page.doc, config, type)
    if (!added.id) return
    // Frequency with no insert point adds after the selected section, as the design's Add tab does.
    const selectedIndex = selectedId ? page.doc.content.findIndex((block) => block.props.id === selectedId) : -1
    const at = insertAt ?? (FQ_EDITOR && selectedIndex >= 0 ? selectedIndex + 1 : null)
    const doc = at === null ? added.data : moveBlockTo(added.data, config, added.id, { parentId: null, slotKey: null, index: at })
    updateDoc(doc, { label: `Added ${config.components[type]?.label ?? type}` }); select(added.id); setModal(null); setInsertAt(null); if (FQ_EDITOR) { setTab('Layers'); say(`${config.components[type]?.label ?? type} added`) }
  }
  function action(id: string, kind: 'up' | 'down' | 'copy' | 'comment' | 'delete' | 'hide') {
    if (kind === 'comment') { setSelectedId(id); setPanel('comments'); setRight(true); return }
    if (kind === 'hide') { const display = sectionDeviceLayout(page.doc, id, device); updateDisplay(id, { ...display, hidden: !display.hidden }); return }
    if (kind === 'up' || kind === 'down') updateDoc(nudgeBlock(page.doc, config, id, kind === 'up' ? -1 : 1), { label: 'Reordered sections' })
    const name = config.components[findBlockDeep(page.doc, config, id)?.type ?? '']?.label ?? 'Section'
    if (kind === 'copy') { const next = duplicateBlockDeep(page.doc, config, id); updateDoc(next.data, { label: `Added ${name}` }); if (next.id) select(next.id); say(`${name} duplicated`) }
    if (kind === 'delete') { const at = page.doc.content.findIndex((b) => b.props.id === id); updateDoc(removeBlockDeep(page.doc, config, id).data, { label: `Removed ${name}` }); setSelectedId(page.doc.content[at + 1]?.props.id ?? page.doc.content[at - 1]?.props.id ?? null); say(`${name} removed. Undo with ⌘Z.`) }
  }
  function reorderSections(ids: string[], targetId: string) {
    const content = page.doc.content
    const moving = content.filter((block) => ids.includes(block.props.id!))
    const remaining = content.filter((block) => !ids.includes(block.props.id!))
    const target = remaining.findIndex((block) => block.props.id === targetId)
    if (!moving.length || target < 0) return
    updateDoc({ ...page.doc, content: [...remaining.slice(0, target), ...moving, ...remaining.slice(target)] }, { label: 'Reordered sections' })
  }
  function pickPage(slug: string) { setTextSelection(null); setFieldFocus(null); setPageSlug(slug); setSelectedId(null); setPanel('inspect'); if (window.matchMedia('(max-width:767px)').matches) setLeft(false) }
  function togglePreview(next = !preview) { setPreview(next); if (FQ_EDITOR) say(next ? 'Preview. Press Esc to keep editing.' : 'Back to editing') }
  function keys(e: KeyLike) {
    const target = e.target as HTMLElement
    const mod = e.metaKey || e.ctrlKey
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); void save(); return }
    // The design's shortcuts: ⌘P previews, ⌘K asks Vera (both designs; Frequency also announces the preview).
    if (mod && e.key.toLowerCase() === 'p') { e.preventDefault(); togglePreview(); return }
    if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); if (FQ_EDITOR) { if (preview) setPreview(false); veraInput.current?.focus() } else document.querySelector<HTMLInputElement>('.we-vera-bar input')?.focus(); return }
    if (e.key === 'Escape') { setModal(null); if (preview) togglePreview(false); setPickOpen(false); setPageMenu(false); return }
    if (!target?.closest || target.closest('input,textarea,select,[contenteditable=true]')) return
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); travel(e.shiftKey) }
    if (e.key === '/') { e.preventDefault(); insert(page.doc.content.length) }
  }
  // Frequency listens on the document, so the shortcuts work before anything in the editor has focus.
  const keysRef = useRef(keys)
  useEffect(() => { keysRef.current = keys })
  useEffect(() => {
    if (!FQ_EDITOR) return
    const listener = (event: globalThis.KeyboardEvent) => { if (!event.defaultPrevented) keysRef.current(event) }
    document.addEventListener('keydown', listener)
    return () => document.removeEventListener('keydown', listener)
  }, [])
  // The page menu closes on a click outside it, as the design's does.
  useEffect(() => {
    if (!pickOpen) return
    const close = (event: MouseEvent) => { if (!pickRef.current?.contains(event.target as Node)) setPickOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [pickOpen])
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
    commit({ ...draft, pages: [...draft.pages, { slug, label, doc, seo: { title: '', description: '' }, comments: [] }] }, { label: `Added page ${label}` })
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
  async function askVera(text = request, prefer?: string[]) {
    if (text.trim().startsWith('/')) { setRequest(''); insert(page.doc.content.length); return }
    if (!text.trim() || asking) return
    setVeraStatus(''); setRequest('')
    const selection = textSelection?.blockId === selectedId ? textSelection : null
    const preferred = prefer && selected ? prefer.find((key) => typeof selected.props[key] === 'string' && (selected.props[key] as string).trim() && ['text', 'textarea'].includes(String(config.components[selected.type]?.fields?.[key]?.type))) : undefined
    const field = selection?.field ?? preferred ?? (selected && Object.entries(config.components[selected.type]?.fields ?? {}).find(([k, f]) => (f.type === 'textarea' || f.type === 'text') && typeof selected.props[k] === 'string' && selected.props[k].length > 30)?.[0])
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
    commit({ ...draft, pages: draft.pages.map((p) => p.slug === target.slug ? { ...p, doc: updateBlockPropsDeep(p.doc, config, proposal.blockId, { [proposal.field]: replaceInlineField(block.props, { field: proposal.field, path: proposal.path, start: 0, end: proposal.before.length }, proposal.after) }) } : p) }, { label: `Edited ${config.components[block.type]?.label ?? block.type}` })
    setProposal(null); setVeraStatus('Applied to your draft. Undo is available above.')
  }
  function openChrome(area: 'header' | 'footer') { setTextSelection(null); setSelectedId(null); setPanel(area); setRight(true) }
  function movePage(direction: -1 | 1) {
    const index = draft.pages.indexOf(page), target = index + direction
    if (page.slug === 'home' || target < 1 || target >= draft.pages.length) return
    const pages = [...draft.pages]; [pages[index], pages[target]] = [pages[target], pages[index]]
    commit({ ...draft, pages }, { label: 'Reordered pages' })
  }
  function renderLayers(nodes: OutlineNode[], parentId: string | null = null, slotKey: string | null = null, depth = 0): ReactNode {
    return nodes.map((node, index) => <div key={node.id} draggable onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', node.id) }} onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); if (dropId !== node.id) setDropId(node.id) }} onDragEnd={() => setDropId(null)} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); setDropId(null); const id = event.dataTransfer.getData('text/plain'); if (id !== node.id && findBlockDeep(page.doc, config, id)) updateDoc(moveBlockTo(page.doc, config, id, { parentId, slotKey, index }), { label: 'Reordered sections' }) }}>
      {FQ_EDITOR
        ? <button type="button" className={`row${on(selectedId === node.id)}${dropId === node.id ? ' drop-before' : ''}${depth === 0 && sectionDeviceLayout(page.doc, node.id, device).hidden ? ' off' : ''}`} style={{ paddingLeft: 8 + depth * 14 }} aria-pressed={selectedId === node.id} aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown" title="Drag, or press Alt and an arrow key, to move" onClick={() => select(node.id)} onKeyDown={(event) => { if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return; event.preventDefault(); updateDoc(nudgeBlock(page.doc, config, node.id, event.key === 'ArrowUp' ? -1 : 1), { label: 'Reordered sections' }) }}><span className="grip" aria-hidden>⋮⋮</span><span className="ic"><FqIcon name={editorBlockMeta(config, node.type).icon} /></span><span className="t">{node.label}{node.summary && node.summary !== node.label && <small>{node.summary}</small>}</span>{editorBlockMeta(config, node.type).live ? <span className="meta">Live</span> : depth === 0 && <span className="meta">{index + 1}</span>}</button>
        : (() => { const block = findBlockDeep(page.doc, config, node.id); const hidden = !!block && depth === 0 && !!sectionDeviceLayout(page.doc, node.id, device).hidden; return <button type="button" className="we-row we-layer" data-off={hidden || undefined} style={depth ? { paddingLeft: 8 + depth * 14 } : undefined} aria-pressed={selectedId === node.id} onClick={() => select(node.id)}><i className="we-row-ic"><SectionIcon type={node.type} /></i><b className="we-row-t"><span>{node.label}</span><small>{sectionLine((block?.props ?? {}) as Record<string, unknown>, node.summary)}</small></b><em className="we-row-meta">{/^(Space|Live)/.test(node.type) || /Events|Circles|Tiers/.test(node.type) ? 'Live' : depth === 0 ? index + 1 : ''}</em><span className="we-grip" aria-hidden>⋮⋮</span></button> })()}
      {node.slots.map((slot) => <div key={slot.key}>{slot.children.length > 0 && <span className={k('we-layer-slot')} style={{ paddingLeft: 24 + depth * 14 }}>{slot.label}</span>}{renderLayers(slot.children, node.id, slot.key, depth + 1)}</div>)}
    </div>)
  }
  const palette = FQ_EDITOR ? <>
    <label className="search"><FqIcon name="search" /><span className="sr-only">Search blocks</span><Input placeholder="Search blocks" value={filter} onChange={(e) => setFilter(e.target.value)} /></label>
    {insertAt !== null && <div className="note">Adding at position <b>{insertAt + 1}</b>. Pick a block.</div>}
    {editorPickerGroups(config, groups).map((group) => { const items = group.items.filter((c) => c.label.toLowerCase().includes(filter.toLowerCase())); return items.length ? <div key={group.key}><div className="cap">{group.title}</div><div className="blocks">{items.map((c) => <button key={c.type} type="button" className="blk" disabled={c.disabled} title={c.disabled ? c.reason : undefined} onClick={() => pickBlock(c.type)}><span className="th" aria-hidden><i className="a s" /><i className="w" /><i /></span>{c.label}<small>{editorBlockMeta(config, c.type).live ? 'From your Space' : 'Editable'}</small></button>)}</div></div> : null })}
  </> : <>
    <label className="we-field"><span className="sr-only">Filter sections</span><Input variant="seamless" className="we-search" placeholder="Type to filter sections" value={filter} onChange={(e) => setFilter(e.target.value)} /></label>
    {groups.map((group) => <div key={group.key}><div className="we-caption">{group.title}</div>{group.items.filter((c) => c.label.toLowerCase().includes(filter.toLowerCase())).map((c) => <button key={c.type} type="button" className="we-row" disabled={c.disabled} onClick={() => pickBlock(c.type)}><span>{/^(Space|Live)/.test(c.type) ? <Radio size={16} /> : <Plus size={16} />}</span><span>{c.label}</span></button>)}</div>)}
  </>
  // ── FREQUENCY's Site and Theme tabs (Page Editor.html): the design's layout over the REAL settings. Site:
  // this page's search title and description with the design's counters, the website address, and the
  // custom domain the Space has (managed on the Space's website settings; there is no one-click switch for
  // it, so it is a link, not a toggle). Theme: the site themes (Default / Bold / Wildheart, ADR-1748), the
  // brand accent, the font pairing that comes WITH the theme (ADR-1741: no separate font pick), the global
  // styles and the logo. Nothing here is invented: every control writes what DAWN's tabs write.
  const pageState = (slug: string): PageState => !persisted.published?.pages.some((b) => b.slug === slug) ? 'draft' : changedPages.some((p) => p.slug === slug) ? 'changed' : 'live'
  const seoTitle = (value: string) => commit({ ...draft, pages: draft.pages.map((p) => p.slug === page.slug ? { ...p, seo: { ...p.seo, title: value } } : p) }, { label: 'Search and sharing', burst: `seo-title:${page.slug}` })
  const seoDescription = (value: string) => commit({ ...draft, pages: draft.pages.map((p) => p.slug === page.slug ? { ...p, seo: { ...p.seo, description: value } } : p) }, { label: 'Search and sharing', burst: `seo-description:${page.slug}` })
  const domainHost = domain?.trim().toLowerCase() || null
  const fqSiteTab = <>
    <div className="cap">Search and sharing · {page.label}</div>
    <div className="fld"><label htmlFor={`${uid}-site-title`}>Page title <em>{page.seo.title.length} / {SEO_TITLE_ADVISED}</em></label><Input id={`${uid}-site-title`} className="in" value={page.seo.title} placeholder={`${page.label} | ${brandName}`} maxLength={200} onChange={(e) => seoTitle(e.target.value)} /></div>
    <div className="fld"><label htmlFor={`${uid}-site-description`}>Description <em>{page.seo.description.length} / {SEO_DESCRIPTION_ADVISED}</em></label><Textarea id={`${uid}-site-description`} className="in" value={page.seo.description} maxLength={500} onChange={(e) => seoDescription(e.target.value)} /></div>
    {(page.seo.title.length > SEO_TITLE_ADVISED || page.seo.description.length > SEO_DESCRIPTION_ADVISED) && <p className="note">Search results cut titles past {SEO_TITLE_ADVISED} characters and descriptions past {SEO_DESCRIPTION_ADVISED}.</p>}
    <div className="cap">Address</div>
    <div className="fld"><Input className="in" readOnly aria-label="Website address" value={host} /></div>
    <div className="tg"><span>Custom domain<small>{domainHost ? `${domainHost} · ${domainHost === host.toLowerCase() ? 'connected' : 'waiting to connect'}` : 'Not set up'}</small></span><a className="btn sm" href={`${origin}/spaces/${links.slug}/manage`} target="_blank" rel="noreferrer">{domainHost ? 'Manage' : 'Set up'}</a></div>
    <div className="cap">Website</div>
    <button type="button" className="row" onClick={() => openChrome('header')}><span className="ic"><FqIcon name="layers" /></span><span className="t">Header and navigation</span></button>
    <button type="button" className="row" onClick={() => openChrome('footer')}><span className="ic"><FqIcon name="layers" /></span><span className="t">Footer</span></button>
    <button type="button" className="row" onClick={() => setModal('menu')}><span className="ic"><FqIcon name="link" /></span><span className="t">Menu and logo<small>Shared with your Space page</small></span></button>
    <a className="row" href={`${origin}/spaces/${links.slug}`} target="_blank" rel="noreferrer"><span className="ic"><FqIcon name="space" /></span><span className="t">Space home</span></a>
  </>
  const themeFonts = String(canvasVars['--th-display' as keyof React.CSSProperties] ?? '').split(',')[0].replaceAll("'", '')
  const bodyFont = String(canvasVars['--th-body' as keyof React.CSSProperties] ?? '').split(',')[0].replaceAll("'", '')
  const spaceAccent = brandAccent && /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(brandAccent) ? brandAccent : null
  const fqThemeTab = <>
    <div className="cap">Theme</div>
    {SITE_THEMES.map((t) => { const theme = EDITOR_THEME[t.id]; return <button type="button" key={t.id} className={`theme${on(draft.theme === theme)}`} aria-pressed={draft.theme === theme} onClick={() => { if (theme === draft.theme) return; commit({ ...draft, theme, pages: draft.pages.map((item) => ({ ...item, doc: resetDocumentPlacements(item.doc) })) }, { label: 'Theme' }); void saveStyle({ theme: t.id }, { ...style, theme: t.id, fonts: t.defaultFonts }); say('Theme updated') }}>
      <span className="sw" style={websiteThemeVars(theme)} aria-hidden><i data-swatch="bg" /><i data-swatch="accent" /></span><span><b>{WEBSITE_THEME_LABEL[theme]}</b><small>{t.description}</small></span></button> })}
    {draft.theme === 'Midnight' && <p role="note" className="note">Midnight is retired. Pick Default or Bold to keep editing in a theme your live site can wear.</p>}
    <div className="cap">Accent</div>
    <div className="swatches" role="group" aria-label="Accent">
      <button type="button" className={on(!draft.brand?.accent).trim() || undefined} aria-pressed={!draft.brand?.accent} aria-label="Theme accent" title="Theme accent" data-swatch="theme" onClick={() => commit({ ...draft, brand: { ...draft.brand, accent: null } }, { label: 'Accent' })} />
      {spaceAccent && <button type="button" className={on(draft.brand?.accent?.toLowerCase() === spaceAccent.toLowerCase()).trim() || undefined} aria-pressed={draft.brand?.accent?.toLowerCase() === spaceAccent.toLowerCase()} aria-label="Your Space's brand colour" title="Your Space's brand colour" style={{ background: spaceAccent }} onClick={() => commit({ ...draft, brand: { ...draft.brand, accent: spaceAccent } }, { label: 'Accent' })} />}
      <label className="swatch-pick" title="Pick a colour"><span className="sr-only">Pick an accent colour</span><Input type="color" value={colorInputValue} onChange={(event) => commit({ ...draft, brand: { ...draft.brand, accent: event.target.value } }, { label: 'Accent', burst: 'accent' })} /></label>
    </div>
    <div className="cap">Type</div>
    <div className="row on" role="note"><span className="ic type-aa" aria-hidden>Aa</span><span className="t">{themeFonts}{bodyFont && bodyFont !== themeFonts ? ` + ${bodyFont}` : ''}<small>Comes with the {WEBSITE_THEME_LABEL[draft.theme]} theme</small></span></div>
    <div className="cap">Style</div>{(Object.keys(SITE_LOOK_OPTIONS) as SiteLookKey[]).map((key) => <div key={key} className="fld"><span className="l">{LOOK_LABEL[key]}</span><div className="seg wrap" role="group" aria-label={LOOK_LABEL[key]}>{SITE_LOOK_OPTIONS[key].map((o) => <button type="button" key={o.id} className={on(siteLook(lookStyle)[key] === o.id).trim() || undefined} aria-pressed={siteLook(lookStyle)[key] === o.id} onClick={() => { const stored = o.id === THEME_LOOK[lookStyle.theme][key] ? null : o.id; void saveStyle({ look: { [key]: stored } }, { ...style, look: { ...style.look, [key]: stored } }) }}>{o.label}</button>)}</div></div>)}
    {styleError && <p role="alert" className="note err">{styleError}</p>}
    <div className="cap">Logo</div>{activeLogo && <img className="we-logo-preview" src={activeLogo} alt={`${brandName} logo`} />}
    <div className="acts"><button type="button" className="btn sm" onClick={() => setChoosingLogo(true)}>Change logo</button>{activeLogo && <button type="button" className="btn sm" onClick={() => commit({ ...draft, brand: { ...draft.brand, logo: null } }, { label: 'Logo' })}>Remove logo</button>}</div>
    <div className="note">The theme and styles change your live site as soon as you pick them. Words, photos and live blocks stay as they are.</div>
  </>
  // ── The rail tabs and inspector panels, shared by both designs. Under DAWN the rail tabs are the Site Editor's
  // (LIVE-907); under Frequency, the kit's. Class names go through k() (skin.ts). The handlers are the same either way.
  const pressedChoice = (pressed: boolean) => (FQ_EDITOR ? on(pressed).trim() || undefined : 'we-action secondary')
  const layersTab = FQ_EDITOR
    ? <><div className="cap">Page · {page.label}<button type="button" onClick={() => insert(page.doc.content.length)}>+ Add</button></div><button type="button" className={`row chrome${on(panel === 'header')}`} onClick={() => openChrome('header')}><span className="ic"><FqIcon name="layers" /></span><span className="t">Header<small>Logo, menu, button</small></span><span className="meta">Site</span></button>{outline.length ? renderLayers(outline) : <div className="note"><b>This page is empty.</b> Add a section to start, or pick one from the Add tab.</div>}<button type="button" className={`row chrome${on(panel === 'footer')}`} onClick={() => openChrome('footer')}><span className="ic"><FqIcon name="layers" /></span><span className="t">Footer<small>Tagline, address, links</small></span><span className="meta">Site</span></button></>
    : <><div className="we-caption"><span>Page · {page.label}</span><button type="button" onClick={() => insert(page.doc.content.length)}>+ Add</button></div><button type="button" className="we-row we-chrome-row" aria-pressed={panel === 'header'} onClick={() => openChrome('header')}><i className="we-row-ic"><Lock size={15} aria-hidden /></i><b className="we-row-t"><span>Header</span><small>Logo, menu, button</small></b><em className="we-row-meta">Site</em></button>{renderLayers(outline)}<button type="button" className="we-row we-chrome-row" aria-pressed={panel === 'footer'} onClick={() => openChrome('footer')}><i className="we-row-ic"><Lock size={15} aria-hidden /></i><b className="we-row-t"><span>Footer</span><small>Address, links</small></b><em className="we-row-meta">Site</em></button></>
  const pagesTab = FQ_EDITOR
    ? <><div className="cap">{draft.pages.length} {draft.pages.length === 1 ? 'page' : 'pages'}<button type="button" disabled={draft.pages.length >= 30} onClick={() => setModal('templates')}>+ New page</button></div>{draft.pages.map((p) => { const state = pageState(p.slug); return <button type="button" className={`row${on(p.slug === page.slug)}`} key={p.slug} aria-current={p.slug === page.slug} onClick={() => pickPage(p.slug)}><span className="ic"><FqIcon name="page" /></span><span className="t">{p.label}<small>/{p.slug === 'home' ? '' : p.slug} · {PAGE_STATE_LABEL[state]}</small></span><span className={`dot ${state}`} aria-hidden /></button> })}
      <button type="button" className="row" onClick={() => { setPanel('page'); setRight(true) }}><span className="ic"><FqIcon name="settings" /></span><span className="t">Page settings<small>Name, page theme, order</small></span></button>
      <div className="cap">Start from</div>{WEBSITE_PAGE_TEMPLATES.map(({ name, description }) => <button type="button" key={name} className="row" disabled={draft.pages.length >= 30} onClick={() => setModal('templates')}><span className="ic"><FqIcon name="plus" /></span><span className="t">{name}<small>{description}</small></span></button>)}</>
    : <><div className="we-caption"><span>{draft.pages.length} {draft.pages.length === 1 ? 'page' : 'pages'}</span><button type="button" disabled={draft.pages.length >= 30} onClick={() => setModal('templates')}>+ New page</button></div>{draft.pages.map((p) => { const live = persisted.published?.pages.some((b) => b.slug === p.slug); const changed = changedPages.includes(p); return <button type="button" className="we-row" key={p.slug} aria-current={p.slug === page.slug} onClick={() => pickPage(p.slug)}><i className="we-row-ic"><FileText size={16} aria-hidden /></i><b className="we-row-t"><span>{p.label}</span><small>/{p.slug === 'home' ? '' : p.slug}</small></b><em className="we-row-meta"><i className="we-dot" data-tone={!live ? 'new' : changed ? 'draft' : 'live'} aria-hidden />{!live ? 'Draft' : changed ? 'Draft changes' : 'Published'}</em></button> })}
      <button type="button" className="we-row" disabled={draft.pages.length >= 30} onClick={() => setModal('templates')}><Plus size={15} />New page</button><button type="button" className="we-row" onClick={() => { setPanel('page'); setRight(true) }}><Settings2 size={15} />Page settings</button>
      <div className="we-caption">Site</div><a className="we-row" href={`https://${host}/`} target="_blank" rel="noreferrer"><Globe size={15} />{host}</a><button type="button" className="we-row" onClick={() => { setPanel('seo'); setRight(true) }}><Search size={15} />SEO and sharing</button></>
  const siteTab = FQ_EDITOR ? fqSiteTab : <><div className="we-caption">Website settings</div><button type="button" className="we-row" onClick={() => openChrome('header')}>Header and navigation</button><button type="button" className="we-row" onClick={() => openChrome('footer')}>Footer</button><button type="button" className="we-row" onClick={() => { setTab('Theme'); setLeft(true) }}>Theme and logo</button><button type="button" className="we-row" onClick={() => { setPanel('page'); setRight(true) }}>Page settings</button><button type="button" className="we-row" onClick={() => { setPanel('seo'); setRight(true) }}>SEO and sharing</button><a className="we-row" href={`https://${host}/`} target="_blank" rel="noreferrer">Open live website</a><a className="we-row" href={`${origin}/spaces/${links.slug}`} target="_blank" rel="noreferrer">Space home</a></>
  const themeTab = FQ_EDITOR ? fqThemeTab : <><div className="we-caption">Theme</div>{SITE_THEMES.map((t) => { const theme = EDITOR_THEME[t.id]; return <button type="button" key={t.id} className="we-theme-card" aria-pressed={draft.theme === theme} onClick={() => { if (theme === draft.theme) return; commit({ ...draft, theme, pages: draft.pages.map((item) => ({ ...item, doc: resetDocumentPlacements(item.doc) })) }); void saveStyle({ theme: t.id }, { ...style, theme: t.id, fonts: t.defaultFonts }) }}>
      <span className="we-theme-swatch" style={websiteThemeVars(theme)}><i style={{ background: 'var(--ed-chrome)' }} /><i style={{ background: 'var(--th-bg)' }}><b /></i></span><span><strong>{WEBSITE_THEME_LABEL[theme]}</strong><small>{t.description}</small></span>
      </button> })}{draft.theme === 'Midnight' && <p role="note" className="we-note">Midnight is retired. Pick Frequency or Bold to keep editing in a theme your live site can wear.</p>}
      {/* GLOBAL STYLES (ADR-1728): the same setting Identity and branding edits, live at once. */}
      <div className="we-caption">Global styles</div>{(Object.keys(SITE_LOOK_OPTIONS) as SiteLookKey[]).map((key) => <div key={key} className="we-field">{LOOK_LABEL[key]}<div className="we-choice-row" role="group" aria-label={LOOK_LABEL[key]}>{SITE_LOOK_OPTIONS[key].map((o) => <button type="button" key={o.id} className="we-action secondary" aria-pressed={siteLook(lookStyle)[key] === o.id} onClick={() => { const stored = o.id === THEME_LOOK[lookStyle.theme][key] ? null : o.id; void saveStyle({ look: { [key]: stored } }, { ...style, look: { ...style.look, [key]: stored } }) }}>{o.label}</button>)}</div></div>)}
      {styleError && <p role="alert" className="we-note">{styleError}</p>}
      <div className="we-caption">Logo</div>{activeLogo && <img className="we-logo-preview" src={activeLogo} alt={`${brandName} logo`} />}
      <div className="we-actions"><button type="button" className="we-action secondary" onClick={() => setChoosingLogo(true)}>Change logo</button>{activeLogo && <button type="button" className="we-action secondary" onClick={() => commit({ ...draft, brand: { ...draft.brand, logo: null } })}>Remove logo</button>}</div>
      <div className="we-caption">Brand accent</div><label className="we-field">Accent color<Input variant="seamless" type="color" value={colorInputValue} onChange={(event) => commit({ ...draft, brand: { ...draft.brand, accent: event.target.value } })} /></label><button type="button" className="we-action secondary" onClick={() => commit({ ...draft, brand: { ...draft.brand, accent: null } })}>Use theme accent</button><div className="we-swatch-list"><span className="we-swatch" style={{ background: 'var(--th-accent)' }} /><span className="we-swatch" style={{ background: 'var(--th-season)' }} /><span className="we-swatch" style={{ background: 'var(--th-text)' }} /></div>
      <div className="we-caption">Type</div>{['display', 'body', 'mono'].map((role) => <div className="we-note" key={role} style={canvasVars}>{role}<strong className="we-type-sample" data-role={role}>{String(canvasVars[`--th-${role}` as keyof React.CSSProperties]).split(',')[0].replaceAll("'", '')}</strong></div>)}
      <div className="we-note">The editor wears the theme it edits. The theme and global styles change your live site as soon as you pick them, here or in Identity and branding. Words, photos and live blocks stay as they are. Switching themes resets element positions to the new layout; Undo restores them.</div></>
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
    {panel === 'inspect' && (selected ? <WebsiteInspector key={`${page.slug}:${selectedId}`} part={FQ_EDITOR ? (shownTab === 'notes' ? 'content' : shownTab) : undefined} tab={FQ_EDITOR ? undefined : inspTab} metadata={metadata} sourceSettingsHref={`${origin}/spaces/${links.slug}/settings/${selected.type === 'SpaceOfferings' || selected.props.source === 'offerings' ? 'offerings' : /Events/.test(selected.type) || selected.props.source === 'events' ? 'calendar' : selected.props.source === 'memberships' ? 'memberships' : selected.props.source === 'tickets' ? 'tickets' : ''}`} config={config} block={selected} doc={page.doc} device={device} focus={textSelection && textSelection.blockId === selectedId ? { field: textSelection.field, path: textSelection.path } : null} onFieldFocus={(focus) => setFieldFocus(focus && selectedId ? { blockId: selectedId, ...focus } : null)} onChange={(props) => editProps(selectedId!, props, true)} onDisplay={(value) => updateDisplay(selectedId!, value, true)} {...(FQ_EDITOR ? { live: editorBlockMeta(config, selected.type).live, visibility: sectionVisibility(page.doc, selectedId!), onVisibility: (target: Device, visible: boolean) => setVisible(selectedId!, target, visible), onBase: (patch: Pick<SectionDisplay, 'tone' | 'width' | 'anchor'>) => updateSection(selectedId!, (doc) => patchSectionBase(doc, selectedId!, patch), `Styled ${blockName(selectedId)}`) } : {})} />  : <div className="we-empty"><span className="we-orb lg" aria-hidden /><strong>Nothing selected</strong><span>Click any section on the page, or pick one in Layers. Double-click text to edit it, and press / to add a section.</span></div>)}
    {(panel === 'header' || panel === 'footer') && <WebsiteChromeInspector area={panel} chrome={draft.chrome} defaults={chromeDefaults} sourceSettingsHref={`${origin}/spaces/${links.slug}/settings`} onChange={(chrome) => commit({ ...draft, chrome }, { label: panel === 'header' ? 'Edited header' : 'Edited footer' })} onTheme={() => { setTab('Theme'); setLeft(true) }} onPages={() => { setTab('Pages'); setLeft(true) }} onMenu={() => setModal('menu')} />}
    {panel === 'page' && <><label className={k('we-field')}>Page name<Input variant="seamless" key={`${page.slug}:${page.label}`} defaultValue={page.label} maxLength={80} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { event.currentTarget.value = page.label; event.currentTarget.blur() } }} onBlur={(event) => { if (event.target.value.trim()) commit({ ...draft, pages: draft.pages.map((item) => item.slug === page.slug ? { ...item, label: event.target.value } : item) }, { label: 'Renamed page' }) }} /></label><p className={k('we-note')}>Changing the name updates navigation. The page address stays the same.</p>
      {/* A THEME PER PAGE (LIVE-699): the shared site style's per-page override, live at once like the theme. */}
      <div className={k('we-field')}>{FQ_EDITOR ? <span className="l">Page theme</span> : 'Page theme'}<div className={k('we-choice-row')} role="group" aria-label="Page theme">{[{ id: null as SiteThemeId | null, label: 'Same as site' }, ...SITE_THEMES.map((t) => ({ id: t.id as SiteThemeId | null, label: t.label }))].map((o) => <button type="button" key={o.id ?? 'site'} className={pressedChoice(pageTheme === o.id)} aria-pressed={pageTheme === o.id} onClick={() => { if (pageTheme === o.id) return; const pages = { ...style.pages }; if (o.id) pages[page.slug] = o.id; else delete pages[page.slug]; void saveStyle({ pages: { [page.slug]: o.id } }, { ...style, pages }) }}>{o.label}</button>)}</div></div>
      <p className={k('we-note')}>This page can wear the other theme. Same as site follows the Theme tab, and the change shows on your live website at once.</p>{styleError && <p role="alert" className={k('we-note')}>{styleError}</p>}<div className={k('we-actions')}><button type="button" className={k('we-action secondary')} disabled={draft.pages.indexOf(page) <= 1 || page.slug === 'home'} onClick={() => movePage(-1)}>Move earlier</button><button type="button" className={k('we-action secondary')} disabled={draft.pages.indexOf(page) >= draft.pages.length - 1 || page.slug === 'home'} onClick={() => movePage(1)}>Move later</button></div><button type="button" className={k('we-row')} onClick={() => { setPanel('seo'); setRight(true) }}>SEO and sharing</button>{page.slug !== 'home' && <button type="button" className={k('we-row')} onClick={() => setModal('delete-page')}><Trash2 size={15} />Remove page</button>}</>}
    {panel === 'seo' && (FQ_EDITOR ? <><div className="fld"><label htmlFor={`${uid}-title`}>Page title <em>{page.seo.title.length} / {SEO_TITLE_ADVISED}</em></label><Input id={`${uid}-title`} className="in" value={page.seo.title} placeholder={`${page.label} | ${brandName}`} maxLength={200} onChange={(e) => commit({ ...draft, pages: draft.pages.map((p) => p.slug === page.slug ? { ...p, seo: { ...p.seo, title: e.target.value } } : p) }, { label: 'Search and sharing', burst: `seo-title:${page.slug}` })} /></div><div className="fld"><label htmlFor={`${uid}-description`}>Description <em>{page.seo.description.length} / {SEO_DESCRIPTION_ADVISED}</em></label><Textarea id={`${uid}-description`} className="in" value={page.seo.description} maxLength={500} onChange={(e) => commit({ ...draft, pages: draft.pages.map((p) => p.slug === page.slug ? { ...p, seo: { ...p.seo, description: e.target.value } } : p) }, { label: 'Search and sharing', burst: `seo-description:${page.slug}` })} /></div>{(page.seo.title.length > SEO_TITLE_ADVISED || page.seo.description.length > SEO_DESCRIPTION_ADVISED) && <p className="note">Search results cut titles past {SEO_TITLE_ADVISED} characters and descriptions past {SEO_DESCRIPTION_ADVISED}.</p>}<div className="cap">Share preview</div><div className="share"><small>{host}</small><strong>{page.seo.title || `${page.label} | ${brandName}`}</strong><p>{page.seo.description}</p></div><div className="note">Search and sharing changes go live when you publish.</div></> : <><label className={k('we-field')}>Page title<Input variant="seamless" value={page.seo.title} placeholder={`${page.label} | ${brandName}`} maxLength={200} onChange={(e) => commit({ ...draft, pages: draft.pages.map((p) => p.slug === page.slug ? { ...p, seo: { ...p.seo, title: e.target.value } } : p) }, { label: 'Search and sharing', burst: `seo-title:${page.slug}` })} /></label><label className={k('we-field')}>Description<Textarea variant="seamless" value={page.seo.description} maxLength={500} onChange={(e) => commit({ ...draft, pages: draft.pages.map((p) => p.slug === page.slug ? { ...p, seo: { ...p.seo, description: e.target.value } } : p) }, { label: 'Search and sharing', burst: `seo-description:${page.slug}` })} /></label><div className={k('we-caption')}>Share preview</div><div className={k('we-share-card')}><small>{host}</small><strong>{page.seo.title || `${page.label} | ${brandName}`}</strong><p>{page.seo.description}</p></div><div className={k('we-note')}>Search and sharing changes go live when you publish.</div></>)}
    {panel === 'comments' && <><div className={k('we-note')}>{selectedId ? pinPosition?.blockId === selectedId ? 'Comment pinned at the selected position.' : 'Shift-click the page to choose a precise pin position.' : 'Select a section to pin a comment.'}</div>{page.comments.filter((c) => !c.resolved).map((c) => <article className={k('we-comment')} key={c.id}><button type="button" className={k('we-row')} onClick={() => setSelectedId(c.blockId)}><strong>{c.author}</strong></button><small>{new Date(c.createdAt).toLocaleString()}</small><p>{c.text}</p>{c.replies?.map((reply) => <div className={k('we-comment-reply')} key={reply.id}><strong>{reply.author}</strong><small>{new Date(reply.createdAt).toLocaleString()}</small><p>{reply.body}</p></div>)}{(c.replies?.length ?? 0) < 100 && <><label className={k('we-field')}>Reply to {c.author}<Textarea variant="seamless" aria-label={`Reply to comment by ${c.author}`} value={replies[c.id] ?? ''} maxLength={2000} onChange={(event) => setReplies((previous) => ({ ...previous, [c.id]: event.target.value }))} /></label><button type="button" className={k('we-action secondary')} disabled={!replies[c.id]?.trim()} onClick={() => replyToComment(c.id)}>Post reply</button></>}<button type="button" className={k('we-row')} onClick={() => commit({ ...draft, pages: draft.pages.map((p) => p.slug === page.slug ? { ...p, comments: p.comments.map((x) => x.id === c.id ? { ...x, resolved: true } : x) } : p) })}>Resolve</button></article>)}
      <label className={k('we-field')}>Comment<Textarea variant="seamless" value={comment} maxLength={2000} onChange={(e) => setComment(e.target.value)} /></label><button type="button" className={k('we-action')} disabled={!comment.trim() || !selectedId} onClick={addComment}>Post comment</button></>}
  </>
  const modalLabel = modal === 'publish' ? 'Publish website' : modal === 'templates' ? 'New page' : modal === 'delete-page' ? 'Remove page' : modal === 'menu' ? 'Menu and logo' : 'Add section'
  const modalTitle = modal === 'publish' ? 'Publish your changes' : modal === 'templates' ? 'Start a new page' : modal === 'delete-page' ? 'Remove this page?' : modal === 'menu' ? 'Menu and logo' : 'Add a section'
  const publishAction = () => { if (publishWhen === 'now') void save(true); else if (!scheduledAt || !Number.isFinite(new Date(scheduledAt).getTime()) || new Date(scheduledAt).getTime() <= Date.now()) setError('Choose a future date and time.'); else void save(false, new Date(scheduledAt).toISOString()) }
  const publishDisabled = !dirty || status === 'saving' || status === 'conflict'
  const publishLabel = status === 'saving' ? 'Saving…' : publishWhen === 'schedule' ? 'Schedule publish' : 'Publish now'
  const changeCount = changedPages.length + removedPages.length + (navigationChanged ? 1 : 0) + (chromeChanged ? 1 : 0) + (brandChanged ? 1 : 0) + (draft.theme !== persisted.published?.theme ? 1 : 0)
  const versionsList = <>{persisted.versions.length ? persisted.versions.map((v) => <div className={k('we-version')} key={v.id}><div><strong>Published version {v.id}</strong><div className={k('we-note')}>{new Date(v.createdAt).toLocaleString()}</div></div><button type="button" className={k('we-action secondary')} onClick={() => { commit(structuredClone(v.snapshot), { label: 'Restored a published version' }); setModal(null) }}>Restore to draft</button></div>) : <p className={k('we-note')}>Your first publish creates a version you can restore.</p>}</>
  const scheduledNotice = persisted.scheduled && <div><button type="button" className={k('we-action secondary')} disabled={status === 'saving'} onClick={() => void save(false, null)}>Cancel scheduled publish</button><p className={k('we-note')}>Scheduled for {new Date(persisted.scheduled.at).toLocaleString()}. Later draft edits stay separate from that scheduled version.</p></div>
  const previewNote = !WEBSITE_THEMES_LIVE.has(draft.theme) && <p role="note" className={k('we-note')}>The {WEBSITE_THEME_LABEL[draft.theme]} theme is still in preview in the editor. Publishing saves this version, and your live website keeps its current look until this theme is ready.</p>
  const deletePageBody = <><p className={k('we-note')}>Remove {page.label} from this draft and its navigation? This takes effect on the live website when you publish. Undo restores the page.</p><button type="button" className={k('we-action')} onClick={() => { commit({ ...draft, pages: draft.pages.filter((item) => item.slug !== page.slug) }, { label: `Removed page ${page.label}` }); setModal(null); pickPage('home') }}>Remove page</button></>
  const logoPicker = <LoomPicker open={choosingLogo} onClose={() => setChoosingLogo(false)} kinds={['image', 'icon']} title="Choose website logo" onSelect={(url) => { commit({ ...draft, brand: { ...draft.brand, logo: url } }, { label: 'Logo' }); setChoosingLogo(false) }} />
  const veraContext = textSelection ? `Selected text · ${textSelection.field}${textSelection.path.length ? ' in card' : ''}` : selected ? config.components[selected.type]?.label ?? selected.type : page.label

  // ── FREQUENCY (design_handoff/frequency/templates/admin/Page Editor.html): the same editor in the design's
  // layout. Top bar, left rail (Pages, Layers, Add, Theme, Site), the stage with the Vera bar, the inspector
  // (Content, Design, Advanced, Notes) and the publish modal. Folding is the kit's data-lf / data-rf.
  if (FQ_EDITOR) {
    const veraVisible = asking || !!veraStatus || !!proposal
    // The design's save line: "Saving…", then "Draft saved · 2 min ago". A failed save says so and the line retries.
    const fqSaveLabel = status === 'saving' ? 'Saving…' : status === 'saved' ? (savedAt ? `Draft saved · ${savedAgo(savedAt, now)}` : 'Draft saved') : status === 'unsaved' ? 'Unsaved changes' : status === 'conflict' ? 'A newer draft exists' : 'Not saved · Retry'
    // "Section 2 of 8 · Live data" (the design's inspector header) for a top-level section; nested blocks keep the scope line.
    const sectionIndex = selectedId ? page.doc.content.findIndex((block) => block.props.id === selectedId) : -1
    const selectedMeta = selected ? editorBlockMeta(config, selected.type) : null
    const fqScope = panel === 'inspect' && sectionIndex >= 0 ? `Section ${sectionIndex + 1} of ${page.doc.content.length}${selectedMeta?.live ? ' · Live data' : ''} · ${inspectorScope}` : inspectorScope
    const nothingSelected = panel === 'inspect' && !selected
    // The Publish badge counts the change log; a draft that arrived with unpublished work counts its pages.
    const pendingCount = dirty ? changes.length || changeCount : 0
    const otherChanged = changedPages.filter((p) => p.slug !== page.slug).map((p) => p.label)
    // Back to the site admin's Overview (the design's first control), else the Space home.
    const adminMenu = (metadata?.websiteChrome as { admin?: { menu?: { href: string; label: string }[] } | null } | undefined)?.admin?.menu ?? []
    const overview = adminMenu.find((item) => /overview|vision/i.test(item.label))
    const backHref = overview?.href ?? `${origin}/spaces/${links.slug}`
    const backLabel = overview ? `Back to ${overview.label.replace(/^Executive /, '')}` : 'Back to Space home'
    const suggestions = VERA_SUGGESTIONS[selectedMeta?.kind ?? '_']
    return <div data-editor-root data-kit="editor" className={fontClass} data-website-theme={draft.theme} style={{ ...websiteThemeVars(draft.theme, activeAccent), position: 'relative', zIndex: 60 }}>
      <style>{WEBSITE_TOKEN_CSS}</style>
      <div className="pe" data-lf={left ? '0' : '1'} data-rf={right ? '0' : '1'} data-preview={preview ? '1' : '0'}>
        <header className="top">
          <a className="ib" aria-label={backLabel} title={backLabel} href={backHref}><FqIcon name="back" /></a>
          <div className="brand"><span className="av" style={activeLogo ? { backgroundImage: `url(${JSON.stringify(activeLogo)})`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat' } : { backgroundImage: 'none' }} aria-hidden /><span><b>{draft.chrome?.name || brandName}</b><small>{host}</small></span></div>
          <div className="pick" ref={pickRef}>
            <button type="button" aria-haspopup="menu" aria-expanded={pickOpen} onClick={() => setPickOpen(!pickOpen)}><span>{page.label}</span><FqIcon name="caret" /></button>
            <div className={`menu${on(pickOpen)}`} role="menu" aria-label="Pages">
              {draft.pages.map((p) => <button type="button" role="menuitem" key={p.slug} onClick={() => { pickPage(p.slug); setPickOpen(false); say(`Opened ${p.label}`) }}>{p.label}<span className="sp" /><span className={`dot ${pageState(p.slug)}`} aria-hidden /></button>)}
              <div className="sep" />
              <button type="button" role="menuitem" disabled={draft.pages.length >= 30} onClick={() => { setModal('templates'); setPickOpen(false) }}>+ New page</button>
            </div>
          </div>
          <button type="button" className={`save${status === 'saved' ? '' : ' dirty'}`} onClick={() => void save()} title="Save draft ⌘S" aria-label="Save draft" aria-describedby={`${uid}-save`}><i aria-hidden /><span id={`${uid}-save`} role="status">{fqSaveLabel}</span></button>
          <span className="sp" />
          {!!error && <button type="button" className="save-alert" role="alert" onClick={() => setRight(true)}>{error}</button>}
          <Icon label={left ? 'Fold left rail' : 'Open left rail'} aria-pressed={!left} onClick={() => setLeft(!left)}><FqIcon name="fold-left" /></Icon>
          <div className="seg dev" role="group" aria-label="Device">{DEVICES.map(({ id, label }) => <button type="button" key={id} className={on(device === id).trim() || undefined} aria-label={label} title={label} aria-pressed={device === id} onClick={() => setDevice(id)}><FqIcon name={id} /></button>)}</div>
          <Icon label={right ? 'Fold inspector' : 'Open inspector'} aria-pressed={!right} onClick={() => setRight(!right)}><FqIcon name="fold-right" /></Icon>
          <Icon label="Undo" hint="Undo ⌘Z" aria-keyshortcuts="Meta+Z Control+Z" disabled={!historyCounts.past} onClick={() => travel(false)}><FqIcon name="undo" /></Icon>
          <Icon label="Redo" hint="Redo ⇧⌘Z" aria-keyshortcuts="Meta+Shift+Z Control+Shift+Z" disabled={!historyCounts.future} onClick={() => travel(true)}><FqIcon name="redo" /></Icon>
          <Icon label={preview ? 'Back to editor' : 'Preview'} hint={preview ? 'Back to editor · Esc' : 'Preview ⌘P'} aria-keyshortcuts="Meta+P Control+P" aria-pressed={preview} onClick={() => togglePreview()}><FqIcon name="eye" /></Icon>
          <span className="faces" role="img" aria-label={[`${author} · editing`, ...people.map((person) => `${person.name} · editing`)].join(', ')} title={[`${author} · editing`, ...people.map((person) => `${person.name} · editing`)].join(', ')}>{[{ key: 'me', name: author }, ...people.map((person) => ({ key: person.profileId, name: person.name }))].map((person) => <span key={person.key} aria-hidden>{person.name.split(' ').slice(0, 2).map((n) => n[0]).join('')}</span>)}</span>
          <button type="button" className="btn sm" onClick={() => void share()}>Share</button>
          <button type="button" className="btn pa" aria-label={pendingCount ? `Publish, ${pendingCount} ${pendingCount === 1 ? 'change' : 'changes'}` : 'Publish'} onClick={() => setModal('publish')}>Publish{pendingCount > 0 && <span className="pub-badge" aria-hidden>{pendingCount}</span>}</button>
        </header>
        <aside className="rail" aria-label="Website navigation">
          <div className="tabs" role="tablist" aria-label="Website tools">{TABS.map(({ label }) => <button type="button" role="tab" key={label} aria-selected={tab === label} className={on(tab === label).trim() || undefined} title={label} onClick={() => { setTab(label); setLeft(true); if (label !== 'Add') setInsertAt(null) }}><FqIcon name={TAB_ICON[label]} /><span>{label}</span></button>)}</div>
          <div className="body" role="tabpanel" aria-label={tab}>{railBody}</div>
          <div className="foot"><span className="lbl">Changes save as a draft</span><a className="btn sm txt" href={`https://${host}/`} target="_blank" rel="noreferrer">Live site</a></div>
        </aside>
        <main className="stage" data-device={device} aria-label="Website editor canvas" style={{ ['--pe-zoom' as string]: preview ? 1 : zoom / 100 }}>
          <div className="scroller"><WebsiteCanvas key={page.slug} pageSlug={page.slug} people={people} onCursor={(value) => { cursor.current = value }} doc={page.doc} theme={canvasTheme} device={device} config={config} metadata={metadata} live={live} nav={draft.pages} links={{ ...links, pages: draft.pages.map((p) => p.slug) }} origin={origin} title={page.label} brandName={brandName} logo={activeLogo} brandAccent={activeAccent} themeVars={canvasVars} spaceTheme={render.fonts} selectedId={selectedId} preview={preview} comments={page.comments} onSelect={select} onTextSelect={(selection) => { setTextSelection(selection); setFieldFocus(null) }} focusField={fieldFocus} onChromeSelect={openChrome} chrome={draft.chrome} onEdit={(id, field, value) => editProps(id, { [field]: value })} onAction={action} onCommentPin={(id, position) => { setSelectedId(id); setPinPosition({ blockId: id, ...position }); setPanel('comments'); setRight(true) }} onReorder={reorderSections} onInsert={insert} onDisplay={updateDisplay} onVisibility={(id, visible) => setVisible(id, device, visible)} look={siteLookOverrides(pageLookStyle)} fullFooter={siteLook(pageLookStyle).footer === 'full'} /></div>
          {!preview && <div className="zoom" role="group" aria-label="Zoom"><Icon label="Zoom out" disabled={zoom <= 50} onClick={() => setZoom((z) => Math.max(50, z - 10))}><FqIcon name="minus" /></Icon><span aria-live="polite">{zoom}%</span><Icon label="Zoom in" disabled={zoom >= 100} onClick={() => setZoom((z) => Math.min(100, z + 10))}><FqIcon name="plus" /></Icon></div>}
          {!preview && <div className="vera">
            <div className={`reply${on(veraVisible)}`} role="status">{asking ? 'Vera is preparing a proposal…' : <><b>Vera</b>{proposal ? <> · {blockName(proposal.blockId, draft.pages.find((p) => p.slug === proposal.pageSlug)?.doc)}</> : null}{veraStatus && !proposal && <p>{veraStatus}</p>}</>}{proposal && <><p>{proposal.after}</p><div className="acts"><button type="button" className="btn sm pa" onClick={applyProposal}>Apply</button><button type="button" className="btn sm txt" onClick={() => { setProposal(null); setVeraStatus('') }}>Not now</button></div></>}</div>
            <form className="bar" onSubmit={(e) => { e.preventDefault(); void askVera() }}>
              <span className="orb" aria-hidden />
              <Input ref={veraInput} aria-label="Ask Vera" aria-keyshortcuts="Meta+K Control+K" placeholder="Ask Vera to change this page…" value={request} onChange={(e) => { setRequest(e.target.value); if (e.target.value === '/') { setRequest(''); insert(page.doc.content.length) } }} />
              <span className="ctx">{veraContext}</span>
              <button type="submit" className="btn sm ink" disabled={asking}>Ask</button>
            </form>
            <div className="chips">{suggestions.map((chip) => <button type="button" key={chip.label} disabled={asking || !selected} onClick={() => void askVera(chip.prompt, chip.fields)}>{chip.label}</button>)}</div>
          </div>}
        </main>
        <aside className="insp" aria-label="Inspector">
          {right && nothingSelected && <>{!!error && <div className="note err" role="alert">{error}{status === 'error' && <button type="button" className="row" onClick={() => void save()}>Retry save</button>}{status === 'conflict' && <button type="button" className="row" onClick={() => window.location.reload()}>Reload newer draft</button>}</div>}
            <div className="empty"><span className="orb" aria-hidden /><b>Nothing selected</b>Click any section on the page, or pick one in Layers.</div></>}
          {right && !nothingSelected && <>
            <div className="ih"><span className="ic"><FqIcon name={panel === 'comments' ? 'message' : panel === 'seo' ? 'search' : panel === 'header' || panel === 'footer' ? 'layers' : panel === 'page' ? 'page' : selectedMeta?.icon ?? 'settings'} /></span><span className="grow"><b>{inspectorTitle}</b><small>{fqScope}</small></span><Icon label="Fold inspector" onClick={() => setRight(false)}><FqIcon name="fold-right" /></Icon></div>
            {(panel === 'inspect' || panel === 'comments') && <div className="isub"><div className="seg" role="tablist" aria-label="Inspector">{INSPECTOR_TABS.map((t) => <button type="button" role="tab" key={t.id} aria-selected={shownTab === t.id} className={on(shownTab === t.id).trim() || undefined} onClick={() => { if (t.id === 'notes') setPanel('comments'); else { setInspectorTab(t.id); setPanel('inspect') } }}>{t.label}{t.id === 'notes' && activeComments.length > 0 ? ` ${activeComments.length}` : ''}</button>)}</div></div>}
            <div className="fields">{inspectorBody}</div>
            {panel === 'inspect' && selected && selectedId && <div className="ifoot"><button type="button" className="btn sm" onClick={() => action(selectedId, 'copy')}><FqIcon name="copy" />Duplicate</button><button type="button" className="btn sm danger" onClick={() => action(selectedId, 'delete')}><FqIcon name="trash" />Delete</button></div>}
          </>}
        </aside>
      </div>
      {logoPicker}
      <div className={`toast${on(!!toast)}`} role="status" aria-live="polite">{toast}</div>
      {modal && <div className="ov on" onClick={() => setModal(null)}><Dialog label={modalLabel}>
        <Icon label="Close dialog" className="x" onClick={() => setModal(null)}><FqIcon name="close" /></Icon>
        {modal === 'publish' && <span className="eyebrow">{draft.chrome?.name || brandName} · {page.label}</span>}
        <h2>{modal === 'publish' ? 'Ready to publish?' : modalTitle}</h2>
        {modal === 'menu' && <SiteMenuEditor slug={links.slug} />}
        {modal === 'insert' && <div className="modal-body">{palette}</div>}
        {modal === 'delete-page' && deletePageBody}
        {modal === 'templates' && <><label className="fld"><span className="l">Page name</span><Input className="in" autoFocus value={pageName} maxLength={80} onChange={(e) => setPageName(e.target.value)} /></label>{error && <p role="alert" className="note err">{error}</p>}<div className="blocks">{WEBSITE_PAGE_TEMPLATES.map(({ name, description }) => <button type="button" key={name} className="blk" disabled={!pageName.trim()} onClick={() => newPage(name)}><span className="th" aria-hidden><i className="a s" /><i className="w" /><i /></span>{name}<small>{description}</small></button>)}</div></>}
        {modal === 'publish' && <>{previewNote}
          <div className="chg">{!dirty ? <div>No changes since last publish</div> : changes.length ? changes.map((label) => <div key={label}><FqIcon name="edit" /><b>{label}</b></div>) : <>{changedPages.map((p) => <div key={p.slug}><FqIcon name="page" /><b>{p.label}</b><span className="sp" />Updated</div>)}{removedPages.map((item) => <div key={item.slug}><FqIcon name="trash" /><b>{item.label}</b><span className="sp" />Removed</div>)}{navigationChanged && <div><FqIcon name="layers" /><b>Navigation</b><span className="sp" />Updated</div>}{chromeChanged && <div><FqIcon name="settings" /><b>Header and footer</b><span className="sp" />Updated</div>}{brandChanged && <div><FqIcon name="palette" /><b>Brand settings</b><span className="sp" />Updated</div>}{draft.theme !== persisted.published?.theme && <div><FqIcon name="palette" /><b>Theme</b><span className="sp" />{WEBSITE_THEME_LABEL[draft.theme]}</div>}</>}</div>
          {publishChecks(draft.pages, config, { otherChanged }).map((check) => <div className="chk" key={check.text}><i className={check.ok ? undefined : 'w'} aria-hidden>{check.ok ? '✓' : '!'}</i>{check.text}</div>)}
          <div className="seg when" role="group" aria-label="When"><button type="button" className={on(publishWhen === 'now').trim() || undefined} aria-pressed={publishWhen === 'now'} onClick={() => setPublishWhen('now')}>Publish now</button><button type="button" className={on(publishWhen === 'schedule').trim() || undefined} aria-pressed={publishWhen === 'schedule'} onClick={() => setPublishWhen('schedule')}>Schedule</button></div>
          {publishWhen === 'schedule' && <label className="fld"><span className="l">Publish date and time <em>Your local time zone</em></span><Input className="in" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} /></label>}
          {scheduledNotice}
          <div className="acts end"><button type="button" className="btn" onClick={() => setModal(null)}>Keep editing</button><button type="button" className="btn pa" disabled={publishDisabled} onClick={publishAction}>{publishWhen === 'schedule' && status !== 'saving' ? 'Schedule' : publishLabel}</button></div>{error && <p className="note err" role="alert">{error}</p>}
          <details className="drw"><summary>Published versions</summary>{versionsList}</details></>}
      </Dialog></div>}
    </div>
  }

  const sectionCount = page.doc.content.length
  const selectedIndex = selected ? page.doc.content.findIndex((b) => b.props.id === selected.props.id) : -1
  const pendingCount = changedPages.length + removedPages.length + (navigationChanged || chromeChanged || brandChanged || draft.theme !== persisted.published?.theme ? 1 : 0)
  const saveText = status === 'saving' ? 'Saving…' : status === 'saved' ? (dirty ? 'Draft saved · not published yet' : 'Draft saved · published') : status === 'unsaved' ? 'Unsaved changes' : 'Draft needs attention'
  // THE SITE EDITOR (design_handoff_site_editor, the Frequency design system): the chrome wears the system's own
  // Commons tokens and faces whatever theme the site wears; only the canvas frame wears the site's theme.
  return <div data-editor-root className={`we-shell ${fontClass ?? ''}`} data-left-folded={!left} data-right-folded={!right} data-preview={preview} onKeyDown={keys}>
    <link rel="stylesheet" href={DS_FACES} precedence="default" />
    <header className="we-top">
      <a className="we-icon" aria-label="Back to Space home" title="Back to Space home" href={`${origin}/spaces/${links.slug}`}><ChevronLeft size={18} aria-hidden /></a>
      <div className="we-brand">{activeLogo ? <img className="we-logo" src={activeLogo} alt="" /> : <span className="we-logo" aria-hidden />}<div><strong>{draft.chrome?.name || brandName}</strong><small>{host}</small></div></div>
      <div className="we-pick">
        <button type="button" className="we-page-pick" aria-haspopup="menu" aria-expanded={pageMenu} onClick={() => setPageMenu(!pageMenu)}><span>{page.label}</span><ChevronDown size={16} aria-hidden /></button>
        {pageMenu && <div className="we-menu" role="menu" onKeyDown={(e) => { if (e.key === 'Escape') setPageMenu(false) }}>{draft.pages.map((p) => { const live = persisted.published?.pages.some((b) => b.slug === p.slug); const changed = changedPages.includes(p); return <button type="button" role="menuitem" key={p.slug} aria-current={p.slug === page.slug} onClick={() => { pickPage(p.slug); setPageMenu(false) }}>{p.label}<span className="we-spacer" />{(changed || !live) && <i className="we-dot" data-tone={live ? 'draft' : 'new'} aria-label={live ? 'Unpublished changes' : 'Not published yet'} />}</button> })}<div className="we-sep" /><button type="button" role="menuitem" disabled={draft.pages.length >= 30} onClick={() => { setPageMenu(false); setModal('templates') }}>+ New page</button></div>}
      </div>
      <button type="button" className="we-save" data-dirty={status !== 'saved' || undefined} onClick={() => void save()} title="Save draft" aria-label="Save draft" role="status"><i aria-hidden /><span>{saveText}</span></button>
      <span className="we-spacer" />
      {!!error && <button type="button" className="we-save-alert" role="alert" onClick={() => setRight(true)}>{error}</button>}
      <Icon label={left ? 'Fold left rail' : 'Open left rail'} className="we-history" onClick={() => setLeft(!left)}><PanelLeft size={18} aria-hidden /></Icon>
      <div className="we-device" role="group" aria-label="Device">{DEVICES.map(({ id, icon: DeviceIcon, label }) => <button type="button" key={id} aria-label={label} title={label} aria-pressed={device === id} onClick={() => setDevice(id)}><DeviceIcon size={17} aria-hidden /></button>)}</div>
      <Icon label={right ? 'Fold inspector' : 'Open inspector'} className="we-history" onClick={() => setRight(!right)}><PanelRight size={18} aria-hidden /></Icon>
      <Icon label="Undo" className="we-history" disabled={!historyCounts.past} onClick={() => travel(false)}><Undo2 size={18} aria-hidden /></Icon>
      <Icon label="Redo" className="we-history" disabled={!historyCounts.future} onClick={() => travel(true)}><Redo2 size={18} aria-hidden /></Icon>
      <details className="we-mobile-history"><summary aria-label="Editor tools">Tools</summary><div>{DEVICES.map(({ id, label }) => <button key={id} type="button" className="we-row" aria-pressed={device === id} onClick={() => setDevice(id)}>{label} width</button>)}<button type="button" className="we-row" disabled={!historyCounts.past} onClick={() => travel(false)}>Undo</button><button type="button" className="we-row" disabled={!historyCounts.future} onClick={() => travel(true)}>Redo</button><button type="button" className="we-row" onClick={() => void save()}>Save draft</button></div></details>
      <Icon label="Preview" aria-pressed={preview} onClick={() => setPreview(!preview)}><Eye size={18} aria-hidden /></Icon>
      <div className="we-presence" title={`${author} · editing`}><span className="we-avatar">{author.split(' ').slice(0, 2).map((n) => n[0]).join('')}</span>{people.map((person) => <span key={person.profileId} className="we-avatar" title={`${person.name} · editing`}>{person.name.split(' ').slice(0, 2).map((n) => n[0]).join('')}</span>)}</div>
      <button type="button" className="we-action pa" onClick={() => setModal('publish')}><span>Publish</span>{pendingCount > 0 && <small>{pendingCount}</small>}</button>
    </header>
    <aside className={`we-rail we-left ${left ? '' : 'we-folded'}`} aria-label="Website navigation" style={preview ? { visibility: 'hidden' } : undefined}>
      {left ? <><div className="we-tabs" role="tablist" aria-label="Website tools">{TABS.map(({ label, icon: TabIcon }) => <button type="button" role="tab" key={label} aria-selected={tab === label} onClick={() => setTab(label)}><TabIcon size={18} aria-hidden /><span>{label}</span></button>)}</div>
        <div className="we-rail-scroll" role="tabpanel" aria-label={tab}>
          {railBody}
        </div></> : <div className="we-strip">{TABS.map(({ label, icon: TabIcon }) => <Icon key={label} label={label} onClick={() => { setTab(label); setLeft(true) }}><TabIcon size={18} /></Icon>)}</div>}
      <div className="we-foot"><span className="we-foot-lbl">Changes save as a draft</span><a className="we-action txt sm" aria-label="Website home" href={`https://${host}/`} target="_blank" rel="noreferrer">Live site</a></div>
    </aside>
    <main className="we-stage" data-device={device} aria-label="Website editor canvas">
      <div className="we-frame-scroller"><div className="we-frame-card"><WebsiteCanvas zoom={zoom} key={page.slug} pageSlug={page.slug} people={people} onCursor={(value) => { cursor.current = value }} doc={page.doc} theme={canvasTheme} device={device} config={config} metadata={metadata} live={live} nav={draft.pages} links={{ ...links, pages: draft.pages.map((p) => p.slug) }} origin={origin} title={page.label} brandName={brandName} logo={activeLogo} brandAccent={activeAccent} themeVars={canvasVars} spaceTheme={render.fonts} selectedId={selectedId} preview={preview} comments={page.comments} onSelect={select} onTextSelect={(selection) => { setTextSelection(selection); setFieldFocus(null) }} focusField={fieldFocus} onChromeSelect={openChrome} chrome={draft.chrome} onEdit={(id, field, value) => editProps(id, { [field]: value })} onAction={action} onCommentPin={(id, position) => { setSelectedId(id); setPinPosition({ blockId: id, ...position }); setPanel('comments'); setRight(true) }} onReorder={reorderSections} onInsert={insert} onDisplay={updateDisplay} look={siteLookOverrides(pageLookStyle)} fullFooter={siteLook(pageLookStyle).footer === 'full'} /></div></div>
      {!preview && <div className="we-zoom"><Icon label="Zoom out" disabled={zoom <= 50} onClick={() => setZoom((z) => Math.max(50, z - 10))}><Minus size={15} aria-hidden /></Icon><span>{zoom}%</span><Icon label="Zoom in" disabled={zoom >= 100} onClick={() => setZoom((z) => Math.min(100, z + 10))}><Plus size={15} aria-hidden /></Icon></div>}
      {!preview && <VeraDock>
        {(asking || veraStatus || proposal) && <div className="we-thread">
          <p role="status"><b>Vera</b>{selected ? ` · ${config.components[selected.type]?.label ?? selected.type}` : ''}<br />{asking ? 'Vera is preparing a proposal…' : veraStatus}</p>{proposal && <div className="we-proposal"><div className="we-caption">Proposed text</div><p>{proposal.after}</p><div className="we-actions"><button type="button" className="we-action pa sm" onClick={applyProposal}>Apply</button><button type="button" className="we-action txt sm" onClick={() => { setProposal(null); setVeraStatus('Proposal discarded.') }}>Not now</button></div></div>}</div>}
        <div className="we-suggestions"><button type="button" onClick={() => void askVera('Make this shorter while keeping every fact.')}>Make it shorter</button><button type="button" onClick={() => void askVera('Make this warmer and more welcoming. Keep every fact.')}>Make it warmer</button><button type="button" onClick={() => void askVera('Suggest a better heading for this section. Keep every fact.')}>Suggest a better heading</button><button type="button" onClick={() => insert(page.doc.content.length)}>Add a section</button></div>
        <form className="we-vera-bar" onSubmit={(e) => { e.preventDefault(); void askVera() }}>
          <span className="we-orb" aria-hidden />
          <Input variant="seamless" aria-label="Ask Vera" placeholder="Ask Vera to change this page…" value={request} onChange={(e) => { setRequest(e.target.value); if (e.target.value === '/') { setRequest(''); insert(page.doc.content.length) } }} />
          <span className="we-context" title={textSelection ? `Selected text · ${textSelection.field}` : undefined}>{textSelection ? 'Selected text' : selected ? config.components[selected.type]?.label ?? selected.type : page.label}</span>
          <button type="submit" className="we-action ink sm" disabled={asking}>Ask</button>
        </form>
      </VeraDock>}
    </main>
    <aside className={`we-rail we-right ${right ? '' : 'we-folded'}`} aria-label="Inspector" style={preview ? { visibility: 'hidden' } : undefined}>
      {right ? <><div className="we-inspector-head"><span className="we-ih-ic"><SectionIcon type={selected?.type ?? ''} size={18} /></span><span className="we-spacer"><b>{panel === 'seo' ? 'SEO and sharing' : panel === 'header' ? 'Header' : panel === 'footer' ? 'Footer' : panel === 'page' ? 'Page settings' : selected ? config.components[selected.type]?.label ?? selected.type : panel === 'comments' ? 'Notes' : 'Page'}</b><small>{panel === 'header' || panel === 'footer' ? 'Every page · all devices' : panel === 'seo' || panel === 'page' ? 'This page' : selected && selectedIndex >= 0 ? `Section ${selectedIndex + 1} of ${sectionCount}${/^(Space|Live)/.test(selected.type) || /Events|Circles|Tiers/.test(selected.type) ? ' · Live data' : ''}${device !== 'desktop' ? ` · ${device === 'phone' ? 'Phone' : 'Tablet'} only` : ''}` : `${sectionCount} sections`}</small></span><Icon label="Fold inspector" onClick={() => setRight(false)}><PanelRight size={18} aria-hidden /></Icon></div>
        {selected && (panel === 'inspect' || panel === 'comments') && <div className="we-isub"><div className="we-seg" role="tablist" aria-label="Section settings">{([['content', 'Content'], ['design', 'Design'], ['advanced', 'Advanced']] as const).map(([id, label]) => <button type="button" role="tab" key={id} aria-selected={panel === 'inspect' && inspTab === id} onClick={() => { setPanel('inspect'); setInspTab(id) }}>{label}</button>)}<button type="button" role="tab" aria-selected={panel === 'comments'} onClick={() => setPanel('comments')}>Notes{activeComments.filter((c) => c.blockId === selectedId).length > 0 && <small>{activeComments.filter((c) => c.blockId === selectedId).length}</small>}</button></div></div>}
        <div className="we-rail-scroll">
          {inspectorBody}
        </div></> : <div className="we-strip"><Icon label="Open inspector" onClick={() => { setPanel('inspect'); setRight(true) }}><Settings2 size={18} /></Icon><Icon label="Open comments" onClick={() => { setPanel('comments'); setRight(true) }}><MessageSquare size={18} /></Icon><Icon label="SEO and sharing" onClick={() => { setPanel('seo'); setRight(true) }}><Search size={18} /></Icon></div>}
      {right && panel === 'inspect' && selected && <div className="we-ifoot"><button type="button" className="we-action secondary" onClick={() => action(selected.props.id!, 'copy')}><Copy size={16} aria-hidden />Duplicate</button><button type="button" className="we-action danger" onClick={() => action(selected.props.id!, 'delete')}><Trash2 size={16} aria-hidden />Delete</button></div>}
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
