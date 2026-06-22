'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { Columns3, FolderPlus, Plus, RotateCcw, Trash2 } from 'lucide-react'
import type { ResolvedItem, ResolvedMenu, ResolvedRailCard } from '@/lib/menus/types'
import {
  ensureMenu,
  seedMenuFromDefaults,
  setMenuColumns,
  createCategory,
  updateCategory,
  deleteCategory,
  createItem,
  reorderItems,
  createRailCard,
} from '@/lib/menus/actions'
import { AdminSection } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { ItemEditor, GridControls } from './item-editor'
import { RailCardEditor } from './rail-card-editor'
import { isGridSurface } from './known-routes'
import { isPinnedRailItem, PINNED_PROFILE_ID } from '@/lib/menus/defaults'

// The per-surface menu editor. Holds the working ResolvedMenu in state and drives
// every CRUD path against lib/menus/actions. Categories (3), columns (5), grid
// placement (6), drag/drop links within & across groups (7), and rail cards (10) all
// live here; per-item depth (4, 8, 9, 11) is delegated to ItemEditor.
//
// ROOT is the synthetic bucket for items with no category (menu-level links).
const ROOT = '__root__'

type DragRef = { itemId: string; from: string } | null

export function MenuEditor({
  initialMenu,
  surfaceKey,
  surfaceLabel,
  onStatus,
  leftColumnTop,
  rightColumnTop,
}: {
  initialMenu: ResolvedMenu
  surfaceKey: ResolvedMenu['surfaceKey']
  surfaceLabel: string
  onStatus: (msg: string) => void
  /** Rendered at the TOP of the left (editor) column — the surface picker (point 2). */
  leftColumnTop?: React.ReactNode
  /** Rendered at the TOP of the right (settings) column — the speed panel (point 2). */
  rightColumnTop?: React.ReactNode
}) {
  const [menu, setMenu] = useState<ResolvedMenu>(initialMenu)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [columnsDraft, setColumnsDraft] = useState(String(initialMenu.columns))
  const dragRef = useRef<DragRef>(null)
  const [dragId, setDragId] = useState<string | null>(null)

  // Grid surfaces (mega-menus) show the column / row / span placement controls; linear
  // surfaces (left rail, marketing footer) hide them (point 4).
  const isGrid = isGridSurface(surfaceKey)

  // The left rail pins Profile right after Feed (point 1b): a fixed, runtime-injected row
  // that is never persisted and can't be dragged or deleted. Render it as a separate lead
  // row in the root bucket, and strip any copy out of the draggable root list (the code
  // default carries it; a seeded menu does not — so handle both).
  const pinnedLead =
    surfaceKey === 'left_rail'
      ? (menu.rootItems.find((i) => isPinnedRailItem(i.id)) ?? {
          id: PINNED_PROFILE_ID,
          label: 'Profile',
          href: '/profile',
          position: 1,
          colSpan: 1,
          mode: 'active' as const,
          roleModes: {},
          minAccess: 'visitor' as const,
        })
      : null
  const draggableRootItems = menu.rootItems.filter((i) => !isPinnedRailItem(i.id))

  // The menu may be the code fallback (no DB id). Every write needs a real menu row,
  // so we lazily ensure one and stamp the id into local state.
  async function ensuredMenuId(): Promise<string | null> {
    if (menu.id) return menu.id
    const res = await ensureMenu(surfaceKey)
    if (!res.ok) {
      setError(res.error)
      return null
    }
    setMenu((m) => ({ ...m, id: res.id, isDefault: false }))
    return res.id
  }

  // ── Flatten the nested category tree to a render list (depth for indentation) ──
  const flatCategories = useMemo(() => flatten(menu.categories), [menu.categories])

  // ── Columns (requirement 5) ────────────────────────────────────────────────
  function saveColumns(next: number) {
    const clamped = Math.max(1, Math.min(12, Math.round(next)))
    const prev = menu.columns
    setMenu((m) => ({ ...m, columns: clamped }))
    setColumnsDraft(String(clamped))
    setError(null)
    onStatus('Saving columns')
    startTransition(async () => {
      const id = await ensuredMenuId()
      if (!id) {
        setMenu((m) => ({ ...m, columns: prev }))
        return
      }
      const res = await setMenuColumns(id, clamped)
      if (res.ok) onStatus('Columns saved')
      else {
        setMenu((m) => ({ ...m, columns: prev }))
        setError(res.error)
        onStatus('Could not save columns')
      }
    })
  }

  // ── Seed / reset (requirement 12) ──────────────────────────────────────────
  function seed() {
    const verb = menu.isDefault ? 'Seed' : 'Reset'
    if (
      !confirm(
        `${verb} "${surfaceLabel}" from the site defaults? This replaces every category, link, and rail card on this surface with today's nav. This cannot be undone.`,
      )
    )
      return
    setError(null)
    onStatus(`${verb}ing from defaults`)
    startTransition(async () => {
      const res = await seedMenuFromDefaults(surfaceKey)
      if (res.ok) {
        onStatus('Seeded from defaults. Reload to edit the new rows.')
        // The action replaced rows server-side; the simplest faithful refresh is a
        // reload so the editor rehydrates from the freshly seeded DB shape.
        if (typeof window !== 'undefined') window.location.reload()
      } else {
        setError(res.error)
        onStatus('Could not seed from defaults')
      }
    })
  }

  // ── Add a category (requirement 3) ─────────────────────────────────────────
  function addCategory(parentId: string | null) {
    setError(null)
    onStatus('Adding group')
    startTransition(async () => {
      const id = await ensuredMenuId()
      if (!id) return
      const position = parentId
        ? (findCategory(menu.categories, parentId)?.children.length ?? 0)
        : menu.categories.length
      const res = await createCategory({ menuId: id, parentId, label: 'New group', position })
      if (res.ok) {
        const fresh: ResolvedCategoryLite = {
          id: res.id,
          label: 'New group',
          position,
          colSpan: 1,
          items: [],
          children: [],
        }
        setMenu((m) => ({ ...m, categories: insertCategory(m.categories, parentId, fresh) }))
        onStatus('Group added')
      } else {
        setError(res.error)
        onStatus('Could not add group')
      }
    })
  }

  function renameCategory(catId: string, label: string) {
    const prev = findCategory(menu.categories, catId)?.label
    setMenu((m) => ({ ...m, categories: patchCategory(m.categories, catId, { label: label || undefined }) }))
    setError(null)
    onStatus('Saving group heading')
    startTransition(async () => {
      const res = await updateCategory(catId, { label: label || null })
      if (res.ok) onStatus('Group heading saved')
      else {
        setMenu((m) => ({ ...m, categories: patchCategory(m.categories, catId, { label: prev }) }))
        setError(res.error)
        onStatus('Could not save group heading')
      }
    })
  }

  function saveCategoryGrid(
    catId: string,
    patch: { gridCol?: number | null; gridRow?: number | null; colSpan?: number },
  ) {
    setError(null)
    onStatus('Saving group placement')
    setMenu((m) => ({
      ...m,
      categories: patchCategory(m.categories, catId, {
        gridCol: 'gridCol' in patch ? (patch.gridCol ?? undefined) : undefined,
        gridRow: 'gridRow' in patch ? (patch.gridRow ?? undefined) : undefined,
        colSpan: patch.colSpan,
      }),
    }))
    startTransition(async () => {
      const res = await updateCategory(catId, patch)
      if (res.ok) onStatus('Group placement saved')
      else {
        setError(res.error)
        onStatus('Could not save group placement')
      }
    })
  }

  function removeCategory(catId: string, label?: string) {
    if (
      !confirm(
        `Delete the group "${label || 'Untitled'}"? Its sub-groups and links are removed too. This cannot be undone.`,
      )
    )
      return
    const snapshot = menu.categories
    setMenu((m) => ({ ...m, categories: removeCategoryFrom(m.categories, catId) }))
    setError(null)
    onStatus('Deleting group')
    startTransition(async () => {
      const res = await deleteCategory(catId)
      if (res.ok) onStatus('Group deleted')
      else {
        setMenu((m) => ({ ...m, categories: snapshot }))
        setError(res.error)
        onStatus('Could not delete group')
      }
    })
  }

  // ── Add a link to a bucket (root or a category) (requirement 3) ────────────
  function addItem(categoryId: string | null) {
    setError(null)
    onStatus('Adding link')
    startTransition(async () => {
      const id = await ensuredMenuId()
      if (!id) return
      const bucket = categoryId ?? ROOT
      const position = itemsInBucket(bucket).length
      const res = await createItem({
        menuId: id,
        categoryId,
        label: 'New link',
        href: '/feed',
        position,
      })
      if (res.ok) {
        const fresh: ResolvedItem = {
          id: res.id,
          label: 'New link',
          href: '/feed',
          position,
          colSpan: 1,
          mode: 'active',
          roleModes: {},
          minAccess: 'visitor',
        }
        setMenu((m) => addItemToBucket(m, categoryId, fresh))
        onStatus('Link added')
      } else {
        setError(res.error)
        onStatus('Could not add link')
      }
    })
  }

  // ── Add a rail card (requirement 10) ───────────────────────────────────────
  function addRailCard(side: 'left' | 'right') {
    setError(null)
    onStatus('Adding rail card')
    startTransition(async () => {
      const id = await ensuredMenuId()
      if (!id) return
      const position = menu.railCards.filter((c) => c.side === side).length
      const res = await createRailCard({
        menuId: id,
        side,
        title: 'New card',
        body: 'A short, inviting line.',
        href: '/feed',
        position,
      })
      if (res.ok) {
        const fresh: ResolvedRailCard = {
          id: res.id,
          side,
          title: 'New card',
          body: 'A short, inviting line.',
          href: '/feed',
          position,
          mode: 'active',
          roleModes: {},
        }
        setMenu((m) => ({ ...m, railCards: [...m.railCards, fresh] }))
        onStatus('Rail card added')
      } else {
        setError(res.error)
        onStatus('Could not add rail card')
      }
    })
  }

  // ── Drag/drop links within & across buckets (requirement 7) ────────────────
  function itemsInBucket(bucket: string): ResolvedItem[] {
    if (bucket === ROOT) return menu.rootItems
    return findCategory(menu.categories, bucket)?.items ?? []
  }

  function moveOverItem(bucket: string, overItemId: string) {
    const d = dragRef.current
    if (!d || d.itemId === overItemId) return
    setMenu((m) => moveItem(m, d.itemId, bucket, overItemId))
    dragRef.current = { itemId: d.itemId, from: bucket }
  }

  // Allow dropping into an empty bucket (or at the end) by dragging onto its zone.
  function moveIntoBucket(bucket: string) {
    const d = dragRef.current
    if (!d) return
    setMenu((m) => moveItem(m, d.itemId, bucket, null))
    dragRef.current = { itemId: d.itemId, from: bucket }
  }

  function commitDrag() {
    const d = dragRef.current
    dragRef.current = null
    setDragId(null)
    if (!d) return
    // Persist the new positions + category for the destination bucket. The fixed pinned
    // Profile row has no DB id, so never include it in a reorder write.
    const bucket = d.from
    const items = itemsInBucket(bucket).filter((it) => !isPinnedRailItem(it.id))
    const categoryId = bucket === ROOT ? null : bucket
    const updates = items.map((it, i) => ({ id: it.id, position: i, category_id: categoryId }))
    setError(null)
    onStatus('Saving order')
    startTransition(async () => {
      const res = await reorderItems(updates)
      if (res.ok) onStatus('Order saved')
      else {
        setError(res.error)
        onStatus('Could not save order')
      }
    })
  }

  function dragHandlersFor(itemId: string, bucket: string) {
    return {
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        dragRef.current = { itemId, from: bucket }
        setDragId(itemId)
        e.dataTransfer.effectAllowed = 'move'
      },
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault()
        moveOverItem(bucket, itemId)
      },
      onDragEnd: () => commitDrag(),
    }
  }

  const seedLabel = menu.isDefault ? 'Seed from site defaults' : 'Reset from site defaults'

  // Columns (the menu-wide column count) + Seed/Reset — the right (settings) column.
  const layoutAndDefaults = (
    <AdminSection
      title="Layout & defaults"
      description="Set how many columns this menu spreads across, then seed or reset it from today's site nav."
      actions={
        <button
          type="button"
          onClick={seed}
          disabled={isPending}
          className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-elevated hover:text-text disabled:opacity-50"
        >
          <RotateCcw className="h-4 w-4 shrink-0" aria-hidden />
          {seedLabel}
        </button>
      }
    >
      <div className="flex flex-wrap items-end gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <div className="min-w-0">
          <label htmlFor={`cols-${surfaceKey}`} className="mb-1 flex items-center gap-2 text-xs font-semibold text-subtle">
            <Columns3 className="h-3.5 w-3.5" aria-hidden />
            Columns
          </label>
          <div className="flex items-center gap-2">
            <input
              id={`cols-${surfaceKey}`}
              type="number"
              min={1}
              max={12}
              value={columnsDraft}
              disabled={isPending}
              onChange={(e) => setColumnsDraft(e.target.value)}
              onBlur={() => {
                const n = Number(columnsDraft)
                if (Number.isFinite(n) && n !== menu.columns) saveColumns(n)
                else setColumnsDraft(String(menu.columns))
              }}
              className="w-24 rounded-lg border border-border bg-canvas/40 px-2.5 py-1.5 text-sm tabular-nums text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            />
            <span className="text-xs text-subtle">1 to 12, default 6</span>
          </div>
        </div>
      </div>
    </AdminSection>
  )

  return (
    // Two-thirds / one-third on lg+ (point 2): editor left (col-span-2), settings right
    // (col-span-1, sticky). Single column on mobile.
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
      {/* Left column: surface picker, then Groups & links, then Rail cards. */}
      <div className="space-y-8 lg:col-span-2">
        {leftColumnTop}

        {error && (
          <p className="rounded-lg border border-danger/30 bg-danger-bg/40 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        {menu.isDefault && (
          <div className="rounded-2xl border border-dashed border-border bg-surface/50 p-4 text-sm text-muted">
            This surface has no saved menu yet, so it is showing the site defaults. Editing
            anything, or seeding, creates an editable copy in the database.
          </div>
        )}

      {/* Categories + links (3, 4, 6, 7, 8, 9) */}
      <AdminSection
        title="Groups & links"
        description="Add groups and sub-groups, edit each group heading, then drag links to reorder within a group or move them across groups. Open a link to edit its subheading, placement, modes, and per-role visibility."
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => addItem(null)}
              disabled={isPending}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-elevated hover:text-text disabled:opacity-50"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Menu-level link
            </button>
            <button
              type="button"
              onClick={() => addCategory(null)}
              disabled={isPending}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
            >
              <FolderPlus className="h-4 w-4" aria-hidden />
              Add group
            </button>
          </div>
        }
      >
        {/* Menu-level (root) links */}
        <Bucket
          title="Menu-level links"
          hint="Links that sit directly on the menu, outside any group."
          items={draggableRootItems}
          pinnedLead={pinnedLead}
          isGrid={isGrid}
          bucket={ROOT}
          dragId={dragId}
          isPending={isPending}
          onAddItem={() => addItem(null)}
          onDropInto={() => moveIntoBucket(ROOT)}
          dragHandlersFor={dragHandlersFor}
          patchItem={(id, patch) => setMenu((m) => patchRootItem(m, id, patch))}
          deleteItem={(id) => setMenu((m) => ({ ...m, rootItems: m.rootItems.filter((i) => i.id !== id) }))}
          onStatus={onStatus}
        />

        {flatCategories.length === 0 ? (
          <EmptyState
            title="No groups yet"
            description="Add a group to start organizing this menu into columns of links."
            action={
              <button
                type="button"
                onClick={() => addCategory(null)}
                className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
              >
                Add a group
              </button>
            }
          />
        ) : (
          <ul className="space-y-4">
            {flatCategories.map(({ cat, depth }) => (
              <li
                key={cat.id}
                style={{ marginLeft: depth * 16 }}
                className="rounded-2xl border border-border bg-surface p-4 sm:p-5"
              >
                <CategoryHeader
                  cat={cat}
                  isPending={isPending}
                  isGrid={isGrid}
                  onRename={(label) => renameCategory(cat.id, label)}
                  onAddSub={() => addCategory(cat.id)}
                  onAddItem={() => addItem(cat.id)}
                  onDelete={() => removeCategory(cat.id, cat.label)}
                  onSaveGrid={(p) => saveCategoryGrid(cat.id, p)}
                />
                <Bucket
                  items={cat.items}
                  isGrid={isGrid}
                  bucket={cat.id}
                  dragId={dragId}
                  isPending={isPending}
                  onAddItem={() => addItem(cat.id)}
                  onDropInto={() => moveIntoBucket(cat.id)}
                  dragHandlersFor={dragHandlersFor}
                  patchItem={(id, patch) => setMenu((m) => patchCategoryItem(m, cat.id, id, patch))}
                  deleteItem={(id) =>
                    setMenu((m) => ({
                      ...m,
                      categories: patchCategory(m.categories, cat.id, undefined, (c) => ({
                        ...c,
                        items: c.items.filter((i) => i.id !== id),
                      })),
                    }))
                  }
                  onStatus={onStatus}
                />
              </li>
            ))}
          </ul>
        )}
      </AdminSection>

      {/* Rail cards (10) */}
      <AdminSection
        title="Rail cards"
        description="Featured side cards on the menu panel, like the welcome card that invites a member to find their first circle."
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => addRailCard('left')}
              disabled={isPending}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-elevated hover:text-text disabled:opacity-50"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Left card
            </button>
            <button
              type="button"
              onClick={() => addRailCard('right')}
              disabled={isPending}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-elevated hover:text-text disabled:opacity-50"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Right card
            </button>
          </div>
        }
      >
        {menu.railCards.length === 0 ? (
          <EmptyState
            title="No rail cards"
            description="Add a left or right card to feature a destination beside the links."
          />
        ) : (
          <ul className="space-y-2">
            {menu.railCards.map((card) => (
              <RailCardEditor
                key={card.id}
                card={card}
                onStatus={onStatus}
                onChanged={(patch) =>
                  setMenu((m) => ({
                    ...m,
                    railCards: m.railCards.map((c) => (c.id === card.id ? { ...c, ...patch } : c)),
                  }))
                }
                onDeleted={() =>
                  setMenu((m) => ({ ...m, railCards: m.railCards.filter((c) => c.id !== card.id) }))
                }
              />
            ))}
          </ul>
        )}
      </AdminSection>
      </div>

      {/* Right column: speed panel (top), then Layout & defaults. Sticky on lg+. */}
      <div className="lg:col-span-1">
        <div className="space-y-8 lg:sticky lg:top-6">
          {rightColumnTop}
          {layoutAndDefaults}
        </div>
      </div>
    </div>
  )
}

