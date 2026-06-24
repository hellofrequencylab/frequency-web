'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { FolderPlus, Plus, Trash2 } from 'lucide-react'
import type { ResolvedItem, ResolvedMenu } from '@/lib/menus/types'
import {
  ensureMenu,
  materializeMenu,
  createCategory,
  updateCategory,
  deleteCategory,
  createItem,
  reorderItems,
  moveItem as moveItemToSurface,
  moveCategory as moveCategoryToSurface,
} from '@/lib/menus/actions'
import { AdminSection } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { ItemEditor, GridControls } from './item-editor'
import { GateControls, type GatePatch } from './gate-controls'
import { MenuMoveField } from './menu-move-field'
import { isGridSurface } from './known-routes'
import type { MenuSurfaceKey } from '@/lib/menus/types'
import { isPinnedRailItem, PINNED_PROFILE_ID } from '@/lib/menus/defaults'

// The Menu groups + links editor — the `menu-groups` template block, and the BULK of the
// navigation editor. Holds the working ResolvedMenu in local state and drives the category/item
// CRUD against lib/menus/actions: add/edit/delete groups & sub-groups (3), per-item depth — subheading,
// placement, modes, the per-role matrix (4, 8, 9, 11), drag/drop links within and across groups (7).
//
// COUPLING — materialize-on-default lives HERE, and ONLY here. A surface that has never been
// customized (or whose row is empty) is served from the code defaults with synthetic ids; per-item
// edits need REAL DB rows. So on open this block materializes the defaults ONCE and adopts the real
// menu. The sibling surface-scoped blocks (menu-layout, menu-rail-cards) must NOT each fire their
// own materialize — three blocks racing seedMenuFromDefaults would clobber each other — so they
// only read getAdminMenu and `ensureMenu` lazily on their own first write. This block is the single
// primary editor that owns the one auto-materialize, preserving the empty-row→default fallback.
//
// ROOT is the synthetic bucket for items with no category (menu-level links).
const ROOT = '__root__'

type DragRef = { itemId: string; from: string } | null

