'use client'

import { useState, useEffect, useTransition, useRef, useCallback } from 'react'
import Image from 'next/image'
import { Share2, Check, Clock, Building2 } from 'lucide-react'
import {
  loadEventShares,
  requestEventShare,
  revokeEventShare,
  approveEventShare,
  declineEventShare,
} from '@/app/(main)/events/share-actions'
import { isError } from '@/lib/action-result'
import { labelClasses } from '@/components/ui/field'
import { getInitials } from '@/lib/utils'
import type { EventShareView } from '@/lib/events/event-share'

type ScopeHit = { id: string; name: string; slug: string; image_url: string | null }

// "Share with another space" — the host invites a Space to co-host the event (Events EC3). Picking a
// Space REQUESTS a share; a steward there approves before it appears on their calendar (unless the host
// stewards it too, or the spaces already collaborate, in which case it's accepted immediately). A Space
// that asked to FEATURE this event shows here as a request the host approves. Mirrors the placement
// field: results render IN FLOW (the module's @container wrapper clips a `top-full` overlay).

export function EventShareField({ eventId, slug }: { eventId: string; slug: string }) {
  const [shares, setShares] = useState<EventShareView[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const reload = useCallback(() => {
    loadEventShares(eventId)
      .then(setShares)
      .catch(() => setShares([]))
  }, [eventId])

  useEffect(() => {
    let active = true
    loadEventShares(eventId)
      .then((v) => {
        if (active) setShares(v)
      })
      .catch(() => {
        if (active) setShares([])
      })
    return () => {
      active = false
    }
  }, [eventId])

  function share(spaceId: string) {
    setError(null)
    startTransition(async () => {
      const res = await requestEventShare(eventId, slug, spaceId)
      if (isError(res)) {
        setError(res.error)
        return
      }
      reload()
    })
  }

  function run(action: Promise<{ error: string } | { data: unknown }>) {
    setError(null)
    startTransition(async () => {
      const res = await action
      if (isError(res)) {
        setError(res.error)
        return
      }
      reload()
    })
  }

  if (!shares) {
    return <div className="h-24 animate-pulse rounded-xl border border-border bg-surface-elevated/50" />
  }

  return (
    <div className="space-y-2 rounded-xl border border-border bg-surface-elevated/40 p-3">
      <span className={labelClasses}>
        Share with another space{' '}
        <span className="font-normal text-subtle">(co-host it on their calendar too)</span>
      </span>

      {shares.length > 0 && (
        <ul className="space-y-1.5">
          {shares.map((s) => (
            <li key={s.id} className="flex items-center gap-2.5 rounded-lg bg-surface px-3 py-2">
              <Building2 className="h-4 w-4 shrink-0 text-subtle" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text">{s.space.name}</p>
                <p className="flex items-center gap-1 text-xs text-subtle">
                  {s.status === 'accepted' ? (
                    <>
                      <Check className="h-3 w-3 text-success" /> Co-hosting
                    </>
                  ) : s.awaitingHostApproval ? (
                    <>
                      <Clock className="h-3 w-3" /> Asked to feature this event
                    </>
                  ) : (
                    <>
                      <Clock className="h-3 w-3" /> Pending their approval
                    </>
                  )}
                </p>
              </div>
              {s.status === 'pending' && s.awaitingHostApproval ? (
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => run(declineEventShare(s.id))}
                    disabled={pending}
                    className="rounded-lg px-2 py-1 text-xs font-medium text-subtle transition-colors hover:text-text disabled:opacity-40"
                  >
                    Decline
                  </button>
                  <button
                    type="button"
                    onClick={() => run(approveEventShare(s.id))}
                    disabled={pending}
                    className="rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
                  >
                    Add
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    // Confirm only the destructive case: stopping a live co-host removes the
                    // event from their calendar. Cancelling your own pending request is low stakes.
                    if (
                      s.status === 'accepted' &&
                      !window.confirm(`Stop ${s.space.name} from co-hosting this event? It leaves their calendar.`)
                    )
                      return
                    run(revokeEventShare(s.id))
                  }}
                  disabled={pending}
                  aria-label={s.status === 'accepted' ? 'Stop co-hosting' : 'Cancel request'}
                  className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-subtle transition-colors hover:text-danger disabled:opacity-40"
                >
                  {s.status === 'accepted' ? 'Remove' : 'Cancel'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-subtle">
        Search for a Space to co-host with. A steward there approves before your event shows on their
        calendar.
      </p>
      <SpaceSearch pending={pending} onPick={share} />

      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
}

function SpaceSearch({ pending, onPick }: { pending: boolean; onPick: (spaceId: string) => void }) {
  const [query, setQuery] = useState('')
  const [spaces, setSpaces] = useState<ScopeHit[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      if (q.trim().length < 2) {
        setSpaces([])
        return
      }
      try {
        const res = await fetch(`/api/search-scopes?q=${encodeURIComponent(q.trim())}`)
        const json = await res.json()
        setSpaces(json.spaces ?? [])
      } catch {
        setSpaces([])
      }
    }, 150)
  }, [])

  return (
    <div>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5">
        <Share2 className="h-4 w-4 shrink-0 text-subtle" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            search(e.target.value)
          }}
          placeholder="Search Spaces by name"
          disabled={pending}
          className="min-w-0 flex-1 bg-transparent text-sm text-text placeholder:text-subtle outline-none disabled:opacity-60"
        />
      </div>

      {/* Results render IN FLOW (not an absolute overlay) — the module's @container wrapper clips a
          `top-full` dropdown (same pattern as the placement field). */}
      {spaces.length > 0 && (
        <div className="mt-1 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-xl shadow-black/5">
          {spaces.map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => onPick(h.id)}
              disabled={pending}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-surface-elevated disabled:opacity-40"
            >
              {h.image_url ? (
                <Image src={h.image_url} alt={h.name} width={24} height={24} className="h-6 w-6 shrink-0 rounded-lg object-cover" />
              ) : (
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary-bg text-3xs font-bold text-primary-strong">
                  {getInitials(h.name)}
                </div>
              )}
              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-text">{h.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