// ── A bucket of draggable items (root or a category) ──────────────────────────
// Every item is draggable and any group (root, sub-group, or empty group) is a valid
// drop target — the wrapping div's onDrop always reparents into this bucket (point 3).
// An optional `pinnedLead` renders a fixed, non-draggable row at the top (the Profile
// pin, point 1b). `isGrid` flows down to each ItemEditor so linear surfaces hide grid
// placement (point 4).
function Bucket({
  title,
  hint,
  items,
  pinnedLead,
  isGrid,
  bucket,
  dragId,
  isPending,
  onAddItem,
  onDropInto,
  dragHandlersFor,
  patchItem,
  deleteItem,
  onStatus,
}: {
  title?: string
  hint?: string
  items: ResolvedItem[]
  pinnedLead?: ResolvedItem | null
  isGrid: boolean
  bucket: string
  dragId: string | null
  isPending: boolean
  onAddItem: () => void
  onDropInto: () => void
  dragHandlersFor: (itemId: string, bucket: string) => {
    draggable: boolean
    onDragStart: (e: React.DragEvent) => void
    onDragOver: (e: React.DragEvent) => void
    onDragEnd: (e: React.DragEvent) => void
  }
  patchItem: (id: string, patch: Partial<ResolvedItem>) => void
  deleteItem: (id: string) => void
  onStatus: (msg: string) => void
}) {
  // Inert drag handlers for the pinned lead (it is never draggable).
  const noDrag = {
    draggable: false,
    onDragStart: () => {},
    onDragOver: () => {},
    onDragEnd: () => {},
  }
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        if (items.length === 0) onDropInto()
      }}
      onDrop={(e) => {
        e.preventDefault()
        onDropInto()
      }}
      className="mt-3"
    >
      {title && <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-subtle">{title}</p>}
      {hint && <p className="mb-2 text-xs text-subtle">{hint}</p>}
      <ul className="space-y-1.5">
        {pinnedLead && (
          <ItemEditor
            key={pinnedLead.id}
            item={pinnedLead}
            pinned
            isGrid={isGrid}
            isDragging={false}
            dragHandlers={noDrag}
            onStatus={onStatus}
            onChanged={() => {}}
            onDeleted={() => {}}
          />
        )}
        {items.map((item) => (
          <ItemEditor
            key={item.id}
            item={item}
            isGrid={isGrid}
            isDragging={dragId === item.id}
            dragHandlers={dragHandlersFor(item.id, bucket)}
            onStatus={onStatus}
            onChanged={(patch) => patchItem(item.id, patch)}
            onDeleted={() => deleteItem(item.id)}
          />
        ))}
      </ul>
      {items.length === 0 && (
        <button
          type="button"
          onClick={onAddItem}
          disabled={isPending}
          className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-3 text-xs font-medium text-subtle transition-colors hover:bg-surface-elevated hover:text-text disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Add a link, or drop one here
        </button>
      )}
    </div>
  )
}

