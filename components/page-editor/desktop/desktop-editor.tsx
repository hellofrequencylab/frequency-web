'use client'

// ─────────────────────────────────────────────────────────────────────────────
// THE DESKTOP EDITOR — the in-house, Puck-free replacement for the <Puck> canvas
// (ADR-493 Phase 3). It promotes the phone editor's Puck-free core (data-ops.ts +
// field-form.tsx) to a classic three-pane authoring layout:
//
//   • LEFT   — the block OUTLINE (a tree mirroring the document + its slot regions)
//              plus an "Add block" palette built from config.categories/components.
//              Select, reorder (↑/↓ or drag), duplicate, delete, and add INTO a slot.
//   • CENTER — a faithful LIVE PREVIEW via <BlockRender> (the exact markup the public
//              page ships), re-rendering on every edit.
//   • RIGHT  — the field INSPECTOR: the selected block's fields via the shared
//              <FieldForm> (nested object/array fields push an in-panel sub-form).
//
// It holds the Puck-format `Data` document in LOCAL state and exposes it through a
// context (useEditorDoc), the drop-in for the old usePuck().appState.data that the
// surfaces' Publish/Save buttons read. Every mutation routes through data-ops.ts, so
// the persisted `{ content, root }` shape is byte-for-byte identical — no stored doc
// migrates. `onChange` fires on every edit (Spotlight autosaves the draft through it).
//
// DRAG-AND-DROP is a convenience layered on the unit-tested `moveBlockTo`; the ↑/↓
// nudge buttons are the always-correct fallback (a working editor over a fancy one).
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Copy,
  Layers,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import type { Config, Data, Metadata } from '@/lib/page-editor/types'
import { BlockRender } from '@/lib/page-editor/block-render'
import { Button } from '@/components/ui/button'
import {
  addBlock,
  addBlockToSlot,
  buildOutline,
  derivePickerGroups,
  duplicateBlockDeep,
  findBlockDeep,
  moveBlockTo,
  nudgeBlock,
  removeBlockDeep,
  updateBlockPropsDeep,
  type OutlineNode,
} from '../mobile/data-ops'
import { FieldForm, type FieldsSchema, type PushRequest } from '../mobile/field-form'

// ── Live-document context (the usePuck().appState.data replacement) ────────────
const EditorDocContext = createContext<Data | null>(null)

/** The live editor document, for chrome rendered inside <DesktopEditor> (e.g. the
 *  Publish/Save buttons a surface passes as `headerActions`). Drop-in for the old
 *  usePuck().appState.data. */
export function useEditorDoc(): Data {
  const doc = useContext(EditorDocContext)
  if (!doc) throw new Error('useEditorDoc must be used inside <DesktopEditor>')
  return doc
}

export type DesktopEditorProps = {
  config: Config
  /** The initial document. The editor owns it in local state thereafter. */
  data: Data
  /** Render metadata threaded to the preview (space / spotlight / live channels). */
  metadata?: Metadata
  /** Shown in the editor's top bar. */
  headerTitle?: string
  /** Surface chrome (Exit link, Publish/Save/Reset). Rendered INSIDE the doc context,
   *  so buttons can read the live document via useEditorDoc(). */
  headerActions?: React.ReactNode
  /** Fired after every document change (used for draft autosave, e.g. Spotlight). */
  onChange?: (data: Data) => void
}

// A palette request: where a picked block should land. `null` parent = top level.
type PaletteTarget = { parentId: string; slotKey: string } | null