export function MenuGroupsEditor({
  initialMenu,
  surfaceKey,
}: {
  initialMenu: ResolvedMenu
  surfaceKey: ResolvedMenu['surfaceKey']
}) {
  const [menu, setMenu] = useState<ResolvedMenu>(initialMenu)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string>('')
  const [isPending, startTransition] = useTransition()
  const dragRef = useRef<DragRef>(null)
  const [dragId, setDragId] = useState<string | null>(null)

  function onStatus(msg: string) {
    setStatus(msg)
  }

  // Grid surfaces (mega-menus) show the column / row / span placement controls; linear
  // surfaces (left rail, marketing footer) hide them (point 4).
  const isGrid = isGridSurface(surfaceKey)

  // The left rail pins Profile right after Feed (point 1b): a fixed, runtime-injected row
  // that is never persisted and can't be dragged or deleted. Render it as a separate lead
  // row in the root bucket, and strip any copy out of the draggable root list (the code
  // default carries it; a seeded menu does not — so handle both).
  const pinnedLead =
    surfaceKey === 'left'
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

  // The menu can be the code DEFAULT (synthetic ids): a surface never customized, or one whose
  // DB row is empty so the reader falls back to defaults. Per-item edits need REAL rows, so on
  // open we materialize the defaults into the DB once and adopt the real menu. This is what makes
  // a never-touched surface (e.g. the left rail) actually manageable instead of a dead default.
  // This is the SINGLE place materialize runs (see the COUPLING note above).
  const materializedRef = useRef(false)
  useEffect(() => {
    if (!menu.isDefault || materializedRef.current) return
    materializedRef.current = true
    setError(null)
    onStatus('Loading the current menu…')
    startTransition(async () => {
      const res = await materializeMenu(surfaceKey)
      if (res.ok) {
        setMenu(res.menu)
        onStatus('Loaded. Edit anything below.')
      } else {
        materializedRef.current = false
        setError(res.error)
        onStatus('Could not load this menu')
      }
    })
    // Runs once per surface mount (the block is keyed by surface, so a re-scope remounts it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surfaceKey])

  // ── Flatten the nested category tree to a render list (depth for indentation) ──
  const flatCategories = useMemo(() => flatten(menu.categories), [menu.categories])

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

  // Save a category's two-axis access gate (ADR-390). Optimistic, mirrors saveCategoryGrid.
  function saveCategoryGate(catId: string, patch: GatePatch) {
    setError(null)
    onStatus('Saving group access')
    setMenu((m) => ({
      ...m,
      categories: patchCategory(m.categories, catId, {
        ...(patch.minAccess != null ? { minAccess: patch.minAccess } : {}),
        ...('staffDomain' in patch ? { staffDomain: patch.staffDomain ?? undefined } : {}),
        ...('staffLevel' in patch ? { staffLevel: patch.staffLevel ?? undefined } : {}),
      }),
    }))
    startTransition(async () => {
      const res = await updateCategory(catId, patch)
      if (res.ok) onStatus('Group access saved')
      else {
        setError(res.error)
        onStatus('Could not save group access')
      }
    })
  }

  // Move a LINK to another container (ADR-390). Optimistically drop it from this surface
  // (it reappears at the top of the destination), then run the server action.
  function moveItemTo(itemId: string, dest: MenuSurfaceKey) {
    setError(null)
    onStatus('Moving link')
    setMenu((m) => ({
      ...m,
      rootItems: m.rootItems.filter((i) => i.id !== itemId),
      categories: removeItemFrom(m.categories, itemId),
    }))
    startTransition(async () => {
      const res = await moveItemToSurface(itemId, dest)
      onStatus(res.ok ? 'Link moved' : 'Could not move link')
      if (!res.ok) setError(res.error)
    })
  }

  // Move a GROUP (and its subtree) to another container. Optimistically remove it here.
  function moveCategoryTo(catId: string, dest: MenuSurfaceKey) {
    setError(null)
    onStatus('Moving group')
    setMenu((m) => ({ ...m, categories: removeCategoryFrom(m.categories, catId) }))
    startTransition(async () => {
      const res = await moveCategoryToSurface(catId, dest)
      onStatus(res.ok ? 'Group moved' : 'Could not move group')
      if (!res.ok) setError(res.error)
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

  return (
    <AdminSection
      title="Groups & links"
      description="Add groups and sub-groups, edit each group heading, then drag links to reorder within a group or move them across groups. Open a link to edit its subheading, placement, modes, and per-role visibility."
      actions={
        <div className="flex items-center gap-2">
          {status && (
            <span className="text-xs text-subtle" aria-hidden>
              {status}
            </span>
          )}
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
      {/* Live status line — announced for assistive tech, visible via the section action above. */}
      <p aria-live="polite" className="sr-only">
        {status}
      </p>

      {error && (
        <p className="mb-3 rounded-lg border border-danger/30 bg-danger-bg/40 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {menu.isDefault && (
        <div className="mb-4 rounded-2xl border border-dashed border-border bg-surface/50 p-4 text-sm text-muted">
          This surface has no saved menu yet, so it is showing the site defaults. Editing
          anything, or seeding, creates an editable copy in the database.
        </div>
      )}

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
        surfaceKey={surfaceKey}
        onMoveItem={moveItemTo}
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
                onSaveGate={(p) => saveCategoryGate(cat.id, p)}
                surfaceKey={surfaceKey}
                onMove={(dest) => moveCategoryTo(cat.id, dest)}
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
                surfaceKey={surfaceKey}
                onMoveItem={moveItemTo}
              />
            </li>
          ))}
        </ul>
      )}
    </AdminSection>
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
  surfaceKey,
  onMoveItem,
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
  /** Current surface + cross-container move handler (ADR-390), threaded to each ItemEditor. */
  surfaceKey: MenuSurfaceKey
  onMoveItem: (itemId: string, dest: MenuSurfaceKey) => void
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
            surfaceKey={surfaceKey}
            onMove={(dest) => onMoveItem(item.id, dest)}
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
  onSaveGate,
  surfaceKey,
  onMove,
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
  /** Save the section's two-axis access gate (ADR-390). */
  onSaveGate: (patch: GatePatch) => void
  /** Current surface + cross-container move handler (ADR-390). */
  surfaceKey: MenuSurfaceKey
  onMove: (dest: MenuSurfaceKey) => void
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
      {/* Section access gate (ADR-390): floor + optional staff domain for the whole group. */}
      <div>
        <p className="mb-1.5 text-xs font-semibold text-subtle">Who can see this group</p>
        <GateControls
          minAccess={cat.minAccess}
          staffDomain={cat.staffDomain}
          staffLevel={cat.staffLevel}
          disabled={isPending}
          onSave={onSaveGate}
        />
      </div>

      {/* Move this whole group (and its links) to another container (ADR-390). */}
      <div className="border-t border-border pt-3">
        <MenuMoveField current={surfaceKey} onMove={onMove} disabled={isPending} label="Move group to" />
      </div>
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

// Strip a single item from anywhere in the category tree (used by the cross-container move).
function removeItemFrom(cats: ResolvedCategoryLite[], itemId: string): ResolvedCategoryLite[] {
  return cats.map((c) => ({
    ...c,
    items: c.items.filter((i) => i.id !== itemId),
    children: removeItemFrom(c.children, itemId),
  }))
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
