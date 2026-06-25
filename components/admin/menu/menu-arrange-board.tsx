'use client'

import { useEffect, useMemo, useRef, useState, useTransition, type DragEvent } from 'react'
import Link from 'next/link'
import { EyeOff, GripVertical, Plus, Inbox } from 'lucide-react'
import { syncMenuFromDefaults, reorderCategories, createItem } from '@/lib/menus/actions'
import type { MenuSurfaceKey, ResolvedMenu } from '@/lib/menus/types'

// The visual "Arrange" board for one menu surface (ADR-390 menus). Three jobs:
//   1. Category BOXES you drag to reorder (persisted via reorderCategories).
//   2. A side palette of UNLINKED pages — pages the surface knows about that aren't
//      placed in this menu — that you drag onto a box to add (createItem).
//   3. A badge on any box that contains a HIDDEN page (mode 'hidden').
// Native HTML5 drag-and-drop (no new dep). Loads by materializing the surface on mount
// (syncMenuFromDefaults), exactly like the bulk editor, so the boxes carry real DB ids.

type PalettePage = { label: string; href: string; icon?: string }
type BoxItem = { id: string; label: string; href: string; mode: string }
type Box = { id: string; label: string; items: BoxItem[] }

function toBoxes(menu: ResolvedMenu): Box[] {
  return menu.categories.map((c) => ({
    id: c.id,
    label: c.label || 'Untitled group',
    items: c.items.map((i) => ({ id: i.id, label: i.label, href: i.href, mode: i.mode })),
  }))
}

