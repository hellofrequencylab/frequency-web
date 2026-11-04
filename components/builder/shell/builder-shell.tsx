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
import { ChevronLeft, Eye, Maximize2, Monitor, PanelLeft, PanelRight, Pin, PinOff, Redo2, Smartphone, Tablet, Undo2 } from 'lucide-react'
import type { WebsiteEditorShellProps } from '@/components/sites/editor/shell'
import { SectionIcon } from '@/components/sites/editor/section-icon'
import { nudgeBlock, removeBlockDeep, updateBlockPropsDeep } from '@/components/page-editor/mobile/data-ops'
import type { Data } from '@/lib/page-editor/types'
import { moveSection, spineItems, stepSection } from '@/lib/builder/spine'
import { railInit, railModes, railPinnable, railReducer, RAIL_PREFS_KEY, RAIL_WIDTH, type RailSide } from '@/lib/builder/rails'
import { builderDirty, builderInit, builderPage, builderReducer, builderSaveLabel, BUILDER_DEVICE_WIDTH, type BuilderDevice } from '@/lib/builder/state'
import { siteCanvasVars, siteRenderStyle } from '@/lib/sites/site-render-style'
import { resolveWebsiteBrand, type WebsiteSnapshot } from '@/lib/sites/editor/state'
import { sitePageStyle, siteLook, siteLookOverrides, type SiteStyle } from '@/lib/theme/site-style'
import { EDITOR_THEME_OF } from '@/lib/sites/site-render-style'
import { Select } from '@/components/ui/select'
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

