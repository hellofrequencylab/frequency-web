'use client'

// THE NEW BUILDER'S FRAME (BLD-101; spec docs/design/frequency-builder-v3/block-editor-spec.md §2). Full-window grid:
// a top bar (back, where you are, save state, Show as, ⌘K, devices, undo and redo, preview, Publish), the page
// outline on the left, the canvas wearing the site's theme in the middle and one right panel. Every piece of
// state lives in lib/builder/state.ts; this component only renders it and dispatches. It opens, saves and
// publishes the same drafts as the current editor, through the same server actions.
//
// Reached only from the website editor route (components/sites/editor/website-editor.tsx), behind
// `?builder=v3` or the BUILDER_V3 switch, so no visitor page imports it (the public-bytes ratchet, BLD-101).

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { ChevronLeft, Eye, Palette, ListTree, Maximize2, Monitor, PanelLeft, PanelRight, Pin, PinOff, Plus, Redo2, SlidersHorizontal, Smartphone, Sparkles, Tablet, Undo2 } from 'lucide-react'
import { BREAKPOINTS } from '@/lib/theme/breakpoints'
import type { WebsiteEditorShellProps } from '@/components/sites/editor/shell'
import { SectionIcon } from '@/components/sites/editor/section-icon'
import { updateBlockPropsDeep } from '@/components/page-editor/mobile/data-ops'
import { sectionCommand } from '@/lib/builder/section-actions'
import { TuneRail, type TuneFocus } from '@/components/builder/tune/tune-rail'
import { tuneProjection } from '@/lib/builder/tune'
import { focalFieldFor, pictureFieldFor } from '@/lib/builder/parts'
import { CommandBar } from '@/components/builder/command/command-bar'
import { AddSheet } from '@/components/builder/add/add-sheet'
import { EmailLens } from '@/components/builder/surfaces/email/email-lens'
import { emailLens } from '@/lib/builder/email-lens'
import { ViewAsNotes, ViewAsSwitch } from '@/components/builder/view-as/view-as'
import { viewerDoc, viewerLens, type ViewAs } from '@/lib/builder/view-as'
import { ThemeLens } from '@/components/builder/theme/theme-lens'
import { commitTheme, lensStyle } from '@/lib/builder/theme-lens'
import { useTryItOnSkin } from '@/components/sites/theme-preview-swap'
import type { SiteThemeId } from '@/lib/theme/site-style'
import { ProfileFrame } from '@/components/builder/surfaces/profile/profile-frame'
import { SpotlightDoors } from '@/components/builder/surfaces/spotlight/spotlight-doors'
import { profileFrame, spotlightDoors } from '@/lib/builder/surface-view'
import { SurfaceSwitcher } from '@/components/builder/surfaces/surface-switcher'
import { SurfaceNotes } from '@/components/builder/surfaces/surface-notes'
import { surfaceFrame, surfaceSections, type BuilderSurface } from '@/lib/builder/surfaces'
import { LayoutChips } from '@/components/builder/canvas/variants/layout-chips'
import { addCards, insertSection, type AddCard } from '@/lib/builder/add'
import { makeItem } from '@/components/page-editor/mobile/data-ops'
import { rolePreviewMetadata, roleHasSpaceRows } from '@/components/page-editor/blocks/roles'
import { PublishRing } from '@/components/builder/readiness/publish-ring'
import { UpdateLayoutsSheet } from '@/components/builder/legacy/update-layouts-sheet'
import { applyLegacy, legacyPlan } from '@/lib/builder/legacy'
import { upgradableCount } from '@/lib/blocks/roles/legacy-map'
import { PublishSheet } from '@/components/builder/readiness/publish-sheet'
import { canPublish, nextReadinessItem, ownEdit, readiness, readinessTags, type ReadinessItem } from '@/lib/builder/readiness'
import type { BuilderActionId } from '@/lib/builder/commands'
import type { Data } from '@/lib/page-editor/types'
import { moveSection, spineItems, stepSection } from '@/lib/builder/spine'
import { railInit, railModes, railPinnable, railReducer, RAIL_PREFS_KEY, RAIL_WIDTH, type RailSide } from '@/lib/builder/rails'
import { builderDirty, builderInit, builderPage, builderReducer, builderSaveLabel, BUILDER_DEVICE_WIDTH, type BuilderDevice } from '@/lib/builder/state'
import { siteCanvasVars, siteRenderStyle } from '@/lib/sites/site-render-style'
import { resolveWebsiteBrand, setSectionVisibility, updateSectionDisplay, type SectionDisplay, type WebsiteSnapshot } from '@/lib/sites/editor/state'
import { sitePageStyle, siteLook, siteLookOverrides, type SiteStyle } from '@/lib/theme/site-style'
import { EDITOR_THEME_OF } from '@/lib/sites/site-render-style'
import { Select } from '@/components/ui/select'
import { VeraRail } from '@/components/builder/vera/vera-rail'
import { acceptGroup, readPage, validateProposal, veraGhost, veraGroups, veraMaySpeak, veraMenu, veraOpening, type VeraProposal } from '@/lib/builder/vera'
import styles from './builder-shell.module.css'
// The editor sheet declares the builder's shape and editor tokens (BLD-002) on [data-builder].
import '@/app/themes/active/editor-shell'

const WebsiteCanvas = dynamic(() => import('@/components/sites/editor/canvas').then((m) => m.WebsiteCanvas), { ssr: false, loading: () => <div role="status">Loading your page…</div> })

const DEVICES: { id: BuilderDevice; label: string; Icon: typeof Monitor }[] = [
  { id: 'desktop', label: 'Desktop', Icon: Monitor },
  { id: 'tablet', label: 'Tablet', Icon: Tablet },
  { id: 'phone', label: 'Phone', Icon: Smartphone },
]

/** How long after the last edit the draft saves (§2: "Saving 900ms after the last edit"). */
const SAVE_DELAY = 900
/** Column widths for a rail that is folded to its strip, and for the open outline. */
const STRIP = 56
const OUTLINE = 264