export function MenuArrangeBoard({
  surfaceKey,
  surfaces,
  allPages,
}: {
  surfaceKey: MenuSurfaceKey
  surfaces: { key: MenuSurfaceKey; label: string }[]
  allPages: PalettePage[]
}) {
  const [menuId, setMenuId] = useState<string | null>(null)
  const [boxes, setBoxes] = useState<Box[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const dragKind = useRef<'category' | 'page' | null>(null)

  // Materialize + sync the surface on mount / surface change, so categories carry real ids
  // and any newly-added code pages are present (mirrors the bulk editor's load).
  useEffect(() => {
    let alive = true
    // The page keys this component by surface, so each surface mounts fresh with
    // loading=true; the effect only writes state asynchronously (no cascading renders).
    syncMenuFromDefaults(surfaceKey)
      .then((res) => {
        if (!alive) return
        if (res.ok) {
          setMenuId(res.menu.id ?? null)
          setBoxes(toBoxes(res.menu))
        } else {
          setError(res.error)
        }
        setLoading(false)
      })
      .catch(() => {
        if (alive) {
          setError('Could not load this menu.')
          setLoading(false)
        }
      })
    return () => {
      alive = false
    }
  }, [surfaceKey])

  const presentHrefs = useMemo(() => new Set(boxes.flatMap((b) => b.items.map((i) => i.href))), [boxes])
  const palette = useMemo(() => allPages.filter((p) => !presentHrefs.has(p.href)), [allPages, presentHrefs])

  function persistOrder(next: Box[]) {
    setBoxes(next)
    startTransition(async () => {
      const res = await reorderCategories(next.map((b, i) => ({ id: b.id, position: i })))
      if (!res.ok) setError(res.error)
    })
  }

  function handleDropOnBox(targetId: string, e: DragEvent) {
    e.preventDefault()
    setOverId(null)
    const data = e.dataTransfer.getData('text/plain')
    if (data.startsWith('cat:')) {
      const id = data.slice(4)
      if (id === targetId) return
      const from = boxes.findIndex((b) => b.id === id)
      const to = boxes.findIndex((b) => b.id === targetId)
      if (from < 0 || to < 0) return
      const next = [...boxes]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      persistOrder(next)
    } else if (data.startsWith('page:')) {
      const href = data.slice(5)
      const page = allPages.find((p) => p.href === href)
      if (!page || !menuId) return
      startTransition(async () => {
        const res = await createItem({
          menuId,
          categoryId: targetId,
          label: page.label,
          href: page.href,
          icon: page.icon ?? null,
          position: 999,
        })
        if (res.ok) {
          setBoxes((bs) =>
            bs.map((b) =>
              b.id === targetId
                ? { ...b, items: [...b.items, { id: res.id, label: page.label, href: page.href, mode: 'active' }] }
                : b,
            ),
          )
        } else {
          setError(res.error)
        }
      })
    }
  }

  return (
    <div>
      {/* Surface picker */}
      <nav className="mb-5 flex flex-wrap gap-2" aria-label="Menu surface">
        {surfaces.map((s) => {
          const on = s.key === surfaceKey
          return (
            <Link
              key={s.key}
              href={`/admin/menu/arrange?surface=${s.key}`}
              aria-current={on ? 'page' : undefined}
              className={
                'rounded-full px-3 py-1.5 text-sm font-medium transition-colors ' +
                (on ? 'bg-primary text-on-primary' : 'border border-border text-muted hover:bg-surface-elevated hover:text-text')
              }
            >
              {s.label}
            </Link>
          )
        })}
      </nav>

      {error && (
        <p className="mb-4 rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-warning">{error}</p>
      )}

      {loading ? (
        <p className="text-sm text-muted">Loading the menu…</p>
      ) : (
        <div className="flex flex-col gap-6 lg:flex-row">
          {/* The board — category boxes, drag to reorder */}
          <div className="flex-1">
            <p className="mb-3 text-sm text-muted">
              Drag a box by its handle to reorder. Drag a page from the right onto a box to add it.
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {boxes.map((box) => {
                const hiddenCount = box.items.filter((i) => i.mode === 'hidden').length
                const isOver = overId === box.id
                return (
                  <div
                    key={box.id}
                    onDragOver={(e) => {
                      e.preventDefault()
                      setOverId(box.id)
                    }}
                    onDragLeave={() => setOverId((cur) => (cur === box.id ? null : cur))}
                    onDrop={(e) => handleDropOnBox(box.id, e)}
                    className={
                      'rounded-2xl border bg-surface p-3 shadow-sm transition-colors ' +
                      (isOver ? 'border-primary ring-2 ring-primary/30' : 'border-border')
                    }
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div
                        draggable
                        onDragStart={(e) => {
                          dragKind.current = 'category'
                          e.dataTransfer.setData('text/plain', `cat:${box.id}`)
                          e.dataTransfer.effectAllowed = 'move'
                        }}
                        onDragEnd={() => {
                          dragKind.current = null
                          setOverId(null)
                        }}
                        className="flex min-w-0 cursor-grab items-center gap-1.5 active:cursor-grabbing"
                        title="Drag to reorder"
                      >
                        <GripVertical className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
                        <span className="truncate text-sm font-semibold text-text">{box.label}</span>
                      </div>
                      {hiddenCount > 0 && (
                        <span
                          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-elevated px-2 py-0.5 text-2xs font-semibold text-warning"
                          title={`${hiddenCount} hidden page${hiddenCount > 1 ? 's' : ''} in this group`}
                        >
                          <EyeOff className="h-3 w-3" aria-hidden />
                          {hiddenCount} hidden
                        </span>
                      )}
                    </div>
                    <ul className="space-y-1">
                      {box.items.length === 0 ? (
                        <li className="rounded-lg border border-dashed border-border px-2 py-2 text-xs text-subtle">
                          Empty group — drop a page here
                        </li>
                      ) : (
                        box.items.map((it) => (
                          <li
                            key={it.id}
                            className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-sm"
                          >
                            <span className={it.mode === 'hidden' ? 'truncate text-subtle line-through' : 'truncate text-text'}>
                              {it.label}
                            </span>
                            {it.mode === 'hidden' && <EyeOff className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />}
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                )
              })}
              {boxes.length === 0 && (
                <p className="text-sm text-muted">This menu has no groups yet.</p>
              )}
            </div>
          </div>

          {/* The palette — unlinked pages */}
          <aside className="w-full shrink-0 lg:w-64">
            <div className="rounded-2xl border border-border bg-surface-elevated p-3">
              <div className="mb-2 flex items-center gap-1.5">
                <Inbox className="h-4 w-4 text-muted" aria-hidden />
                <h3 className="text-sm font-semibold text-text">Unlinked pages</h3>
              </div>
              <p className="mb-3 text-xs text-subtle">Pages not in this menu. Drag one onto a box to add it.</p>
              {palette.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-2 py-3 text-center text-xs text-subtle">
                  Every page is placed. 🎉
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {palette.map((p) => (
                    <li
                      key={p.href}
                      draggable
                      onDragStart={(e) => {
                        dragKind.current = 'page'
                        e.dataTransfer.setData('text/plain', `page:${p.href}`)
                        e.dataTransfer.effectAllowed = 'copy'
                      }}
                      onDragEnd={() => {
                        dragKind.current = null
                        setOverId(null)
                      }}
                      className="flex cursor-grab items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text active:cursor-grabbing hover:border-primary"
                      title={p.href}
                    >
                      <Plus className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
                      <span className="truncate">{p.label}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