export function BuilderShell({ host, brandName, logo, brandAccent, initial, config, metadata, live, links, origin, onSave, siteStyle, defaultAccent, fontClass }: WebsiteEditorShellProps) {
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

  // The canvas wears the live site's own resolver, so the page here is the page visitors get.
  const style: SiteStyle | undefined = siteStyle
  const brand = resolveWebsiteBrand(state.draft, { logo, accent: brandAccent })
  const render = useMemo(() => (style ? siteRenderStyle(sitePageStyle(style, page.slug), brand.accent, defaultAccent ?? null) : null), [style, page.slug, brand.accent, defaultAccent])
  const canvasVars = useMemo(() => (render ? siteCanvasVars(render) : undefined), [render])
  const canvasTheme = render?.editorTheme ?? (style ? EDITOR_THEME_OF[style.theme] : state.draft.theme)

  const edit = useCallback((next: WebsiteSnapshot) => dispatch({ type: 'edit', draft: next }), [])
  const editDoc = useCallback((change: (doc: Data) => Data) => {
    const now = latest.current
    const current = builderPage(now)
    edit({ ...now.draft, pages: now.draft.pages.map((p) => (p.slug === current.slug ? { ...p, doc: change(p.doc) } : p)) })
  }, [edit])
  const editProps = useCallback((id: string, patch: Record<string, unknown>) => editDoc((doc) => updateBlockPropsDeep(doc, config, id, patch)), [config, editDoc])
  // The canvas's own section toolbar: move and delete work now; copy, comment and hide arrive with BLD-104.
  const sectionAction = useCallback((id: string, action: 'up' | 'down' | 'copy' | 'comment' | 'delete' | 'hide') => {
    if (action === 'up' || action === 'down') editDoc((doc) => nudgeBlock(doc, config, id, action === 'up' ? -1 : 1))
    else if (action === 'delete') { editDoc((doc) => removeBlockDeep(doc, config, id).data); dispatch({ type: 'select', id: null }) }
  }, [config, editDoc])

  const dirty = builderDirty(state)
  const publishState = !dirty ? 'live' : 'clean'
  const sections = page.doc.content
  // The spine and outline (BLD-103): one list, reordered by drag or by Alt and an arrow, through one pure move.
  const spine = useMemo(() => spineItems(page.doc, config, state.device), [page.doc, config, state.device])
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

  function keys(event: KeyboardEvent<HTMLDivElement>) {
    const mod = event.metaKey || event.ctrlKey
    const typing = event.target instanceof HTMLElement && (event.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName))
    if (event.key === 'Escape' && rails.open) { railDispatch({ type: 'close' }); return }
    if (event.key === 'Escape' && rails.focus) { railDispatch({ type: 'focus', on: false }); return }
    if (event.key === 'Escape' && state.preview) { dispatch({ type: 'preview', on: false }); return }
    if (!mod || typing) return
    if (event.key.toLowerCase() === 'z') { event.preventDefault(); dispatch({ type: event.shiftKey ? 'redo' : 'undo' }) }
    else if (event.key === '\\') { event.preventDefault(); dispatch({ type: 'preview', on: !state.preview }) }
  }

  return (
    <div className={`${styles.root} ${fontClass ?? ''}`} data-builder="v3" data-preview={state.preview} data-focus={rails.focus} style={gridVars} onKeyDown={keys}>
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
          {DEVICES.map(({ id, label, Icon }) => <button key={id} type="button" className={`${styles.btn} ${styles.icon}`} aria-label={label} title={label} aria-pressed={state.device === id} onClick={() => dispatch({ type: 'device', device: id })}><Icon size={16} aria-hidden /></button>)}
        </div>
        <button type="button" className={`${styles.btn} ${styles.icon}`} aria-label="Undo" title="Undo" disabled={!state.past.length} onClick={() => dispatch({ type: 'undo' })}><Undo2 size={16} aria-hidden /></button>
        <button type="button" className={`${styles.btn} ${styles.icon}`} aria-label="Redo" title="Redo" disabled={!state.future.length} onClick={() => dispatch({ type: 'redo' })}><Redo2 size={16} aria-hidden /></button>
        <button type="button" className={`${styles.btn} ${styles.wide}`} aria-haspopup="menu" disabled title="Show as: the other surfaces arrive with the surface switcher">Site · Visitor</button>
        <button type="button" className={`${styles.btn} ${styles.wide}`} aria-label="Find, do or ask. Shortcut: command K" disabled title="The command bar arrives in a later pass"><span>Find</span><span className={styles.kbd}>⌘K</span></button>
        <button type="button" className={`${styles.btn} ${styles.icon}`} aria-label="Focus: hide both side panels" title="Focus (Esc to leave)" aria-pressed={rails.focus} onClick={() => railDispatch({ type: 'focus', on: !rails.focus })}><Maximize2 size={16} aria-hidden /></button>
        <button type="button" className={`${styles.btn} ${styles.icon}`} aria-label="Preview" title="Preview" aria-pressed={state.preview} onClick={() => dispatch({ type: 'preview', on: !state.preview })}><Eye size={16} aria-hidden /></button>
        <button type="button" className={styles.publish} data-state={publishState} disabled={state.save === 'saving' || !dirty} onClick={() => void save(true)}>{dirty ? 'Publish' : 'Published'}</button>
      </header>

      <nav className={styles.outline} aria-label="Page outline" data-mode={modes.left}>
        <div className={styles.railHead}>
          <button id="builder-rail-left" type="button" className={`${styles.btn} ${styles.icon}`} aria-label={modes.left === 'pinned' || modes.left === 'overlay' ? 'Close the outline' : 'Open the outline'} aria-expanded={modes.left === 'pinned' || modes.left === 'overlay'} onClick={() => toggleRail('left')}><PanelLeft size={16} aria-hidden /></button>
          {modes.left === 'overlay' && pinnable.left && <button type="button" className={`${styles.btn} ${styles.icon}`} aria-label="Keep the outline open" title="Pin" onClick={() => railDispatch({ type: 'pin', side: 'left', pinned: true })}><Pin size={16} aria-hidden /></button>}
        </div>
        <div className={styles.caption}>On this page · {spine.length}</div>
        <p className={styles.hidden} role="status" aria-live="polite">{moved}</p>
        <ul className={styles.list} role="list">
          {spine.map((item, index) => (
            <li key={item.id} data-hidden={item.hidden || undefined} data-drop={dropAt === index || undefined}
              onDragOver={(e) => { if (dragId.current) { e.preventDefault(); setDropAt(index) } }}
              onDragLeave={() => setDropAt((at) => (at === index ? null : at))}
              onDrop={(e) => { e.preventDefault(); if (dragId.current) reorder(dragId.current, index); dragId.current = null; setDropAt(null) }}>
              <button type="button" className={styles.row} data-spine-id={item.id} draggable aria-current={state.selectedId === item.id ? 'true' : undefined}
                aria-label={`${index + 1} of ${spine.length}. ${item.name}${item.title ? `: ${item.title}` : ''}${item.hidden ? `, hidden on ${state.device}` : ''}. Alt and an arrow key moves it.`}
                aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                onDragStart={(e) => { dragId.current = item.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', item.name) }}
                onDragEnd={() => { dragId.current = null; setDropAt(null) }}
                onKeyDown={(e) => { if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); step(item.id, e.key === 'ArrowUp' ? -1 : 1) } }}
                onClick={() => { dispatch({ type: 'select', id: item.id || null }); if (modes.left === 'overlay') railDispatch({ type: 'close' }) }}>
                <span className={styles.tile}><SectionIcon type={item.type} /></span>
                <span className={styles.rowText}><b>{item.name}</b><small>{item.title}</small></span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <main className={styles.canvas} aria-label="Page canvas" onPointerDown={() => { if (rails.open) railDispatch({ type: 'close' }) }}>
        <div className={styles.frame} style={{ width: `min(100%, ${BUILDER_DEVICE_WIDTH[state.device]}px)` }}>
          <WebsiteCanvas key={page.slug} pageSlug={page.slug} doc={page.doc} theme={canvasTheme} device={state.device} config={config} metadata={metadata} live={live} nav={state.draft.pages} links={{ ...links, pages: state.draft.pages.map((p) => p.slug) }} origin={origin} title={page.label} brandName={brandName} logo={brand.logo ?? null} brandAccent={render?.accent ?? brand.accent} themeVars={canvasVars} spaceTheme={render?.fonts} selectedId={state.selectedId} preview={state.preview} comments={page.comments} chrome={state.draft.chrome} onSelect={(id) => dispatch({ type: 'select', id })} onEdit={(id, field, value) => editProps(id, { [field]: value })} onAction={sectionAction} onInsert={() => {}} onDisplay={() => {}} onReorder={(sources, target) => { const to = page.doc.content.findIndex((b) => b.props.id === target); if (to >= 0) for (const id of sources) reorder(id, to) }} look={render ? siteLookOverrides(render.lookStyle) : {}} fullFooter={render ? siteLook(render.lookStyle).footer === 'full' : true} />
        </div>
      </main>

      <aside className={styles.panel} aria-label="Section settings" data-mode={modes.right}>
        {modes.right === 'pinned' && <button type="button" className={styles.grip} role="separator" aria-orientation="vertical" aria-label="Panel width" aria-valuemin={RAIL_WIDTH.min} aria-valuemax={RAIL_WIDTH.max} aria-valuenow={rails.prefs.rightWidth} onPointerDown={resizeFrom} onKeyDown={(e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); railDispatch({ type: 'resize', width: rails.prefs.rightWidth + (e.key === 'ArrowLeft' ? 10 : -10) }) } }} />}
        <div className={styles.railHead}>
          <button id="builder-rail-right" type="button" className={`${styles.btn} ${styles.icon}`} aria-label={modes.right === 'pinned' || modes.right === 'overlay' ? 'Close the settings' : 'Open the settings'} aria-expanded={modes.right === 'pinned' || modes.right === 'overlay'} onClick={() => toggleRail('right')}><PanelRight size={16} aria-hidden /></button>
          {modes.right === 'overlay' && pinnable.right && <button type="button" className={`${styles.btn} ${styles.icon}`} aria-label="Keep the settings open" title="Pin" onClick={() => railDispatch({ type: 'pin', side: 'right', pinned: true })}><Pin size={16} aria-hidden /></button>}
          {modes.right === 'pinned' && <button type="button" className={`${styles.btn} ${styles.icon}`} aria-label="Let the settings float" title="Unpin" onClick={() => railDispatch({ type: 'pin', side: 'right', pinned: false })}><PinOff size={16} aria-hidden /></button>}
        </div>
        <div className={styles.panelBody}>
        {selected ? <>
          <h2>{config.components[selected.type]?.label ?? selected.type}</h2>
          <p>Click any words on the page to change them. The full settings for this section arrive in the next builder pass.</p>
        </> : <>
          <h2>Nothing selected</h2>
          <p>Click a section on the page, or pick one in the outline.</p>
        </>}
        </div>
      </aside>

      {state.preview && <div className={styles.previewPill} role="status">Previewing as a visitor · press Esc to edit</div>}
    </div>
  )
}