// ── Category header: heading rename, placement, add sub-group / link, delete ──
function CategoryHeader({
  cat,
  isPending,
  isGrid,
  onRename,
  onAddSub,
  onAddItem,
  onDelete,
  onSaveGrid,
}: {
  cat: ResolvedCategoryLite
  isPending: boolean
  /** Grid surfaces show the placement controls; linear surfaces hide them (point 4). */
  isGrid: boolean
  onRename: (label: string) => void
  onAddSub: () => void
  onAddItem: () => void
  onDelete: () => void
  onSaveGrid: (patch: { gridCol?: number | null; gridRow?: number | null; colSpan?: number }) => void
}) {
  const [label, setLabel] = useState(cat.label ?? '')
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0 flex-1">
          <label className="mb-1 block text-xs font-semibold text-subtle" htmlFor={`cat-${cat.id}`}>
            Group heading
          </label>
          <input
            id={`cat-${cat.id}`}
            type="text"
            value={label}
            placeholder="Untitled group"
            disabled={isPending}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={() => label !== (cat.label ?? '') && onRename(label)}
            className="w-full max-w-sm rounded-lg border border-border bg-canvas/40 px-2.5 py-1.5 text-sm font-semibold text-text placeholder:text-subtle focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onAddItem}
            disabled={isPending}
            className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-elevated hover:text-text disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Link
          </button>
          <button
            type="button"
            onClick={onAddSub}
            disabled={isPending}
            className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-elevated hover:text-text disabled:opacity-50"
          >
            <FolderPlus className="h-3.5 w-3.5" aria-hidden />
            Sub-group
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={isPending}
            aria-label="Delete group"
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-danger-bg hover:text-danger disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
      {isGrid && (
        <GridControls
          gridCol={cat.gridCol}
          gridRow={cat.gridRow}
          colSpan={cat.colSpan}
          disabled={isPending}
          onSave={onSaveGrid}
        />
      )}
    </div>
  )
}

