'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Images, Layers, Folder, FolderPlus, Pencil, Trash2, Tag } from 'lucide-react'
import type { LibraryCollection } from '@/lib/library/store'
import { createCollection, renameCollection, deleteCollection } from './collections-actions'

// The Loom Studio folder rail: All / by Type / by Category (smart folders from the
// `category` field) / Collections (custom folders, DAM library_collections). Navigation is
// URL-driven (Links preserve the search + sort); collection create/rename/delete run the
// janitor-gated server actions, then refresh.

export type LoomFacet = { category: string; count: number }

type Active = { kind: string; category: string; collectionId: string }
type Base = { q: string; sort: string }

function buildHref(base: Base, patch: { kind?: string; category?: string; collection?: string }): string {
  const p = new URLSearchParams()
  if (base.q) p.set('q', base.q)
  if (base.sort && base.sort !== 'new') p.set('sort', base.sort)
  if (patch.kind) p.set('kind', patch.kind)
  if (patch.category) p.set('category', patch.category)
  if (patch.collection) p.set('collection', patch.collection)
  const qs = p.toString()
  return qs ? `/admin/library?${qs}` : '/admin/library'
}

function Row({
  href,
  active,
  icon,
  label,
  count,
  children,
}: {
  href: string
  active: boolean
  icon: React.ReactNode
  label: string
  count?: number
  children?: React.ReactNode
}) {
  return (
    <div className="group/row flex items-center gap-1">
      <Link
        href={href}
        aria-current={active ? 'true' : undefined}
        className={`flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2.5 py-1.5 text-sm transition-colors ${
          active ? 'bg-primary-bg font-semibold text-primary-strong' : 'text-muted hover:bg-surface-elevated'
        }`}
      >
        <span className="shrink-0 text-subtle">{icon}</span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {count !== undefined && <span className="shrink-0 text-xs text-subtle">{count}</span>}
      </Link>
      {children}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1 mt-4 px-2.5 text-2xs font-semibold uppercase tracking-wide text-subtle first:mt-0">{children}</p>
  )
}

export function LoomRail({
  total,
  byKind,
  categories,
  collections,
  active,
  base,
}: {
  total: number
  byKind: Record<string, number>
  categories: LoomFacet[]
  collections: LibraryCollection[]
  active: Active
  base: Base
}) {
  const router = useRouter()
  const [pending, start] = useTransition()

  const noFilter = !active.kind && !active.category && !active.collectionId

  function newCollection() {
    const title = window.prompt('New collection name')
    if (!title || !title.trim()) return
    start(async () => {
      const res = await createCollection(title.trim())
      if ('error' in res) window.alert(res.error)
      else router.push(buildHref(base, { collection: res.id }))
    })
  }

  function rename(id: string, current: string) {
    const title = window.prompt('Rename collection', current)
    if (!title || !title.trim() || title.trim() === current) return
    start(async () => {
      const res = await renameCollection(id, title.trim())
      if ('error' in res) window.alert(res.error)
      else router.refresh()
    })
  }

  function remove(id: string, title: string) {
    if (!window.confirm(`Delete the "${title}" collection? The assets stay in the library.`)) return
    start(async () => {
      const res = await deleteCollection(id)
      if ('error' in res) window.alert(res.error)
      else {
        if (active.collectionId === id) router.push('/admin/library')
        else router.refresh()
      }
    })
  }

  const iconBtn =
    'invisible shrink-0 rounded-lg p-1 text-subtle hover:bg-surface-elevated hover:text-text group-hover/row:visible'

  return (
    <aside className={`w-56 shrink-0 ${pending ? 'opacity-60' : ''}`} aria-label="Folders">
      <div className="sticky top-4 space-y-0.5">
        <Row
          href={buildHref(base, {})}
          active={noFilter}
          icon={<Images className="h-4 w-4" />}
          label="All assets"
          count={total}
        />

        <SectionLabel>Type</SectionLabel>
        {Object.entries(byKind)
          .sort((a, b) => b[1] - a[1])
          .map(([k, n]) => (
            <Row
              key={k}
              href={buildHref(base, { kind: k })}
              active={active.kind === k}
              icon={<Layers className="h-4 w-4" />}
              label={k}
              count={n}
            />
          ))}

        {categories.length > 0 && <SectionLabel>Categories</SectionLabel>}
        {categories.map((c) => (
          <Row
            key={c.category}
            href={buildHref(base, { category: c.category })}
            active={active.category === c.category}
            icon={<Tag className="h-4 w-4" />}
            label={c.category}
            count={c.count}
          />
        ))}

        <div className="mb-1 mt-4 flex items-center justify-between px-2.5">
          <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">Collections</p>
          <button
            type="button"
            onClick={newCollection}
            disabled={pending}
            className="rounded-lg p-1 text-subtle hover:bg-surface-elevated hover:text-text"
            aria-label="New collection"
            title="New collection"
          >
            <FolderPlus className="h-4 w-4" />
          </button>
        </div>
        {collections.length === 0 ? (
          <p className="px-2.5 py-1 text-xs text-subtle">No collections yet.</p>
        ) : (
          collections.map((c) => (
            <Row
              key={c.id}
              href={buildHref(base, { collection: c.id })}
              active={active.collectionId === c.id}
              icon={<Folder className="h-4 w-4" />}
              label={c.title}
              count={c.count}
            >
              <button
                type="button"
                onClick={() => rename(c.id, c.title)}
                disabled={pending}
                className={iconBtn}
                aria-label={`Rename ${c.title}`}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => remove(c.id, c.title)}
                disabled={pending}
                className={iconBtn}
                aria-label={`Delete ${c.title}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </Row>
          ))
        )}
      </div>
    </aside>
  )
}
