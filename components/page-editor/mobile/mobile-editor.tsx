'use client'

// THE MOBILE EDITOR — a phone-native replacement for Puck's 3-panel desktop editor,
// modelled on Discord's mobile settings. The screen is a persistent LIVE PREVIEW of the
// real page with a floating, elevated CONTROL DOCK pinned to the thumb zone. Every dock
// tab opens an expandable bottom sheet that rises ABOVE the preview but never over the
// editor's own top bar (no `fixed inset-0` blackout). Editing one block still pushes a
// full-screen form with a back-chevron.
//
// It operates on the SAME Puck `Data` document + the SAME `config` (fields schemas +
// block render) the desktop <Puck> uses, so both editors read/write one document and
// one block library. It never imports server-only code: save + publish arrive as props
// (the editors pass down their existing 'use server' actions), and the preview uses
// Puck's client <Render>.
//
// AUTOSAVE: every edit updates local state immediately and schedules a debounced write
// through `onSaveDraft` (the same draft-save each editor already owns). A quiet
// "Draft saved" status confirms it. PUBLISH is a separate deliberate action.

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, Eye, EyeOff, Layers, Plus, Trash2 } from 'lucide-react'
import type { Config, Data } from '@measured/puck'
import { Render } from '@measured/puck'
import { Button } from '@/components/ui/button'
import {
  addBlock,
  blockTitle,
  derivePickerGroups,
  findBlock,
  insertBlockAt,
  moveBlock,
  removeBlock,
  updateBlockProps,
} from './data-ops'
import { FieldForm, type FieldsSchema, type PushRequest } from './field-form'
import { BlockList } from './block-list'
import { BottomSheet } from './bottom-sheet'
import { Snackbar, type SnackbarState } from './snackbar'

/** An extra control surface injected into the dock (e.g. Spotlight's Theme). Each panel
 *  becomes its own dock tab that opens `render()` inside the expandable bottom sheet —
 *  the overlap-free replacement for a `fixed inset-0` drawer. */
export type EditorPanel = {
  key: string
  label: string
  icon?: React.ReactNode
  render: () => React.ReactNode
}

export type MobileEditorProps = {
  config: Config
  /** The initial document (draft). The editor owns it in local state thereafter. */
  data: Data
  /** Page/space/spotlight title shown in the top bar. */
  title: string
  /** Persist the current DRAFT. Called (debounced) on every edit; reuse the editor's
   *  existing draft-save. OPTIONAL: editors with no draft-only path (marketing pages,
   *  Space landings persist only on Publish, exactly like the desktop <Puck>) omit it —
   *  the mobile editor then holds edits in local state until the deliberate Publish,
   *  and the "Draft saved" status stays hidden. Returns void or throws on failure. */
  onSaveDraft?: (data: Data) => Promise<void>
  /** Push the current document LIVE. Reuse the editor's existing publish/baseline flow. */
  onPublish: (data: Data) => Promise<void>
  /** Label for the publish action (e.g. "Publish", "Save"). Defaults to "Publish". */
  publishLabel?: string
  /** Button label + snackbar shown once the live doc matches the draft (clean state).
   *  Defaults to "Published". Spotlight passes "Saved". */
  publishedMessage?: string
  /** Button label while the action runs. Defaults to "Publishing…". */
  publishBusyLabel?: string
  /** Optional small extra chrome for the top bar. NOTE: on mobile the Spotlight theme
   *  drawer is NOT wired here anymore — it ships as a `panels` tab (see below), which
   *  opens in the overlap-free bottom sheet instead of a full-screen drawer. Kept for
   *  any other small top-bar extras. */
  extraActions?: React.ReactNode
  /** Extra control surfaces injected as dock tabs (e.g. Spotlight's Theme). The other
   *  editors pass none, so their dock shows just Blocks + the preview toggle. */
  panels?: EditorPanel[]
  /** Puck render metadata, threaded to every <Render> (preview + per-block previews) so
   *  dynamic/asset-backed blocks resolve correctly — e.g. the Spotlight image/gallery blocks
   *  derive their URL from `metadata.spotlight.publicBase`. Without it those images render
   *  against an empty base and break. Mirrors the desktop <Puck metadata=...> channel. */
  metadata?: Record<string, unknown>
}

