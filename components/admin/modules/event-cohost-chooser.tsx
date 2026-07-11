'use client'

import { useCallback, useRef, useState, useTransition } from 'react'
import Image from 'next/image'
import { UserPlus, Check } from 'lucide-react'
import { inviteCohost } from '@/app/(main)/events/[slug]/social-actions'
import { isError } from '@/lib/action-result'
import { labelClasses } from '@/components/ui/field'
import { getInitials } from '@/lib/utils'

type HandleHit = { id: string; handle: string; display_name: string; avatar_url: string | null }

// The Event Admin cohost chooser — invite a co-host straight from the editor rail. Reuses the same
// handle-search + inviteCohost path as the public CohostManager's Add control (the /api/search-handles
// typeahead → the invite server action), so an invite from here is identical to one sent from the
// event page. Results render IN FLOW (not an absolute dropdown): the admin rail's `@container`
// wrapper sets container-type, which clips a `top-full` overlay (see cohost-manager / placement).
//
// This is invite-only by design: the accepted/pending cohost list and removal already live on the
// public event page's Cohosts box. Here the host just needs a fast "add someone" from the editor.
export function EventCohostChooser({ eventId, slug }: { eventId: string; slug: string }) {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<HandleHit[]>([])
  const [error, setError] = useState<string | null>(null)
  const [invited, setInvited] = useState<string | null>(null)
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

  function invite(handle: string) {
    setError(null)
    startTransition(async () => {
      const res = await inviteCohost(eventId, slug, handle)
      if (isError(res)) {
        setError(res.error)
        return
      }
      setInvited(handle)
      setQuery('')
      setHits([])
    })
  }

  return (
    <div className="space-y-2 rounded-xl border border-border bg-surface-elevated/40 p-3">
      <span className={labelClasses}>
        Cohosts <span className="font-normal text-subtle">(invite someone to help host)</span>
      </span>

      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5">
        <UserPlus className="h-4 w-4 shrink-0 text-subtle" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            const v = e.target.value
            setQuery(v)
            setInvited(null)
            search(v)
          }}
          placeholder="Invite a cohost by name or @handle"
          disabled={pending}
          className="min-w-0 flex-1 bg-transparent text-sm text-text placeholder:text-subtle outline-none disabled:opacity-60"
        />
      </div>

      {invited && (
        <p className="flex items-center gap-1.5 text-xs text-success">
          <Check className="h-3.5 w-3.5" /> Invite sent to @{invited}.
        </p>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}

      {/* In-flow results — never an absolute overlay (the rail's @container clips a top-full list). */}
      {hits.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-xl shadow-black/5">
          {hits.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => invite(p.handle)}
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