// ── Pure tree helpers (no React) ──────────────────────────────────────────────
type ResolvedCategoryLite = ResolvedMenu['categories'][number]

function flatten(
  cats: ResolvedCategoryLite[],
  depth = 0,
): { cat: ResolvedCategoryLite; depth: number }[] {
  const out: { cat: ResolvedCategoryLite; depth: number }[] = []
  for (const cat of cats) {
    out.push({ cat, depth })
    out.push(...flatten(cat.children, depth + 1))
  }
  return out
}

function findCategory(cats: ResolvedCategoryLite[], id: string): ResolvedCategoryLite | null {
  for (const cat of cats) {
    if (cat.id === id) return cat
    const found = findCategory(cat.children, id)
    if (found) return found
  }
  return null
}

function insertCategory(
  cats: ResolvedCategoryLite[],
  parentId: string | null,
  fresh: ResolvedCategoryLite,
): ResolvedCategoryLite[] {
  if (parentId == null) return [...cats, fresh]
  return cats.map((c) =>
    c.id === parentId
      ? { ...c, children: [...c.children, fresh] }
      : { ...c, children: insertCategory(c.children, parentId, fresh) },
  )
}

function patchCategory(
  cats: ResolvedCategoryLite[],
  id: string,
  patch?: Partial<ResolvedCategoryLite>,
  transform?: (c: ResolvedCategoryLite) => ResolvedCategoryLite,
): ResolvedCategoryLite[] {
  return cats.map((c) => {
    if (c.id === id) {
      let next = patch ? { ...c, ...patch } : c
      if (transform) next = transform(next)
      return next
    }
    return { ...c, children: patchCategory(c.children, id, patch, transform) }
  })
}