// A full-screen sub-form on the stack: the block's own form, or a nested object/array
// row. Each carries its own value + how to commit it back to its parent.
type Screen =
  | { kind: 'block'; id: string }
  | { kind: 'sub'; req: PushRequest }

// Which dock sheet is open. 'blocks' = the block list + add; a panel key = an injected
// panel; null = dock only, full-bleed preview.
type DockSheet = { kind: 'blocks' } | { kind: 'panel'; key: string } | null

export function MobileEditor({
  config,
  data: initialData,
  title,
  onSaveDraft,
  onPublish,
  publishLabel = 'Publish',
  publishedMessage = 'Published',
  publishBusyLabel = 'Publishing…',
  extraActions,
  panels = [],
  metadata,
}: MobileEditorProps) {
  const [data, setData] = useState<Data>(initialData)
  const [stack, setStack] = useState<Screen[]>([])
  const [sheet, setSheet] = useState<DockSheet>(null)
  const [dockHidden, setDockHidden] = useState(false)
  const [reordering, setReordering] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [snackbar, setSnackbar] = useState<SnackbarState>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [publishState, setPublishState] = useState<'idle' | 'publishing' | 'error'>('idle')

  // The top bar height, measured so the dock sheets can start just below it (they must
  // NOT cover the top bar). Falls back to a sane default before the first measure.
  const topBarRef = useRef<HTMLElement>(null)
  const [topBarH, setTopBarH] = useState(48)
  useEffect(() => {
    const el = topBarRef.current
    if (!el) return
    const measure = () => setTopBarH(el.offsetHeight)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // The published baseline: dirty tracking mirrors the desktop editors (captured once,
  // updated on publish), so "Publish" dims when the live doc matches the draft.
  const [baseline, setBaseline] = useState(() => JSON.stringify(initialData))
  const dirty = JSON.stringify(data) !== baseline

  // ── Autosave: debounce a draft write after each change ──────────────────────
  // `latest` mirrors the current document for the debounced/deferred writers. It is
  // only ever written from event handlers + effects (never during render), and kept
  // in sync by the effect below as a backstop.
  const saveTimer = useRef<number | null>(null)
  const latest = useRef(data)
  useEffect(() => {
    latest.current = data
  }, [data])

  const scheduleSave = useCallback(
    (doc: Data) => {
      latest.current = doc
      if (!onSaveDraft) return // No draft-only path: edits persist on Publish (desktop parity).
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
      setSaveState('saving')
      saveTimer.current = window.setTimeout(async () => {
        try {
          await onSaveDraft(latest.current)
          setSaveState('saved')
          window.setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 1600)
        } catch {
          setSaveState('error')
        }
      }, 700)
    },
    [onSaveDraft],
  )

  // Flush a pending save when leaving (back/pop) or unmounting, so nothing is lost.
  useEffect(() => {
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
    }
  }, [])

  // Apply a document change + trigger autosave. Single choke-point for every mutation.
  const commit = useCallback(
    (next: Data) => {
      setData(next)
      scheduleSave(next)
    },
    [scheduleSave],
  )

  // ── Add ─────────────────────────────────────────────────────────────────────
  function handleAdd(type: string) {
    const { data: next, id } = addBlock(data, config, type)
    commit(next)
    setPickerOpen(false)
    setSheet(null)
    // Immediately push the new block's edit screen (spec).
    setStack([{ kind: 'block', id }])
  }

  // ── Delete + Undo ───────────────────────────────────────────────────────────
  function performDelete(id: string) {
    const item = findBlock(data, id)
    const label = item ? blockTitle(config, item) : 'Block'
    const { data: next, removed, index } = removeBlock(data, id)
    if (!removed) return
    commit(next)
    setSnackbar({
      kind: 'undo',
      key: Date.now(),
      message: `${label} deleted`,
      onUndo: () => commit(insertBlockAt(latest.current, removed, index)),
    })
  }

  // ── Reorder ─────────────────────────────────────────────────────────────────
  function handleMove(from: number, to: number) {
    commit(moveBlock(data, from, to))
  }

  // ── Publish ─────────────────────────────────────────────────────────────────
  async function handlePublish() {
    if (!dirty || publishState === 'publishing') return
    setPublishState('publishing')
    try {
      // Flush any pending draft first, then publish the exact current doc.
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
      if (onSaveDraft) await onSaveDraft(latest.current)
      await onPublish(latest.current)
      setBaseline(JSON.stringify(latest.current))
      setPublishState('idle')
      setSnackbar({ kind: 'status', key: Date.now(), message: publishedMessage })
    } catch {
      setPublishState('error')
    }
  }

  const top = stack[stack.length - 1] ?? null

  // ── Render: a pushed full-screen form (covers the preview while editing one block) ──
  if (top) {
    return (
      <FormScreen
        key={stack.length}
        config={config}
        screen={top}
        data={data}
        onBack={() => setStack((s) => s.slice(0, -1))}
        onPush={(req) => setStack((s) => [...s, { kind: 'sub', req }])}
        onChangeBlock={(id, props) => commit(updateBlockProps(data, id, props))}
        onDeleteBlock={(id) => setConfirmDelete(id)}
        saveState={saveState}
      />
    )
  }

  const pickerGroups = derivePickerGroups(config)
  const activePanel = sheet?.kind === 'panel' ? panels.find((p) => p.key === sheet.key) ?? null : null

  // ── Render: home — live preview + control dock ───────────────────────────────
  return (
    <div className="relative flex h-[100dvh] flex-col overflow-hidden overscroll-none bg-canvas">
      {/* Compact top bar (~48px): title, autosave status, deliberate Publish. */}
      <header
        ref={topBarRef}
        className="sticky top-0 z-[55] flex shrink-0 items-center gap-2 border-b border-border bg-canvas/95 px-3 py-2 backdrop-blur"
      >
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold text-text">{title}</h1>
          {statusLabel(saveState) && <p className="text-xs text-muted">{statusLabel(saveState)}</p>}
        </div>
        {extraActions}
        <button
          type="button"
          onClick={handlePublish}
          disabled={!dirty && publishState !== 'error'}
          className={`min-h-[44px] rounded-lg px-4 text-sm font-semibold transition-colors ${
            dirty || publishState === 'error'
              ? 'bg-primary text-on-primary hover:bg-primary-hover'
              : 'cursor-default bg-surface-elevated text-subtle'
          }`}
        >
          {publishState === 'publishing'
            ? publishBusyLabel
            : publishState === 'error'
              ? 'Retry'
              : dirty
                ? publishLabel
                : publishedMessage}
        </button>
      </header>

      {/* Live preview: the REAL page, re-rendering as `data` changes. Taps are swallowed
          (pointer-events off) so preview links never fire. Scrolls independently. */}
      <div className="relative min-h-0 flex-1 overflow-y-auto bg-canvas">
        <div className="sticky top-0 z-10 flex items-center justify-center border-b border-border/60 bg-canvas/80 py-1 backdrop-blur">
          <span className="text-xs font-medium uppercase tracking-wide text-subtle">Preview</span>
        </div>
        <div className="pointer-events-none">
          <Render config={config} data={data} metadata={metadata} />
        </div>
        {/* Bottom breathing room so the dock never sits over the last block. */}
        <div className="h-28" aria-hidden />
      </div>

      {/* Control dock: a floating, elevated segmented bar in the thumb zone. */}
      {!dockHidden ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[60] flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
          <nav
            aria-label="Editor controls"
            className="pointer-events-auto flex w-full max-w-lg items-center gap-1 rounded-2xl border border-border bg-surface-elevated p-1.5 shadow-xl"
          >
            <DockTab
              label="Blocks"
              icon={<Layers className="h-5 w-5" aria-hidden />}
              active={sheet?.kind === 'blocks'}
              onClick={() => setSheet((s) => (s?.kind === 'blocks' ? null : { kind: 'blocks' }))}
            />
            {panels.map((p) => (
              <DockTab
                key={p.key}
                label={p.label}
                icon={p.icon}
                active={sheet?.kind === 'panel' && sheet.key === p.key}
                onClick={() =>
                  setSheet((s) => (s?.kind === 'panel' && s.key === p.key ? null : { kind: 'panel', key: p.key }))
                }
              />
            ))}
            <DockTab
              label="Hide"
              icon={<EyeOff className="h-5 w-5" aria-hidden />}
              onClick={() => {
                setSheet(null)
                setDockHidden(true)
              }}
            />
          </nav>
        </div>
      ) : (
        // Full-bleed preview: a single always-visible control brings the dock back.
        <button
          type="button"
          aria-label="Show editor controls"
          onClick={() => setDockHidden(false)}
          className="absolute bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] right-4 z-[60] flex h-12 w-12 items-center justify-center rounded-full bg-surface-elevated text-text shadow-xl"
        >
          <Eye className="h-5 w-5" aria-hidden />
        </button>
      )}

      {/* Blocks sheet: the block list + a prominent Add block. Expandable, capped at
          85dvh, starts below the top bar (never overlaps it). */}
      <BottomSheet
        open={sheet?.kind === 'blocks'}
        onClose={() => setSheet(null)}
        title="Blocks"
        size="tall"
        topInsetPx={topBarH}
        headerAction={
          data.content.length > 1 ? (
            <button
              type="button"
              onClick={() => setReordering((v) => !v)}
              className="min-h-[36px] rounded-lg px-3 text-sm font-medium text-text hover:bg-surface"
            >
              {reordering ? 'Done' : 'Reorder'}
            </button>
          ) : undefined
        }
      >
        <div className="-mx-5">
          <BlockList
            config={config}
            data={data}
            metadata={metadata}
            reordering={reordering}
            onOpen={(id) => {
              setSheet(null)
              setStack([{ kind: 'block', id }])
            }}
            onDelete={performDelete}
            onMove={handleMove}
          />
        </div>
        <Button type="button" className="mt-4 w-full" onClick={() => setPickerOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden /> Add block
        </Button>
      </BottomSheet>

      {/* Injected panel sheets (e.g. Spotlight Theme). Same expandable, overlap-free sheet. */}
      {panels.map((p) => (
        <BottomSheet
          key={p.key}
          open={activePanel?.key === p.key}
          onClose={() => setSheet(null)}
          title={p.label}
          size="tall"
          topInsetPx={topBarH}
        >
          {activePanel?.key === p.key ? p.render() : null}
        </BottomSheet>
      ))}

      {/* Add-block picker sheet (short interaction → auto size) */}
      <BottomSheet open={pickerOpen} onClose={() => setPickerOpen(false)} title="Add block" topInsetPx={topBarH}>
        <div className="space-y-5">
          {pickerGroups.map((group) => (
            <div key={group.key}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">
                {group.title}
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {group.items.map((b) => (
                  <button
                    key={b.type}
                    type="button"
                    onClick={() => handleAdd(b.type)}
                    className="flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-xl border border-border bg-surface px-2 py-2 text-center text-xs font-medium text-text hover:bg-surface-elevated"
                  >
                    <span className="line-clamp-2">{b.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </BottomSheet>

      {/* Delete confirm sheet (from the in-edit "Delete block") */}
      <BottomSheet
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Delete this block?"
      >
        <p className="mb-4 text-sm text-muted">You can undo right after.</p>
        <div className="flex gap-3">
          <Button type="button" variant="secondary" className="flex-1" onClick={() => setConfirmDelete(null)}>
            Keep
          </Button>
          <Button
            type="button"
            variant="danger"
            className="flex-1"
            onClick={() => {
              const id = confirmDelete!
              setConfirmDelete(null)
              setStack([]) // back to the preview + dock
              performDelete(id)
            }}
          >
            Delete block
          </Button>
        </div>
      </BottomSheet>

      <Snackbar state={snackbar} onDismiss={() => setSnackbar(null)} />
    </div>
  )
}

function statusLabel(s: 'idle' | 'saving' | 'saved' | 'error'): string | undefined {
  if (s === 'saving') return 'Saving…'
  if (s === 'saved') return 'Draft saved'
  if (s === 'error') return 'Save failed'
  return undefined
}

// One dock tab: an icon over a tiny label, >=48px target, active = elevated pill.
function DockTab({
  label,
  icon,
  active = false,
  onClick,
}: {
  label: string
  icon?: React.ReactNode
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1.5 text-xs font-medium transition-colors ${
        active ? 'bg-primary text-on-primary' : 'text-muted hover:bg-surface hover:text-text'
      }`}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  )
}

// A pushed full-screen form. Back-chevron = save-and-exit (autosave already fired on
// each change; back simply pops). Renders the block's fields, or a nested sub-form.
function FormScreen({
  config,
  screen,
  data,
  onBack,
  onPush,
  onChangeBlock,
  onDeleteBlock,
  saveState,
}: {
  config: Config
  screen: Screen
  data: Data
  onBack: () => void
  onPush: (req: PushRequest) => void
  onChangeBlock: (id: string, props: Record<string, unknown>) => void
  onDeleteBlock: (id: string) => void
  saveState: 'idle' | 'saving' | 'saved' | 'error'
}) {
  const backRef = useRef<HTMLButtonElement>(null)
  // Focus the back button on push so keyboard/AT users land at the screen's start.
  useEffect(() => {
    backRef.current?.focus()
  }, [])

  let heading: string
  let fields: FieldsSchema
  let value: Record<string, unknown>
  let onChange: (v: Record<string, unknown>) => void
  let blockId: string | null = null

  if (screen.kind === 'block') {
    const item = findBlock(data, screen.id)
    blockId = screen.id
    const entry = (config.components as Record<string, { label?: string; fields?: FieldsSchema }>)[
      item?.type ?? ''
    ]
    heading = entry?.label ?? item?.type ?? 'Block'
    fields = (entry?.fields ?? {}) as FieldsSchema
    value = (item?.props as Record<string, unknown>) ?? {}
    onChange = (v) => onChangeBlock(screen.id, v)
  } else {
    heading = screen.req.title
    fields = screen.req.fields
    value = screen.req.value
    onChange = (v) => screen.req.onChange(v)
  }

  return (
    <div className="min-h-[100dvh] bg-canvas">
      <header className="sticky top-0 z-[55] flex items-center gap-2 border-b border-border bg-canvas/95 px-2 py-2 backdrop-blur">
        <button
          ref={backRef}
          type="button"
          onClick={onBack}
          aria-label="Save and go back"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-text hover:bg-surface-elevated"
        >
          <ChevronLeft className="h-6 w-6" aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold text-text">{heading}</h1>
          {saveState === 'saving' && <p className="text-xs text-muted">Saving…</p>}
          {saveState === 'saved' && <p className="text-xs text-muted">Draft saved</p>}
        </div>
      </header>

      <FieldForm fields={fields} value={value} onChange={onChange} onPushScreen={onPush} />

      {/* Delete lives at the bottom of the block's own form only (not sub-forms). */}
      {blockId && (
        <div className="px-4 py-6">
          <Button
            type="button"
            variant="dangerOutline"
            className="w-full"
            onClick={() => onDeleteBlock(blockId!)}
          >
            <Trash2 className="h-4 w-4" aria-hidden /> Delete block
          </Button>
        </div>
      )}
    </div>
  )
}