export function DesktopEditor({
  config,
  data: initialData,
  metadata,
  headerTitle,
  headerActions,
  onChange,
}: DesktopEditorProps) {
  const [data, setData] = useState<Data>(initialData)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Open palette (and where its pick lands); undefined = closed.
  const [palette, setPalette] = useState<PaletteTarget | undefined>(undefined)
  const [draggingId, setDraggingId] = useState<string | null>(null)

  const commit = useCallback(
    (next: Data, select?: string | null) => {
      setData(next)
      if (select !== undefined) setSelectedId(select)
      onChange?.(next)
    },
    [onChange],
  )

  const handleAddTop = useCallback(
    (type: string) => {
      const { data: next, id } = addBlock(data, config, type)
      commit(next, id)
      setPalette(undefined)
    },
    [data, config, commit],
  )

  const handleAddToSlot = useCallback(
    (parentId: string, slotKey: string, type: string) => {
      const { data: next, id } = addBlockToSlot(data, config, parentId, slotKey, type)
      if (id) commit(next, id)
      setPalette(undefined)
    },
    [data, config, commit],
  )

  const handleDelete = useCallback(
    (id: string) => {
      const { data: next, removed } = removeBlockDeep(data, config, id)
      if (removed) commit(next, selectedId === id ? null : selectedId)
    },
    [data, config, commit, selectedId],
  )

  const handleDuplicate = useCallback(
    (id: string) => {
      const { data: next, id: newId } = duplicateBlockDeep(data, config, id)
      if (newId) commit(next, newId)
    },
    [data, config, commit],
  )

  const handleNudge = useCallback(
    (id: string, delta: -1 | 1) => commit(nudgeBlock(data, config, id, delta)),
    [data, config, commit],
  )

  const handleMove = useCallback(
    (id: string, parentId: string | null, slotKey: string | null, index: number) =>
      commit(moveBlockTo(data, config, id, { parentId, slotKey, index })),
    [data, config, commit],
  )

  const handleEditProps = useCallback(
    (id: string, props: Record<string, unknown>) => commit(updateBlockPropsDeep(data, config, id, props)),
    [data, config, commit],
  )

  const outline = useMemo(() => buildOutline(data, config), [data, config])
  const selected = selectedId ? findBlockDeep(data, config, selectedId) : null
  // Pass the live document so the palette greys out any block at its per-page cap (block-limits.ts).
  const pickerGroups = useMemo(() => derivePickerGroups(config, data), [config, data])

  return (
    <EditorDocContext.Provider value={data}>
      <div className="relative flex h-[100dvh] flex-col overflow-hidden bg-canvas text-text">
        {/* Top bar: title + surface chrome (Publish/Save/etc.). */}
        <header className="flex shrink-0 items-center gap-3 border-b border-border bg-surface px-4 py-2.5">
          <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-text">
            {headerTitle ?? 'Editing'}
          </h1>
          <div className="flex items-center gap-2">{headerActions}</div>
        </header>

        <div className="flex min-h-0 flex-1">
          {/* LEFT — block outline + add. */}
          <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">
                <Layers className="h-4 w-4" aria-hidden /> Blocks
              </span>
              <button
                type="button"
                onClick={() => setPalette(null)}
                className="inline-flex min-h-[32px] items-center gap-1 rounded-lg bg-primary px-2.5 text-xs font-semibold text-on-primary hover:bg-primary-hover"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden /> Add block
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {outline.length === 0 ? (
                <p className="px-2 py-8 text-center text-sm text-muted">
                  Nothing here yet. Add your first block.
                </p>
              ) : (
                <OutlineTree
                  nodes={outline}
                  parentId={null}
                  slotKey={null}
                  depth={0}
                  selectedId={selectedId}
                  draggingId={draggingId}
                  onSelect={setSelectedId}
                  onNudge={handleNudge}
                  onDuplicate={handleDuplicate}
                  onDelete={handleDelete}
                  onAddToSlot={(parentId, slotKey) => setPalette({ parentId, slotKey })}
                  onDragStartId={setDraggingId}
                  onDragEndId={() => setDraggingId(null)}
                  onDropMove={handleMove}
                />
              )}
            </div>
          </aside>

          {/* CENTER — faithful live preview. Non-interactive: selection happens in the
              outline, so a stray click never navigates away or fires a block's link. */}
          <main className="min-h-0 flex-1 overflow-y-auto bg-canvas">
            <div className="pointer-events-none mx-auto w-full">
              <BlockRender config={config} data={data} metadata={metadata} />
            </div>
          </main>

          {/* RIGHT — field inspector for the selected block. */}
          <aside className="flex w-80 shrink-0 flex-col border-l border-border bg-surface">
            {selected ? (
              <Inspector
                key={selectedId}
                config={config}
                block={selected}
                onChange={(props) => handleEditProps(selectedId!, props)}
                onDuplicate={() => handleDuplicate(selectedId!)}
                onDelete={() => handleDelete(selectedId!)}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center p-6 text-center">
                <p className="text-sm text-muted">Select a block to edit its content.</p>
              </div>
            )}
          </aside>
        </div>

        {/* Add-block palette (top-level or into a slot). */}
        {palette !== undefined && (
          <PalettePopover
            groups={pickerGroups}
            onPick={(type) =>
              palette === null ? handleAddTop(type) : handleAddToSlot(palette.parentId, palette.slotKey, type)
            }
            onClose={() => setPalette(undefined)}
          />
        )}
      </div>
    </EditorDocContext.Provider>
  )
}

