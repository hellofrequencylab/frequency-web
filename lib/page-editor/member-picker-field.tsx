'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Search, X, UserPlus, GripVertical } from 'lucide-react'
import { searchNetworkMembers, resolveNetworkMembers, type MemberPick } from './member-search-action'
import { useSpaceEditorSlug } from './space-editor-context'
import { getInitials } from '@/lib/utils'

// The Team block's NETWORK MEMBER PICKER — a Puck custom field that lets a space operator pick real
// Frequency members from the directory (search by name or handle) instead of typing names by hand.
// The field stores an ORDERED list of chosen member ids; every team card then LINKS to that member's
// profile at `/people/<handle>`. It mirrors the Loom image field pattern (loom-image-field.tsx): a
// 'use client' control wrapping 'use server' actions, reading the active space slug from the
// SpaceEditor context, so it renders in BOTH the desktop <Puck> panel and the mobile FieldForm.
//
// Build-trap safe: 'use client' + server-action imports only, so nothing server-only reaches the
// editor bundle and the public profile ships no editor runtime. The slug is UNTRUSTED UX plumbing;
// every action re-resolves the space + re-gates edit permission server-side.

type MemberValue = { ids?: string[] }

function MemberPickerField({
  value,
  onChange,
}: {
  value?: MemberValue
  onChange: (value: MemberValue) => void
}) {
  const slug = useSpaceEditorSlug()
  const ids = value?.ids ?? []

  const [q, setQ] = useState('')
  const [results, setResults] = useState<MemberPick[]>([])
  const [chosen, setChosen] = useState<MemberPick[]>([])
  const [searching, startSearch] = useTransition()
  const dragIndex = useRef<number | null>(null)

  // Resolve the stored ids to live member cards (name / handle / avatar) whenever the id list changes,
  // so the panel shows who is selected even after a reload. Order follows the stored ids. The reset for
  // the empty case runs inside the async resolver (which returns [] for empty ids), so no setState fires
  // synchronously in the effect body.
  useEffect(() => {
    let alive = true
    ;(async () => {
      const rows = !slug || ids.length === 0 ? [] : await resolveNetworkMembers(slug, ids)
      if (alive) setChosen(rows)
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key on the id list identity, not the array ref
  }, [slug, ids.join(',')])

  // Debounced directory search. Needs the space slug; degrades to empty results outside an editor. The
  // empty-query reset runs inside the debounced callback, so no setState fires synchronously here.
  useEffect(() => {
    const handle = setTimeout(() => {
      if (!slug || q.trim().length < 2) {
        setResults([])
        return
      }
      startSearch(async () => {
        const rows = await searchNetworkMembers(slug, q)
        setResults(rows)
      })
    }, 200)
    return () => clearTimeout(handle)
  }, [q, slug])

  function add(id: string) {
    if (ids.includes(id)) return
    onChange({ ids: [...ids, id] })
    setQ('')
    setResults([])
  }

  function remove(id: string) {
    onChange({ ids: ids.filter((x) => x !== id) })
  }

  function reorder(from: number, to: number) {
    if (from === to) return
    const next = [...ids]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    onChange({ ids: next })
  }

  const chosenIds = new Set(ids)

  return (
    <div className="space-y-2">
      {chosen.length > 0 && (
        <ul className="space-y-1.5">
          {chosen.map((m, i) => (
            <li
              key={m.id}
              draggable
              onDragStart={() => (dragIndex.current = i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIndex.current !== null) reorder(dragIndex.current, i)
                dragIndex.current = null
              }}
              className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2 py-1.5"
            >
              <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-subtle" aria-hidden />
              <Avatar member={m} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-text">{m.displayName}</span>
                <span className="block truncate text-2xs text-subtle">@{m.handle}</span>
              </span>
              <button
                type="button"
                onClick={() => remove(m.id)}
                aria-label={`Remove ${m.displayName}`}
                className="shrink-0 rounded-md p-1 text-subtle transition-colors hover:text-danger"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2">
        <Search className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={slug ? 'Search members by name or @handle' : 'Open this from your space editor'}
          disabled={!slug}
          className="w-full bg-transparent py-1.5 text-sm outline-none disabled:opacity-60"
        />
      </div>

      {slug && q.trim().length >= 2 && (
        <div className="rounded-xl border border-border bg-surface p-1">
          {searching ? (
            <p className="px-2 py-4 text-center text-xs text-subtle">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-subtle">No members match that search.</p>
          ) : (
            <ul className="max-h-56 overflow-y-auto">
              {results.map((m) => {
                const already = chosenIds.has(m.id)
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => add(m.id)}
                      disabled={already}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-elevated disabled:opacity-50"
                    >
                      <Avatar member={m} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-text">{m.displayName}</span>
                        <span className="block truncate text-2xs text-subtle">@{m.handle}</span>
                      </span>
                      {already ? (
                        <span className="shrink-0 text-2xs text-subtle">Added</span>
                      ) : (
                        <UserPlus className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {!slug && (
        <p className="text-2xs text-subtle">Open this from your space editor to add members from the network.</p>
      )}
    </div>
  )
}

function Avatar({ member }: { member: MemberPick }) {
  if (member.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- directory avatar preview in the editor, not a build-time asset
      <img src={member.avatarUrl} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
    )
  }
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-2xs font-bold text-subtle">
      {getInitials(member.displayName)}
    </span>
  )
}

/** The Puck custom field: a network member picker storing an ordered list of member ids. */
export const memberPickerField = {
  type: 'custom' as const,
  label: 'Members',
  render: ({ value, onChange }: { value?: MemberValue; onChange: (v: MemberValue) => void }) => (
    <MemberPickerField value={value} onChange={onChange} />
  ),
}