function readRailPrefs(): unknown {
  try { return JSON.parse(window.localStorage.getItem(RAIL_PREFS_KEY) ?? 'null') } catch { return null }
}

/** The window's width, kept current; the rails read it through the shared breakpoints (BLD-102). */
function useWindowWidth() {
  const [width, setWidth] = useState(() => (typeof window === 'undefined' ? 1440 : window.innerWidth))
  useEffect(() => {
    const sync = () => setWidth(window.innerWidth)
    window.addEventListener('resize', sync)
    return () => window.removeEventListener('resize', sync)
  }, [])
  return width
}

export function BuilderShell({ host, brandName, logo, brandAccent, initial, config, metadata, live, links, origin, onSave, onLayout, siteStyle, defaultAccent, fontClass }: WebsiteEditorShellProps) {
  const [state, dispatch] = useReducer(builderReducer, initial, builderInit)
  const page = builderPage(state)
  const latest = useRef(state)
  useEffect(() => { latest.current = state }, [state])

  // The rails (BLD-102): one state machine for both, pins and width kept per person in this browser.
  const width = useWindowWidth()
  const [rails, railDispatch] = useReducer(railReducer, null, () => railInit(readRailPrefs() as never))
  const modes = railModes(rails, width)
  const pinnable = railPinnable(width)
  useEffect(() => {
    try { window.localStorage.setItem(RAIL_PREFS_KEY, JSON.stringify(rails.prefs)) } catch { /* private mode: the pins last this visit */ }
  }, [rails.prefs])
  // Closing an overlay hands focus back to the control that opened it.
  const wasOpen = useRef(rails.open)
  useEffect(() => {
    if (wasOpen.current && !rails.open && rails.trigger) document.getElementById(rails.trigger)?.focus()
    wasOpen.current = rails.open
  }, [rails.open, rails.trigger])
  const railColumn = (side: RailSide) => {
    const mode = modes[side]
    if (mode === 'hidden') return '0px'
    if (mode === 'pinned') return `${side === 'left' ? OUTLINE : rails.prefs.rightWidth}px`
    return width < 600 ? '0px' : `${STRIP}px`
  }
  // Under the sm breakpoint (600) the rails become bottom sheets and a bottom bar opens them (BLD-107).
  const phone = width < BREAKPOINTS.sm
  const gridVars = { '--rail-left': railColumn('left'), '--rail-right': railColumn('right'), '--rail-width': `${rails.prefs.rightWidth}px` } as CSSProperties
  const toggleRail = (side: RailSide) => railDispatch({ type: 'toggle', side, width, trigger: `builder-rail-${side}` })
  // Drag the panel's left edge to widen it (300 to 420); arrow keys do the same ten pixels at a time.
  const resizeFrom = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const startX = event.clientX
    const startW = rails.prefs.rightWidth
    const move = (e: PointerEvent) => railDispatch({ type: 'resize', width: startW + (startX - e.clientX) })
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // Autosave: one save in flight at a time, always the newest draft, on the revision the server gave back.
  const saving = useRef(false)
  const save = useCallback(async (publish: boolean) => {
    if (saving.current) return
    saving.current = true
    const now = latest.current
    dispatch({ type: 'saving' })
    try {
      const result = await onSave(now.revision, now.draft, publish)
      if (result.ok) dispatch({ type: 'saved', state: result.state, publish })
      else dispatch({ type: 'save-failed', conflict: result.conflict })
    } catch {
      dispatch({ type: 'save-failed' })
    } finally {
      saving.current = false
    }
  }, [onSave])
  useEffect(() => {
    if (state.save !== 'unsaved') return
    const timer = window.setTimeout(() => void save(false), SAVE_DELAY)
    return () => window.clearTimeout(timer)
  }, [state.save, state.draft, save])
  useEffect(() => {
    const sync = () => dispatch({ type: 'offline', offline: !navigator.onLine })
    window.addEventListener('online', sync)
    window.addEventListener('offline', sync)
    return () => { window.removeEventListener('online', sync); window.removeEventListener('offline', sync) }
  }, [])

  // THE THEME LENS (BLD-303): the canvas wears the draft's theme over the live site's style, or the theme under the
  // pointer while one is tried on. Both go through the live site's own resolver, so the page here is the page visitors
  // get. The contract skin dresses legacy theme-named blocks in the worn theme, as the published page does.
  const [trying, setTrying] = useState<SiteThemeId | null>(null)
  const [themeOpen, setThemeOpen] = useState(false)
  // The profile uses the Space frame's existing style even while a site theme is being tried.
  const style: SiteStyle | undefined = useMemo(
    () => (siteStyle && state.surface !== 'profile' ? lensStyle(siteStyle, state.draft, trying) : siteStyle),
    [siteStyle, state.draft, state.surface, trying],
  )
  const pageDocs = useMemo(() => state.draft.pages.map((p) => p.doc), [state.draft.pages])
  const skin = useTryItOnSkin(pageDocs, style?.theme ?? null)
  const trySkin = state.surface === 'site' && style && typeof skin === 'string' && skin ? { css: skin, themeId: style.theme } : null
  const brand = resolveWebsiteBrand(state.draft, { logo, accent: brandAccent })
  const render = useMemo(() => (style ? siteRenderStyle(sitePageStyle(style, page.slug), brand.accent, defaultAccent ?? null) : null), [style, page.slug, brand.accent, defaultAccent])
  const canvasVars = useMemo(() => (render ? siteCanvasVars(render) : undefined), [render])
  const canvasTheme = render?.editorTheme ?? (style ? EDITOR_THEME_OF[style.theme] : state.draft.theme)
  // SURFACE PARITY (BLD-215): the profile wears the Space page's own frame (fonts and accent, no site theme) and the
  // Spotlight is its doors. Read only while that surface is showing; the site keeps the live site's resolver above.
  const profile = useMemo(() => (state.surface === 'profile' ? profileFrame(render, brand.accent) : null), [state.surface, render, brand.accent])

  const edit = useCallback((next: WebsiteSnapshot, burst?: string) => dispatch({ type: 'edit', draft: next, burst }), [])
  const editDoc = useCallback((change: (doc: Data) => Data, burst?: string) => {
    const now = latest.current
    const current = builderPage(now)
    edit({ ...now.draft, pages: now.draft.pages.map((p) => (p.slug === current.slug ? { ...p, doc: change(p.doc) } : p)) }, burst)
  }, [edit])
  // Typing into one field is one undo step (the burst), whether the words were typed on the canvas or in Tune.
  // Editing any slot or item makes a kit's sample section the owner's (BLD-204, §4): the same edit clears `sample`.
  const editProps = useCallback((id: string, patch: Record<string, unknown>) => editDoc((doc) => updateBlockPropsDeep(doc, config, id, ownEdit(doc.content.find((b) => b.props.id === id)?.props as Record<string, unknown> | undefined, patch)), `props:${id}:${Object.keys(patch).join(',')}`), [config, editDoc])
  // The section toolbar (BLD-104): move, duplicate, hide on this device and delete, each one edit and one undo.
  // A delete says so in a toast with Undo; the toast leaves on its own after a few seconds.
  const [toast, setToast] = useState<{ say: string; undo: boolean } | null>(null)
  // A theme pick (BLD-303) is one edit of the draft, so one undo step; the live site changes only on publish.
  const pickTheme = (id: SiteThemeId) => {
    const next = commitTheme(latest.current.draft, id)
    if (next === latest.current.draft) return
    edit(next)
    setToast({ say: 'Theme changed in this draft. Publish to make it live.', undo: true })
  }
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 6000)
    return () => window.clearTimeout(timer)
  }, [toast])
  const sectionAction = useCallback((id: string, action: 'up' | 'down' | 'copy' | 'comment' | 'delete' | 'hide') => {
    if (action === 'comment') return
    const now = latest.current
    const result = sectionCommand(builderPage(now).doc, config, id, action, now.device)
    if (!result) return
    editDoc(() => result.doc)
    if (result.select !== undefined) dispatch({ type: 'select', id: result.select })
    setToast({ say: result.say, undo: !!result.undo })
  }, [config, editDoc])
  const setVisible = useCallback((id: string, visible: boolean) => editDoc((doc) => setSectionVisibility(doc, id, latest.current.device, visible)), [editDoc])
  const setDisplay = useCallback((id: string, value: SectionDisplay) => editDoc((doc) => updateSectionDisplay(doc, id, latest.current.device, value)), [editDoc])

  const dirty = builderDirty(state)
  // Readiness (BLD-204): one model for the ring, the canvas tags, the outline dots and the Publish sheet.
  const liveFigures = useMemo(() => roleHasSpaceRows('stats', metadata as Record<string, unknown> | undefined, new Date()), [metadata])
  const ready = useMemo(() => readiness(state.draft.pages, config, { liveFigures }), [state.draft.pages, config, liveFigures])
  const tags = useMemo(() => readinessTags(ready, page.slug), [ready, page.slug])
  // VIEW AS (BLD-304): the host edits; a visitor or a member sees the page in preview without the sections they never
  // meet (the renderers' own gates), listed under the canvas. Esc leaves preview, which is the host's view again.
  const [picked, setPicked] = useState<ViewAs>('host')
  // Derived, never synced: out of preview the view is the host's, whatever was picked before Esc.
  const view: ViewAs = state.preview ? (picked === 'host' ? 'visitor' : picked) : 'host'
  const viewAs = (next: ViewAs) => { setPicked(next); dispatch({ type: 'preview', on: next !== 'host' }) }
  const lens = useMemo(() => viewerLens(view, metadata), [view, metadata])
  const viewed = useMemo(() => viewerDoc(page.doc, config, view, metadata), [page.doc, config, view, metadata])
  const issuesOf = useMemo(() => {
    const n = new Map<string, number>()
    for (const item of ready.items) if (item.pageSlug === page.slug && item.sectionId) n.set(item.sectionId, (n.get(item.sectionId) ?? 0) + 1)
    return n
  }, [ready, page.slug])
  const [stepAt, setStepAt] = useState(-1)
  const [sheetOpen, setSheetOpen] = useState(false)
  const sections = page.doc.content
  // The spine and outline (BLD-103): one list, reordered by drag or by Alt and an arrow, through one pure move.
  const spine = useMemo(() => spineItems(page.doc, config, state.device), [page.doc, config, state.device])
  // THE EMAIL LENS (BLD-302): on the email surface the canvas is the email the page would send, compiled by compileEmailDoc
  // itself, so what the owner sees is the send. Read only while that surface is showing.
  const email = useMemo(() => (state.surface === 'email'
    ? emailLens(page.doc, config, { subject: page.label, brand: { wordmark: brandName, logoUrl: brand.logo && /^https?:\/\//.test(brand.logo) ? brand.logo : undefined, baseUrl: origin }, origin, metadata: metadata as Record<string, unknown> | undefined })
    : null), [state.surface, page.doc, page.label, config, brandName, brand.logo, origin, metadata])

  // SHOW AS (BLD-301): the canvas draws what this surface can show, framed at the surface's declared density and width;
  // the rest is listed above it with the reason. The document itself keeps every section.
  const surfaced = useMemo(() => surfaceSections(viewed.doc, config, state.surface), [viewed.doc, config, state.surface])
  const frame = surfaceFrame(state.surface, BUILDER_DEVICE_WIDTH[state.device])
  const surfaceDoc = useMemo(() => (surfaced.hidden.length ? { ...viewed.doc, content: surfaced.shown } : viewed.doc), [viewed.doc, surfaced])
  const doors = useMemo(() => (state.surface === 'spotlight' ? spotlightDoors(viewed.doc, config, links.siteBase, page.slug) : null), [state.surface, viewed.doc, config, links.siteBase, page.slug])
  const dragId = useRef<string | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)
  const [moved, setMoved] = useState('')
  const announce = (doc: Data, id: string) => {
    const at = doc.content.findIndex((s) => s.props.id === id)
    setMoved(`Moved to ${at + 1} of ${doc.content.length}.`)
  }
  const reorder = (id: string, to: number) => editDoc((doc) => { const next = moveSection(doc, id, to); announce(next, id); return next })
  const step = (id: string, delta: -1 | 1) => {
    editDoc((doc) => { const next = stepSection(doc, id, delta); announce(next, id); return next })
    // Keep focus on the row that moved, so the next arrow moves it again.
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-spine-id="${CSS.escape(id)}"]`)?.focus())
  }
  const selected = sections.find((s) => s.props.id === state.selectedId) ?? null
  // A picture clicked on the canvas (BLD-104) opens its own field in Tune, the media picker with its focal point
  // lit beside it: one picker, in one place, editing the same draft as the canvas.
  const [tuneFocus, setTuneFocus] = useState<(TuneFocus & { id: string }) | null>(null)
  const openPicture = (id: string, src: string) => {
    const block = builderPage(latest.current).doc.content.find((s) => s.props.id === id)
    if (!block) return
    const projection = tuneProjection(block.type, config)
    const fields = [...projection.layer1, ...projection.layer2]
    const picture = pictureFieldFor(fields, block.props as Record<string, unknown>, src)
    if (!picture) return
    const focal = focalFieldFor(fields, picture.key)
    setTuneFocus({ id, keys: focal ? [picture.key, focal.key] : [picture.key], at: Date.now() })
    if (modes.right !== 'pinned' && modes.right !== 'overlay') toggleRail('right')
  }

  // Go to one readiness item: its page, its section, and for a figure or a photo the field that fills it.
  const goTo = (item: ReadinessItem) => {
    if (item.pageSlug !== builderPage(latest.current).slug) dispatch({ type: 'page', slug: item.pageSlug })
    if (!item.sectionId) { setToast({ say: `${item.say}. Search descriptions are set in the page settings of the current editor for now.`, undo: false }); return }
    const id = item.sectionId
    dispatch({ type: 'select', id })
    const block = latest.current.draft.pages.find((p) => p.slug === item.pageSlug)?.doc.content.find((b) => b.props.id === id)
    const field = item.kind === 'number' ? (block?.type === 'RoleProof' ? 'stats' : 'items') : item.kind === 'alt' ? 'alt' : null
    if (field) { setTuneFocus({ id, keys: [field], at: Date.now() }); if (modes.right !== 'pinned' && modes.right !== 'overlay') toggleRail('right') }
    requestAnimationFrame(() => document.querySelector(`[data-spine-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest' }))
  }
  const stepReadiness = () => {
    const next = nextReadinessItem(ready, stepAt)
    setStepAt(next)
    if (next >= 0) goTo(ready.items[next])
  }
  // Publish goes only through the gate: a clean draft publishes; anything left opens the sheet, where sample words
  // need the owner's explicit keep and a missing number has no way through.
  const publish = () => {
    if (!dirty) return
    if (ready.gate === 'clear') void save(true)
    else setSheetOpen(true)
  }

  // Add a section by intent (BLD-202): the canvas's + gives the position; the outline, the phone bar and ⌘K add after
  // the selected section, or at the end. Only roles this page kind, theme and surface can take are offered.
  const [addAt, setAddAt] = useState<number | null>(null)
  const cards = useMemo(() => addCards(config, page.doc, { surface: state.surface, theme: canvasTheme }), [config, page.doc, state.surface, canvasTheme])
  const openAdd = (at?: number) => {
    const doc = builderPage(latest.current).doc
    const sel = doc.content.findIndex((s) => s.props.id === latest.current.selectedId)
    setAddAt(at ?? (sel >= 0 ? sel + 1 : doc.content.length))
  }
  const pickSection = (type: string) => {
    const now = latest.current
    const result = insertSection(builderPage(now).doc, config, type, addAt ?? builderPage(now).doc.content.length)
    setAddAt(null)
    if (!result.id) return
    editDoc(() => result.doc)
    dispatch({ type: 'select', id: result.id })
    const intent = cards.find((c) => c.type === type)?.intent
    setToast({ say: `Added${intent ? `: ${intent}` : ''}.`, undo: true })
    requestAnimationFrame(() => document.querySelector(`[data-spine-id="${CSS.escape(result.id)}"]`)?.scrollIntoView({ block: 'nearest' }))
  }
  // A preview is one fresh section on this page's canvas, at phone width so it fits beside the list. Cached per type,
  // so moving between cards does not mint a new block (and a new frame) on every render.
  const previewItems = useRef(new Map<string, ReturnType<typeof makeItem>>())
  const previewOf = (card: AddCard) => {
    let item = previewItems.current.get(card.type)
    if (!item) { item = makeItem(config, card.type); previewItems.current.set(card.type, item) }
    const meta = rolePreviewMetadata(card.role, metadata as Record<string, unknown> | undefined) as typeof metadata
    return <WebsiteCanvas key={card.type} pageSlug={page.slug} doc={{ ...page.doc, content: [item] }} theme={canvasTheme} device="phone" config={config} metadata={meta} live={live} nav={state.draft.pages} links={{ ...links, pages: state.draft.pages.map((p) => p.slug) }} origin={origin} title={card.intent} brandName={brandName} logo={brand.logo ?? null} brandAccent={render?.accent ?? brand.accent} themeVars={canvasVars} spaceTheme={render?.fonts} selectedId={null} preview comments={[]} chrome={state.draft.chrome} onSelect={() => {}} onEdit={() => {}} onAction={() => {}} onInsert={() => {}} look={render ? siteLookOverrides(render.lookStyle) : {}} fullFooter={false} />
  }

  // Update to new layouts (BLD-205): the outline says how many sections on this page can move to role blocks; the sheet
  // shows each one beside its role version, and the owner's pick lands as one edit, so one undo takes it back.
  const legacyN = useMemo(() => upgradableCount([page.doc]), [page.doc])
  const [layoutsOpen, setLayoutsOpen] = useState(false)
  const plan = useMemo(() => (layoutsOpen ? legacyPlan(page.doc, config) : null), [layoutsOpen, page.doc, config])
  const previewBlock = (block: { type: string; props: Record<string, unknown> }, key: string) => (
    <WebsiteCanvas key={key} pageSlug={page.slug} doc={{ ...page.doc, content: [block as Data['content'][number]] }} theme={canvasTheme} device="phone" config={config} metadata={metadata} live={live} nav={state.draft.pages} links={{ ...links, pages: state.draft.pages.map((p) => p.slug) }} origin={origin} title={page.label} brandName={brandName} logo={brand.logo ?? null} brandAccent={render?.accent ?? brand.accent} themeVars={canvasVars} spaceTheme={render?.fonts} selectedId={null} preview comments={[]} chrome={state.draft.chrome} onSelect={() => {}} onEdit={() => {}} onAction={() => {}} onInsert={() => {}} look={render ? siteLookOverrides(render.lookStyle) : {}} fullFooter={false} />
  )
  const applyLayouts = (ids: Set<string>) => {
    setLayoutsOpen(false)
    editDoc((doc) => applyLegacy(doc, ids))
    setToast({ say: `Updated ${ids.size} ${ids.size === 1 ? 'section' : 'sections'} to the new layouts.`, undo: true })
  }

  // VERA (BLD-402): one more client of the draft. She never speaks first except on an empty page; otherwise only
  // from ⌘K, the Vera button or the Add sheet. A proposal is grouped by section, drawn as a ghost, and each Accept is
  // one edit of the draft (one undo step). Her output is parsed again here against this page before a line shows.
  const [veraOn, setVeraOn] = useState(() => veraOpening(builderPage(state).doc) !== null)
  const [veraSeed, setVeraSeed] = useState('')
  const [veraBusy, setVeraBusy] = useState(false)
  const [veraStatus, setVeraStatus] = useState('')
  const [veraProposal, setVeraProposal] = useState<VeraProposal | null>(null)
  const [veraPreview, setVeraPreview] = useState<string | null>(null)
  const veraMenuNow = useMemo(() => veraMenu(page.doc, config, cards.filter((c) => !c.disabled).map((c) => ({ type: c.type, label: c.intent }))), [page.doc, config, cards])
  const veraProposalHere = veraProposal && veraProposal.slug === page.slug ? veraProposal : null
  const groups = useMemo(() => (veraProposalHere ? veraGroups(veraProposalHere, page.doc, config, veraMenuNow) : []), [veraProposalHere, page.doc, config, veraMenuNow])
  const ghost = useMemo(() => {
    if (!veraProposalHere || !veraPreview) return null
    const group = veraPreview === 'all' ? 'all' : groups.find((g) => g.id === veraPreview)
    return group ? veraGhost(veraProposalHere, group, page.doc, config) : null
  }, [veraProposalHere, veraPreview, groups, page.doc, config])
  const openVera = (ask?: string) => {
    if (!veraMaySpeak(ask === undefined ? 'rail' : 'command')) return
    setVeraSeed(ask ?? '')
    setVeraOn(true)
    if (modes.right !== 'pinned' && modes.right !== 'overlay') toggleRail('right')
    if (ask?.trim()) void askVera(ask.trim())
  }
  async function askVera(request: string) {
    if (!onLayout) { setVeraStatus('Vera is not available in this editor yet.'); return }
    const slug = builderPage(latest.current).slug
    setVeraBusy(true); setVeraStatus(''); setVeraProposal(null); setVeraPreview(null)
    try {
      const doc = builderPage(latest.current).doc
      const result = await onLayout(request, readPage(doc, config), veraMenuNow)
      if (!result.ok) { setVeraStatus(result.error); return }
      const here = builderPage(latest.current)
      if (here.slug !== slug) { setVeraStatus('That proposal was for another page. Ask again here.'); return }
      const proposal = validateProposal(result, here.doc, slug, veraMenuNow)
      if (!proposal.changes.length && !proposal.refused.length) { setVeraStatus(proposal.note || 'Vera had no change for that. Try naming the section.'); return }
      setVeraProposal(proposal)
      if (!proposal.changes.length) setVeraStatus(proposal.note)
    } catch { setVeraStatus('Vera could not reply. Try again in a moment.') }
    finally { setVeraBusy(false) }
  }
  const acceptVera = (groupId: string | 'all') => {
    const now = builderPage(latest.current)
    if (!veraProposal || veraProposal.slug !== now.slug) return
    const picked = groupId === 'all' ? groups : groups.filter((g) => g.id === groupId)
    if (!picked.length) return
    // Every picked group applies to one document, so Accept (one group or all) is one edit and one undo.
    const joined = { id: groupId, title: '', lines: picked.flatMap((g) => g.lines) }
    const result = acceptGroup(veraProposal, joined, now.doc, config)
    if (result.applied) editDoc(() => result.doc)
    setVeraProposal(result.rest.changes.length || result.rest.refused.length ? result.rest : null)
    setVeraPreview(null)
    setVeraStatus(result.applied ? `Applied ${result.applied} ${result.applied === 1 ? 'change' : 'changes'} to your draft. Undo takes ${result.applied === 1 ? 'it' : 'them'} back in one step.${result.missed.length ? ` Left alone: ${result.missed.join('; ')}.` : ''}` : `Nothing changed. ${result.missed.join('; ')}`)
  }
  // The canvas draws Vera's ghost while a proposal is being previewed, otherwise what this surface shows of the draft.
  const canvasDoc = ghost ? ghost.doc : surfaceDoc
  const opening = useMemo(() => (veraMaySpeak('page-created') ? veraOpening(page.doc) : null), [page.doc])

  // The command bar (BLD-106): every action by its registry id, so ⌘K reaches everything a button does.
  const [commandOpen, setCommandOpen] = useState(false)
  function runAction(id: BuilderActionId) {
    const sel = state.selectedId
    switch (id) {
      case 'undo': case 'redo': dispatch({ type: id }); break
      case 'preview': dispatch({ type: 'preview', on: !state.preview }); break
      case 'focus': railDispatch({ type: 'focus', on: !rails.focus }); break
      case 'publish': publish(); break
      case 'add': openAdd(); break
      case 'update-layouts':
        if (legacyN) setLayoutsOpen(true)
        else setToast({ say: 'No layout updates are available for this page. Your sections stay as they are.', undo: false })
        break
      case 'device-desktop': case 'device-tablet': case 'device-phone': dispatch({ type: 'device', device: id.slice(7) as BuilderDevice }); break
      case 'view-host': case 'view-member': case 'view-visitor': viewAs(id.slice(5) as ViewAs); break
      case 'theme': setThemeOpen(true); break
      case 'vera': openVera(); break
      case 'surface-site': case 'surface-profile': case 'surface-spotlight': case 'surface-email': dispatch({ type: 'surface', surface: id.slice(8) as BuilderSurface }); break
      case 'rail-left': case 'rail-right': toggleRail(id === 'rail-left' ? 'left' : 'right'); break
      case 'pin-left': case 'pin-right': railDispatch({ type: 'pin', side: id === 'pin-left' ? 'left' : 'right', pinned: true }); break
      case 'section-up': case 'section-down': case 'section-copy': case 'section-hide': case 'section-delete':
        if (sel) sectionAction(sel, ({ 'section-up': 'up', 'section-down': 'down', 'section-copy': 'copy', 'section-hide': 'hide', 'section-delete': 'delete' } as const)[id])
        break
    }
  }
  function runCommand(rowId: string, query = '') {
    setCommandOpen(false)
    if (rowId.startsWith('do:')) runAction(rowId.slice(3) as BuilderActionId)
    else if (rowId.startsWith('go-section:')) { const id = rowId.slice(11); dispatch({ type: 'select', id }); requestAnimationFrame(() => document.querySelector(`[data-spine-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest' })) }
    else if (rowId.startsWith('go-page:')) dispatch({ type: 'page', slug: rowId.slice(8) })
    else if (rowId === 'ask') openVera(query)
  }

  function keys(event: KeyboardEvent<HTMLDivElement>) {
    const mod = event.metaKey || event.ctrlKey
    if (mod && event.key.toLowerCase() === 'k') { event.preventDefault(); setCommandOpen(true); return }
    const typing = event.target instanceof HTMLElement && (event.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName))
    if (event.key === 'Escape' && rails.open) { railDispatch({ type: 'close' }); return }
    if (event.key === 'Escape' && rails.focus) { railDispatch({ type: 'focus', on: false }); return }
    if (event.key === 'Escape' && state.preview) { dispatch({ type: 'preview', on: false }); return }
    if (!mod || typing) return
    if (event.key.toLowerCase() === 'z') { event.preventDefault(); dispatch({ type: event.shiftKey ? 'redo' : 'undo' }) }
    else if (event.key === '\\') { event.preventDefault(); dispatch({ type: 'preview', on: !state.preview }) }
  }

  // The page canvas, drawn once: alone on the site, inside the member shell on the profile.
  const pageCanvas = <WebsiteCanvas key={`${page.slug}:${state.surface}:${view}`} pageSlug={page.slug} doc={canvasDoc} theme={profile ? profile.theme : canvasTheme} trySkin={trySkin} device={state.device} config={config} metadata={lens.metadata} live={live} nav={state.draft.pages} links={{ ...links, pages: state.draft.pages.map((p) => p.slug) }} origin={origin} title={page.label} brandName={brandName} logo={brand.logo ?? null} brandAccent={render?.accent ?? brand.accent} themeVars={profile ? profile.vars : canvasVars} spaceTheme={profile ? profile.fonts : render?.fonts} selectedId={state.selectedId} preview={state.preview} comments={page.comments} chrome={state.draft.chrome} onSelect={(id) => dispatch({ type: 'select', id })} onEdit={(id, field, value) => editProps(id, { [field]: value })} onAction={sectionAction} onInsert={openAdd} onDisplay={setDisplay} onVisibility={setVisible} parts onImage={openPicture} tags={lens.tags && !state.preview ? tags : undefined} onReorder={(sources, target) => { const to = page.doc.content.findIndex((b) => b.props.id === target); if (to >= 0) for (const id of sources) reorder(id, to) }} look={render ? siteLookOverrides(render.lookStyle) : {}} fullFooter={render ? siteLook(render.lookStyle).footer === 'full' : true} />

  return (
    <div className={`${styles.root} ${fontClass ?? ''}`} data-builder="v3" data-preview={state.preview} data-focus={rails.focus} data-phone={phone || undefined} style={gridVars} onKeyDown={keys}>
      <header className={styles.top}>
        <a className={styles.back} href={`https://${host}/${page.slug === 'home' ? '' : page.slug}`} aria-label="Back to your website" title="Back to your website"><ChevronLeft size={18} aria-hidden /></a>
        <nav className={styles.crumbs} aria-label="Where you are">
          <span>{brandName}</span><span aria-hidden>/</span><span>Site builder</span><span aria-hidden>/</span>
          <label>
            <span className={styles.hidden}>Page</span>
            <Select value={page.slug} aria-current="page" wrapperClassName="inline-block w-max max-w-full" onChange={(e) => dispatch({ type: 'page', slug: e.target.value })} options={state.draft.pages.map((p) => ({ value: p.slug, label: p.label }))} />
          </label>
        </nav>
        <span className={styles.save} data-state={state.save} role="status"><i className={styles.dot} aria-hidden />{builderSaveLabel(state.save)}</span>
        <span className={styles.spacer} />
        <div className={styles.devices} role="group" aria-label="Device">
          {DEVICES.map(({ id, label, Icon }) => <button key={id} type="button" data-action={`device-${id}`} className={`${styles.btn} ${styles.icon}`} aria-label={label} title={label} aria-pressed={state.device === id} onClick={() => dispatch({ type: 'device', device: id })}><Icon size={16} aria-hidden /></button>)}
        </div>
        <button type="button" data-action="undo" id="builder-undo" className={`${styles.btn} ${styles.icon}`} aria-label="Undo" title="Undo" disabled={!state.past.length} onClick={() => dispatch({ type: 'undo' })}><Undo2 size={16} aria-hidden /></button>
        <button type="button" data-action="redo" className={`${styles.btn} ${styles.icon}`} aria-label="Redo" title="Redo" disabled={!state.future.length} onClick={() => dispatch({ type: 'redo' })}><Redo2 size={16} aria-hidden /></button>
        <span className={styles.wide}><SurfaceSwitcher surface={state.surface} onChange={(surface) => dispatch({ type: 'surface', surface })} /></span>
        <button type="button" data-action="theme" className={`${styles.btn} ${styles.icon}`} aria-label="Change the theme" title="Theme" aria-haspopup="dialog" aria-expanded={themeOpen} onClick={() => setThemeOpen(true)}><Palette size={16} aria-hidden /></button>
        <button type="button" data-action="vera" className={`${styles.btn} ${styles.icon}`} aria-label="Ask Vera" title="Ask Vera" aria-pressed={veraOn} onClick={() => openVera()}><Sparkles size={16} aria-hidden /></button>
        <button id="builder-command" type="button" className={`${styles.btn} ${styles.wide}`} aria-label="Find, do or ask. Shortcut: command K" aria-haspopup="dialog" aria-expanded={commandOpen} onClick={() => setCommandOpen(true)}><span>Find</span><span className={styles.kbd}>⌘K</span></button>
        <button type="button" data-action="focus" className={`${styles.btn} ${styles.icon}`} aria-label="Focus: hide both side panels" title="Focus (Esc to leave)" aria-pressed={rails.focus} onClick={() => railDispatch({ type: 'focus', on: !rails.focus })}><Maximize2 size={16} aria-hidden /></button>
        <span className={styles.wide}><ViewAsSwitch view={view} onChange={viewAs} /></span>
        <button type="button" data-action="preview" className={`${styles.btn} ${styles.icon}`} aria-label="Preview" title="Preview" aria-pressed={state.preview} onClick={() => viewAs(state.preview ? 'host' : 'visitor')}><Eye size={16} aria-hidden /></button>
        <PublishRing readiness={ready} dirty={dirty} saving={state.save === 'saving'} onStep={stepReadiness} onPublish={() => publish()} />
      </header>

      <nav className={styles.outline} aria-label="Page outline" data-mode={modes.left}>
        <div className={styles.railHead}>
          <button id="builder-rail-left" data-action="rail-left" type="button" className={`${styles.btn} ${styles.icon}`} aria-label={modes.left === 'pinned' || modes.left === 'overlay' ? 'Close the outline' : 'Open the outline'} aria-expanded={modes.left === 'pinned' || modes.left === 'overlay'} onClick={() => toggleRail('left')}><PanelLeft size={16} aria-hidden /></button>
          {modes.left === 'overlay' && pinnable.left && <button type="button" data-action="pin-left" className={`${styles.btn} ${styles.icon}`} aria-label="Keep the outline open" title="Pin" onClick={() => railDispatch({ type: 'pin', side: 'left', pinned: true })}><Pin size={16} aria-hidden /></button>}
        </div>
        <div className={styles.caption}>On this page · {spine.length}<button type="button" data-action="add" className={`${styles.btn} ${styles.icon}`} aria-label="Add a section" title="Add a section" onClick={() => openAdd()}><Plus size={16} aria-hidden /></button></div>
        {legacyN > 0 && <button type="button" data-action="update-layouts" className={styles.legacy} aria-haspopup="dialog" onClick={() => setLayoutsOpen(true)}>{legacyN} {legacyN === 1 ? 'section' : 'sections'} can use the new layouts<span>Review</span></button>}
        <p className={styles.hidden} role="status" aria-live="polite">{moved}</p>
        <ul className={styles.list} role="list">
          {spine.map((item, index) => (
            <li key={item.id} data-hidden={item.hidden || undefined} data-drop={dropAt === index || undefined}
              onDragOver={(e) => { if (dragId.current) { e.preventDefault(); setDropAt(index) } }}
              onDragLeave={() => setDropAt((at) => (at === index ? null : at))}
              onDrop={(e) => { e.preventDefault(); if (dragId.current) reorder(dragId.current, index); dragId.current = null; setDropAt(null) }}>
              <button type="button" className={styles.row} data-spine-id={item.id} draggable aria-current={state.selectedId === item.id ? 'true' : undefined}
                aria-label={`${index + 1} of ${spine.length}. ${item.name}${item.title ? `: ${item.title}` : ''}${item.hidden ? `, hidden on ${state.device}` : ''}${issuesOf.get(item.id) ? `. ${issuesOf.get(item.id)} to fix` : ''}. Alt and an arrow key moves it.`}
                aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                onDragStart={(e) => { dragId.current = item.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', item.name) }}
                onDragEnd={() => { dragId.current = null; setDropAt(null) }}
                onKeyDown={(e) => { if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); step(item.id, e.key === 'ArrowUp' ? -1 : 1) } }}
                onClick={() => { dispatch({ type: 'select', id: item.id || null }); if (modes.left === 'overlay') railDispatch({ type: 'close' }) }}>
                <span className={styles.tile}><SectionIcon type={item.type} />{issuesOf.get(item.id) ? <i className={styles.issueDot} aria-hidden /> : null}</span>
                <span className={styles.rowText}><b>{item.name}</b><small>{item.title}</small></span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <main className={styles.canvas} aria-label="Page canvas" onPointerDown={() => { if (rails.open) railDispatch({ type: 'close' }) }}>
        <div style={{ width: `min(100%, ${frame.width}px)`, margin: '0 auto' }}><SurfaceNotes surface={state.surface} sections={surfaced} onSelect={(id) => dispatch({ type: 'select', id })} /></div>
        {ghost && <p className={styles.ghostNote} role="status">Previewing Vera&apos;s {ghost.changed === 1 ? 'change' : 'changes'}. Nothing is on your draft until you accept.</p>}
        <div className={`${styles.frame} ${frame.stackClass}`} data-surface={state.surface} data-density={frame.density} style={{ width: `min(100%, ${frame.width}px)` }}>
          {email ? <EmailLens lens={email} from={brandName} onSelect={(id) => dispatch({ type: 'select', id: id || null })} /> : doors ? <SpotlightDoors doors={doors} brandName={brandName} logo={brand.logo ?? null} selectedId={state.selectedId} onSelect={(id) => dispatch({ type: 'select', id })} /> : profile ? <ProfileFrame brandName={brandName}>{pageCanvas}</ProfileFrame> : pageCanvas}
        </div>
        <div style={{ width: `min(100%, ${BUILDER_DEVICE_WIDTH[state.device]}px)`, margin: '12px auto 0' }}><ViewAsNotes view={view} hostOnly={viewed.hostOnly} onSelect={(id) => dispatch({ type: 'select', id })} /></div>
      </main>

      <aside className={styles.panel} aria-label="Section settings" data-mode={modes.right}>
        {modes.right === 'pinned' && <button type="button" className={styles.grip} role="separator" aria-orientation="vertical" aria-label="Panel width" aria-valuemin={RAIL_WIDTH.min} aria-valuemax={RAIL_WIDTH.max} aria-valuenow={rails.prefs.rightWidth} onPointerDown={resizeFrom} onKeyDown={(e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); railDispatch({ type: 'resize', width: rails.prefs.rightWidth + (e.key === 'ArrowLeft' ? 10 : -10) }) } }} />}
        <div className={styles.railHead}>
          <button id="builder-rail-right" data-action="rail-right" type="button" className={`${styles.btn} ${styles.icon}`} aria-label={modes.right === 'pinned' || modes.right === 'overlay' ? 'Close the settings' : 'Open the settings'} aria-expanded={modes.right === 'pinned' || modes.right === 'overlay'} onClick={() => toggleRail('right')}><PanelRight size={16} aria-hidden /></button>
          {modes.right === 'overlay' && pinnable.right && <button type="button" data-action="pin-right" className={`${styles.btn} ${styles.icon}`} aria-label="Keep the settings open" title="Pin" onClick={() => railDispatch({ type: 'pin', side: 'right', pinned: true })}><Pin size={16} aria-hidden /></button>}
          {modes.right === 'pinned' && <button type="button" data-action="rail-right" className={`${styles.btn} ${styles.icon}`} aria-label="Let the settings float" title="Unpin" onClick={() => railDispatch({ type: 'pin', side: 'right', pinned: false })}><PinOff size={16} aria-hidden /></button>}
        </div>
        <div className={styles.panelBody}>
        {veraOn && <>
          <VeraRail opening={opening} proposal={veraProposalHere} groups={groups} previewing={veraPreview} busy={veraBusy} status={veraStatus} seed={veraSeed} onAsk={(q) => void askVera(q)} onPreview={setVeraPreview} onAccept={acceptVera} onAcceptAll={() => acceptVera('all')} onDismiss={() => { setVeraProposal(null); setVeraPreview(null); setVeraStatus('') }} />
          <button type="button" className={styles.btn} onClick={() => { setVeraOn(false); setVeraPreview(null) }}>Back to section settings</button>
        </>}
        {!veraOn && (selected ? <>
          <h2>{config.components[selected.type]?.label ?? selected.type}</h2>
          <LayoutChips type={selected.type} props={selected.props as Record<string, unknown>} theme={canvasTheme}
            onChange={(patch) => { const id = String(selected.props.id); editDoc((doc) => updateBlockPropsDeep(doc, config, id, patch)) }}
            onFill={(field) => setTuneFocus({ id: String(selected.props.id), keys: [field], at: Date.now() })} />
          <TuneRail key={String(selected.props.id)} type={selected.type} props={selected.props as Record<string, unknown>} config={config} focus={tuneFocus?.id === selected.props.id ? tuneFocus : null} onChange={(key, value) => editProps(String(selected.props.id), { [key]: value })} />
        </> : <>
          <h2>Nothing selected</h2>
          <p>Click a section on the page, or pick one in the outline.</p>
        </>)}
        </div>
      </aside>

      <div className={styles.toastSlot} role="status" aria-live="polite">{toast && <div className={styles.toast}><span>{toast.say}</span>{toast.undo && <button type="button" className={styles.btn} onClick={() => { dispatch({ type: 'undo' }); setToast(null) }}>Undo</button>}</div>}</div>
      {phone && !state.preview && <nav className={styles.bottomBar} aria-label="Builder tools">
        <button type="button" data-action="rail-left" aria-pressed={modes.left === 'overlay'} onClick={() => toggleRail('left')}><ListTree size={20} aria-hidden /><span>Outline</span></button>
        <button type="button" data-action="add" aria-haspopup="dialog" onClick={() => openAdd()}><Plus size={20} aria-hidden /><span>Add</span></button>
        <button type="button" data-action="rail-right" aria-pressed={modes.right === 'overlay'} onClick={() => toggleRail('right')}><SlidersHorizontal size={20} aria-hidden /><span>Tune</span></button>
        <button type="button" data-action="vera" onClick={() => openVera()}><Sparkles size={20} aria-hidden /><span>Vera</span></button>
      </nav>}
      {themeOpen && <ThemeLens draft={state.draft} trying={trying} onTry={setTrying} onPick={pickTheme} onClose={() => setThemeOpen(false)} />}
      {addAt !== null && <AddSheet cards={cards} doc={page.doc} at={addAt} onPick={pickSection} onAsk={(q) => { setAddAt(null); openVera(q) }} onClose={() => setAddAt(null)} preview={previewOf} />}
      {plan && <UpdateLayoutsSheet plan={plan} pageLabel={page.label} preview={previewBlock} onApply={applyLayouts} onClose={() => setLayoutsOpen(false)} focusFallbackId="builder-undo" />}
      {sheetOpen && <PublishSheet readiness={ready} onFix={(item) => { setSheetOpen(false); goTo(item) }} onPublish={(keep) => { if (canPublish(ready, keep)) { setSheetOpen(false); void save(true) } }} onClose={() => setSheetOpen(false)} />}
      {commandOpen && <CommandBar sections={spine} pages={state.draft.pages} selected={!!state.selectedId} onRun={runCommand} onClose={() => setCommandOpen(false)} />}
      {state.preview && <div className={styles.previewPill} role="status">Viewing as a {view === 'member' ? 'member' : 'visitor'} · press Esc to edit</div>}
    </div>
  )
}