function removeCategoryFrom(cats: ResolvedCategoryLite[], id: string): ResolvedCategoryLite[] {
  return cats
    .filter((c) => c.id !== id)
    .map((c) => ({ ...c, children: removeCategoryFrom(c.children, id) }))
}

function patchRootItem(
  m: ResolvedMenu,
  id: string,
  patch: Partial<ResolvedItem>,
): ResolvedMenu {
  return { ...m, rootItems: m.rootItems.map((i) => (i.id === id ? { ...i, ...patch } : i)) }
}

function patchCategoryItem(
  m: ResolvedMenu,
  catId: string,
  itemId: string,
  patch: Partial<ResolvedItem>,
): ResolvedMenu {
  return {
    ...m,
    categories: patchCategory(m.categories, catId, undefined, (c) => ({
      ...c,
      items: c.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)),
    })),
  }
}

function addItemToBucket(
  m: ResolvedMenu,
  categoryId: string | null,
  item: ResolvedItem,
): ResolvedMenu {
  if (categoryId == null) return { ...m, rootItems: [...m.rootItems, item] }
  return {
    ...m,
    categories: patchCategory(m.categories, categoryId, undefined, (c) => ({
      ...c,
      items: [...c.items, item],
    })),
  }
}

// Move an item to a destination bucket, inserting before `overItemId` (or at the end
// when null). Handles both reorder-within and reparent-across.
function moveItem(
  m: ResolvedMenu,
  itemId: string,
  destBucket: string,
  overItemId: string | null,
): ResolvedMenu {
  // 1. Find + detach the item from wherever it lives.
  let moving: ResolvedItem | null = null
  const stripRoot = m.rootItems.filter((i) => {
    if (i.id === itemId) {
      moving = i
      return false
    }
    return true
  })
  function strip(cats: ResolvedCategoryLite[]): ResolvedCategoryLite[] {
    return cats.map((c) => ({
      ...c,
      items: c.items.filter((i) => {
        if (i.id === itemId) {
          moving = i
          return false
        }
        return true
      }),
      children: strip(c.children),
    }))
  }
  const strippedCats = strip(m.categories)
  if (!moving) return m

  // 2. Insert into the destination bucket.
  const insertInto = (list: ResolvedItem[]) => {
    const next = [...list]
    const idx = overItemId ? next.findIndex((i) => i.id === overItemId) : -1
    if (idx === -1) next.push(moving as ResolvedItem)
    else next.splice(idx, 0, moving as ResolvedItem)
    return next
  }

  if (destBucket === ROOT) {
    return { ...m, rootItems: insertInto(stripRoot), categories: strippedCats }
  }
  return {
    ...m,
    rootItems: stripRoot,
    categories: patchCategory(strippedCats, destBucket, undefined, (c) => ({
      ...c,
      items: insertInto(c.items),
    })),
  }
}
