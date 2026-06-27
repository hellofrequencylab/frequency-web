'use client'

import { useState, useTransition, useRef, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { X, UserPlus } from 'lucide-react'
import { addCohost, removeCohost } from '@/app/(main)/events/[slug]/social-actions'
import { isError } from '@/lib/action-result'
import { getInitials } from '@/lib/utils'

export type CohostView = {
  id: string
  profileId: string
  displayName: string
  handle: string
  avatarUrl: string | null
}

type HandleHit = { id: string; handle: string; display_name: string; avatar_url: string | null }

export function CohostManager({
  eventId,
  slug,
  cohosts,
  canManage,
}: {
  eventId: string
  slug: string
  cohosts: CohostView[]
  /** Viewer is the event host — shows the add/remove controls. */
  canManage: boolean
}) {
  // Hide the section entirely when there's nothing to show and nothing to do.
  if (!canManage && cohosts.length === 0) return null

  return (
    <section>
      <h2 className="text-sm font-bold text-text mb-3">
        Cohosts
        {cohosts.length > 0 && (
          <span className="ml-2 text-xs font-normal text-subtle">{cohosts.length}</span>
        )}
      </h2>

      {cohosts.length === 0 ? (
        <p className="text-sm text-subtle">No cohosts yet.</p>
      ) : (
        <ul className="space-y-0.5">
          {cohosts.map((c) => (
            <li key={c.id} className="flex items-center gap-3 rounded-lg px-3 py-2 -mx-3 hover:bg-surface transition-colors">
              {c.avatarUrl ? (
                <Image src={c.avatarUrl} alt={c.displayName} width={28} height={28} className="h-7 w-7 shrink-0 rounded-full object-cover" />
              ) : (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-bg text-2xs font-bold text-primary-strong select-none">
                  {getInitials(c.displayName)}
                </div>
              )}
              <Link href={`/people/${c.handle}`} className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text">{c.displayName}</p>
                <p className="truncate text-xs text-subtle">@{c.handle}</p>
              </Link>
              {canManage && (
                <RemoveCohostButton eventId={eventId} slug={slug} cohostProfileId={c.profileId} />
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && <AddCohost eventId={eventId} slug={slug} />}
    </section>
  )
}

function RemoveCohostButton({
  eventId,
  slug,
  cohostProfileId,
}: {
  eventId: string
  slug: string
  cohostProfileId: string
}) {
  const [pending, startTransition] = useTransition()
  return (
    <button
      type="button"
      onClick={() => startTransition(() => removeCohost(eventId, slug, cohostProfileId))}
      disabled={pending}
      aria-label="Remove cohost"
      className="shrink-0 rounded-lg p-1.5 text-subtle transition-colors hover:text-danger disabled:opacity-40"
    >
      <X className="h-4 w-4" />
    </button>
  )
}

function AddCohost({ eventId, slug }: { eventId: string; slug: string }) {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<HandleHit[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      if (!q.trim()) {
        setHits([])
        return
      }
      try {
        const res = await fetch(`/api/search-handles?q=${encodeURIComponent(q.trim())}`)
        const json = await res.json()
        setHits(json.profiles ?? [])
      } catch {
        setHits([])
      }
    }, 150)
  }, [])

  function add(handle: string) {
    setError(null)
    startTransition(async () => {
      const res = await addCohost(eventId, slug, handle)
      if (isError(res)) {
        setError(res.error)
        return
      }
      setQuery('')
      setHits([])
    })
  }

  return (
    <div className="mt-3">
      {/* No stroke around the add-cohost input (owner ask): the inner <input> carries no
          border either, so this reads as a quiet inline field, not a boxed control. */}
      <div className="flex items-center gap-2 rounded-lg px-3 py-1.5">
        <UserPlus className="h-4 w-4 shrink-0 text-subtle" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            const v = e.target.value
            setQuery(v)
            search(v)
          }}
          placeholder="Add a cohost by name or @handle"
          disabled={pending}
          className="min-w-0 flex-1 bg-transparent text-sm text-text placeholder:text-subtle outline-none disabled:opacity-60"
        />
      </div>

      {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}

      {/* Results render in NORMAL FLOW (not an absolute overlay). The cohosts module lands
          in a page-module slot whose `@container` wrapper sets container-type (Tailwind v4),
          which establishes paint containment and CLIPS an absolutely-positioned `top-full`
          dropdown — the real reason the matches never showed. An in-flow list pushes the
          content below it down and is never clipped. */}
      {hits.length > 0 && (
        <div className="mt-1 w-full max-w-sm rounded-xl border border-border bg-surface py-1 shadow-xl shadow-black/5">
          {hits.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => add(p.handle)}
              disabled={pending}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-surface-elevated disabled:opacity-40"
            >
              {p.avatar_url ? (
                <Image src={p.avatar_url} alt={p.display_name} width={24} height={24} className="h-6 w-6 shrink-0 rounded-full object-cover" />
              ) : (
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-bg text-3xs font-bold text-primary-strong">
                  {getInitials(p.display_name)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-text">{p.display_name}</p>
                <p className="truncate text-2xs text-subtle">@{p.handle}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