export default DesktopEditor

// ── Outline tree ───────────────────────────────────────────────────────────────

function OutlineTree({
  nodes,
  parentId,
  slotKey,
  depth,
  selectedId,
  draggingId,
  onSelect,
  onNudge,
  onDuplicate,
  onDelete,
  onAddToSlot,
  onDragStartId,
  onDragEndId,
  onDropMove,
}: {
  nodes: OutlineNode[]
  parentId: string | null
  slotKey: string | null
  depth: number
  selectedId: string | null
  draggingId: string | null
  onSelect: (id: string) => void
  onNudge: (id: string, delta: -1 | 1) => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
  onAddToSlot: (parentId: string, slotKey: string) => void
  onDragStartId: (id: string) => void
  onDragEndId: () => void
  onDropMove: (id: string, parentId: string | null, slotKey: string | null, index: number) => void
}) {
  return (
    <ul className="space-y-1">
      {nodes.map((node, index) => (
        <li key={node.id}>
          <div
            draggable
            onDragStart={(e) => {
              e.stopPropagation()
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/plain', node.id)
              onDragStartId(node.id)
            }}
            onDragEnd={onDragEndId}
            onDragOver={(e) => {
              if (!draggingId || draggingId === node.id) return
              e.preventDefault()
              e.stopPropagation()
            }}
            onDrop={(e) => {
              e.preventDefault()
              e.stopPropagation()
              const id = e.dataTransfer.getData('text/plain') || draggingId
              if (id && id !== node.id) onDropMove(id, parentId, slotKey, index)
              onDragEndId()
            }}
            className={`group flex items-center gap-1 rounded-lg border px-2 py-1.5 ${
              selectedId === node.id ? 'border-primary bg-primary-bg/40' : 'border-transparent hover:bg-surface-elevated'
            }`}
          >
            <button
              type="button"
              onClick={() => onSelect(node.id)}
              className="flex min-w-0 flex-1 flex-col items-start text-left"
            >
              <span className="truncate text-sm font-medium text-text">{node.label}</span>
              {node.summary && <span className="truncate text-xs text-muted">{node.summary}</span>}
            </button>
            <div className="flex shrink-0 items-center opacity-60 transition-opacity group-hover:opacity-100">
              <IconBtn label="Move up" onClick={() => onNudge(node.id, -1)}>
                <ChevronUp className="h-4 w-4" aria-hidden />
              </IconBtn>
              <IconBtn label="Move down" onClick={() => onNudge(node.id, 1)}>
                <ChevronDown className="h-4 w-4" aria-hidden />
              </IconBtn>
              <IconBtn label="Duplicate" onClick={() => onDuplicate(node.id)}>
                <Copy className="h-4 w-4" aria-hidden />
              </IconBtn>
              <IconBtn label="Delete" danger onClick={() => onDelete(node.id)}>
                <Trash2 className="h-4 w-4" aria-hidden />
              </IconBtn>
            </div>
          </div>

          {/* Nested slot regions. */}
          {node.slots.length > 0 && (
            <div className="mt-1 space-y-2 border-l border-border pl-3">
              {node.slots.map((slot) => (
                <div key={slot.key}>
                  <div className="flex items-center justify-between px-1 py-0.5">
                    <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-subtle">
                      {slot.label}
                    </span>
                    <IconBtn label={`Add to ${slot.label}`} onClick={() => onAddToSlot(node.id, slot.key)}>
                      <Plus className="h-3.5 w-3.5" aria-hidden />
                    </IconBtn>
                  </div>
                  {slot.children.length === 0 ? (
                    <div
                      onDragOver={(e) => {
                        if (!draggingId) return
                        e.preventDefault()
                        e.stopPropagation()
                      }}
                      onDrop={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        const id = e.dataTransfer.getData('text/plain') || draggingId
                        if (id) onDropMove(id, node.id, slot.key, 0)
                        onDragEndId()
                      }}
                      className="rounded-lg border border-dashed border-border px-2 py-2 text-center text-xs text-subtle"
                    >
                      Empty. Drop or add a block.
                    </div>
                  ) : (
                    <OutlineTree
                      nodes={slot.children}
                      parentId={node.id}
                      slotKey={slot.key}
                      depth={depth + 1}
                      selectedId={selectedId}
                      draggingId={draggingId}
                      onSelect={onSelect}
                      onNudge={onNudge}
                      onDuplicate={onDuplicate}
                      onDelete={onDelete}
                      onAddToSlot={onAddToSlot}
                      onDragStartId={onDragStartId}
                      onDragEndId={onDragEndId}
                      onDropMove={onDropMove}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

function IconBtn({
  label,
  danger = false,
  onClick,
  children,
}: {
  label: string
  danger?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded-md hover:bg-surface ${
        danger ? 'text-danger hover:bg-danger-bg' : 'text-muted hover:text-text'
      }`}
    >
      {children}
    </button>
  )
}

// ── Inspector (right pane) ──────────────────────────────────────────────────────
// The selected block's fields via the shared <FieldForm>. Slot fields are edited via
// the outline tree, so they're filtered out here. Nested object/array fields push an
// in-panel sub-form stack (mirrors the mobile BlockEditSheet), so no nested modals.

function Inspector({
  config,
  block,
  onChange,
  onDuplicate,
  onDelete,
}: {
  config: Config
  block: { type: string; props: Record<string, unknown> }
  onChange: (props: Record<string, unknown>) => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const [subs, setSubs] = useState<PushRequest[]>([])
  const entry = (config.components as Record<string, { label?: string; fields?: FieldsSchema }>)[block.type]
  const label = entry?.label ?? block.type
  // Slot regions are managed in the outline; the inspector edits scalar/composite fields.
  const topFields: FieldsSchema = Object.fromEntries(
    Object.entries((entry?.fields ?? {}) as FieldsSchema).filter(([, f]) => f.type !== 'slot'),
  )

  const sub = subs[subs.length - 1] ?? null
  const heading = sub ? sub.title : label
  const fields = sub ? sub.fields : topFields
  const value = sub ? sub.value : (block.props as Record<string, unknown>)
  const onFieldsChange = sub ? sub.onChange : onChange

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        {subs.length > 0 && (
          <button
            type="button"
            onClick={() => setSubs((s) => s.slice(0, -1))}
            aria-label="Back"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-elevated hover:text-text"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
        )}
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-text">{heading}</h2>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <FieldForm
          fields={fields}
          value={value}
          onChange={onFieldsChange}
          onPushScreen={(req) => setSubs((s) => [...s, req])}
        />
      </div>

      {subs.length === 0 && (
        <div className="flex gap-2 border-t border-border p-3">
          <Button type="button" variant="secondary" className="flex-1" onClick={onDuplicate}>
            <Copy className="h-4 w-4" aria-hidden /> Duplicate
          </Button>
          <Button type="button" variant="dangerOutline" className="flex-1" onClick={onDelete}>
            <Trash2 className="h-4 w-4" aria-hidden /> Delete
          </Button>
        </div>
      )}
    </div>
  )
}

// ── Add-block palette ───────────────────────────────────────────────────────────

function PalettePopover({
  groups,
  onPick,
  onClose,
}: {
  groups: {
    key: string
    title: string
    items: { type: string; label: string; disabled?: boolean; reason?: string }[]
  }[]
  onPick: (type: string) => void
  onClose: () => void
}) {
  return (
    <div
      className="absolute inset-0 z-50 flex bg-black/30"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex h-full w-96 max-w-full flex-col border-r border-border bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-text">Add a block</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-elevated hover:text-text"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          {groups.map((group) => (
            <div key={group.key}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">{group.title}</h3>
              <div className="grid grid-cols-2 gap-2">
                {group.items.map((b) =>
                  b.disabled ? (
                    // At its per-page cap: greyed, not clickable, with the reason as a tooltip + a11y label.
                    <div
                      key={b.type}
                      title={b.reason}
                      aria-disabled="true"
                      className="flex min-h-[48px] cursor-not-allowed items-center rounded-lg border border-border bg-surface-elevated px-3 py-2 text-left text-sm font-medium text-subtle opacity-60"
                    >
                      <span className="line-clamp-2">{b.label}</span>
                    </div>
                  ) : (
                    <button
                      key={b.type}
                      type="button"
                      onClick={() => onPick(b.type)}
                      className="flex min-h-[48px] items-center rounded-lg border border-border bg-canvas px-3 py-2 text-left text-sm font-medium text-text hover:border-primary hover:bg-surface-elevated"
                    >
                      <span className="line-clamp-2">{b.label}</span>
                    </button>
                  ),
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
