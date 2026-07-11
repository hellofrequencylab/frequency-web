'use client'

import { useState, useEffect, useTransition, useRef, useCallback } from 'react'
import Image from 'next/image'
import { MapPin, Check, Clock, Building2, Users, Crown, X } from 'lucide-react'
import {
  loadEventPlacement,
  requestEventPlacement,
  clearEventPlacement,
} from '@/app/(main)/events/placement-actions'
import { transferEventHost } from '@/app/(main)/events/[slug]/social-actions'
import { isError } from '@/lib/action-result'
import { labelClasses } from '@/components/ui/field'
import { getInitials } from '@/lib/utils'
import type { PlacementView, PlacementTargetType } from '@/lib/events/placement'

type HandleHit = { id: string; handle: string; display_name: string; avatar_url: string | null }

type ScopeHit = { id: string; name: string; slug: string; image_url: string | null }

// "Where does this event live" — the host searches Spaces + Circles and asks to place the event
// under one. Picking a result REQUESTS placement; a steward of that target approves before it goes
// live (unless the host stewards it too, in which case it's placed immediately). Mirrors the cohost
// search pattern: results render IN FLOW (not an absolute dropdown), because the module's
// `@container` wrapper clips a `top-full` overlay.

export function EventPlacementField({ eventId, slug }: { eventId: string; slug: string }) {
  const [view, setView] = useState<PlacementView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    let active = true
    loadEventPlacement(eventId)
      .then((v) => {
        if (active) setView(v)
      })
      .catch(() => {
        if (active) setView({ status: 'none', target: null, requestId: null })
      })
    return () => {
      active = false
    }
  }, [eventId])

  function pick(type: PlacementTargetType, id: string) {
    setError(null)
    startTransition(async () => {
      const res = await requestEventPlacement(eventId, slug, { type, id })
      if (isError(res)) {
        setError(res.error)
        return
      }
      setView(res.data)
    })
  }

  function clear() {
    setError(null)
    startTransition(async () => {
      const res = await clearEventPlacement(eventId, slug)
      if (isError(res)) {
        setError(res.error)
        return
      }
      setView(res.data)
    })
  }

  if (!view) {
    return <div className="h-24 animate-pulse rounded-xl border border-border bg-surface-elevated/50" />
  }

  return (
    <div className="space-y-2 rounded-xl border border-border bg-surface-elevated/40 p-3">
      <span className={labelClasses}>
        Where does this event live{' '}
        <span className="font-normal text-subtle">(a Space or Circle can host it)</span>
      </span>

      {view.status === 'live' && view.target ? (
        <CurrentPlacement view={view} pending={pending} onClear={clear} />
      ) : view.status === 'pending' && view.target ? (
        <CurrentPlacement view={view} pending={pending} onClear={clear} />
      ) : (
        <>
          <p className="text-xs text-subtle">
            Search for a Space or Circle. The steward there approves before your event shows up under it.
          </p>
          <ScopeSearch pending={pending} onPick={pick} />
        </>
      )}

      {error && <p className="text-xs text-danger">{error}</p>}

      {/* Transfer host — hand the event to another member. Kept in this box because "where the event
          lives" and "who owns it" are the same stewardship decision. Reuses the transferEventHost
          action; the outgoing host stays on as a cohost. */}
      <div className="border-t border-border pt-2">
        <TransferHostControl eventId={eventId} slug={slug} />
      </div>
    </div>
  )
}

// Hand the event to another member. The current host picks the new host, confirms, and stays on as
// a cohost (the server action keeps them on so nobody loses access). Results render IN FLOW (not an
// absolute dropdown) for the same reason ScopeSearch does — the module's `@container` wrapper clips
// a `top-full` overlay.
function TransferHostControl({ eventId, slug }: { eventId: string; slug: string }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<HandleHit[]>([])
  const [choice, setChoice] = useState<HandleHit | null>(null)
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

  function confirm() {
    if (!choice) return
    setError(null)
    startTransition(async () => {
      const res = await transferEventHost(eventId, slug, choice.handle)
      if (isError(res)) {
        setError(res.error)
        return
      }
      setOpen(false)
      setChoice(null)
      setQuery('')
      setHits([])
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-subtle transition-colors hover:text-text"
      >
        <Crown className="h-3.5 w-3.5" /> Transfer host role
      </button>
    )
  }

  return (
    <div className="rounded-lg bg-surface p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-text">Transfer host role</p>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setChoice(null)
            setError(null)
          }}
          aria-label="Cancel transfer"
          className="text-subtle transition-colors hover:text-text"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {choice ? (
        <div className="mt-2">
          <p className="text-xs text-muted">
            Make <span className="font-semibold text-text">@{choice.handle}</span> the host? You will
            stay on as a cohost.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={confirm}
              disabled={pending}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
            >
              {pending ? 'Transferring…' : 'Confirm transfer'}
            </button>
            <button
              type="button"
              onClick={() => setChoice(null)}
              disabled={pending}
              className="rounded-lg px-2 py-1.5 text-xs font-medium text-muted transition-colors hover:text-text disabled:opacity-40"
            >
              Back
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2">
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              search(e.target.value)
            }}
            placeholder="New host by name or @handle"
            disabled={pending}
            className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text placeholder:text-subtle outline-none focus:border-border-strong disabled:opacity-60"
          />
          {hits.length > 0 && (
            <div className="mt-1 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-xl shadow-black/5">
              {hits.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setChoice(p)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-surface-elevated"
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
      )}

      {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
    </div>
  )
}

function CurrentPlacement({
  view,
  pending,
  onClear,
}: {
  view: PlacementView
  pending: boolean
  onClear: () => void
}) {
  const target = view.target!
  const live = view.status === 'live'
  const TargetIcon = target.type === 'space' ? Building2 : Users
  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-surface px-3 py-2">
      <TargetIcon className="h-4 w-4 shrink-0 text-subtle" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text">{target.name}</p>
        <p className="flex items-center gap-1 text-xs text-subtle">
          {live ? (
            <>
              <Check className="h-3 w-3 text-success" /> Lives here
            </>
          ) : (
            <>
              <Clock className="h-3 w-3" /> Pending approval
            </>
          )}
        </p>
      </div>
      <button
        type="button"
        onClick={onClear}
        disabled={pending}
        aria-label={live ? 'Remove from this Space or Circle' : 'Cancel request'}
        className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-subtle transition-colors hover:text-danger disabled:opacity-40"
      >
        {live ? 'Remove' : 'Cancel'}
      </button>
    </div>
  )
}

function ScopeSearch({
  pending,
  onPick,
}: {
  pending: boolean
  onPick: (type: PlacementTargetType, id: string) => void
}) {
  const [query, setQuery] = useState('')
  const [spaces, setSpaces] = useState<ScopeHit[]>([])
  const [circles, setCircles] = useState<ScopeHit[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      if (q.trim().length < 2) {
        setSpaces([])
        setCircles([])
        return
      }
      try {
        const res = await fetch(`/api/search-scopes?q=${encodeURIComponent(q.trim())}`)
        const json = await res.json()
        setSpaces(json.spaces ?? [])
        setCircles(json.circles ?? [])
      } catch {
        setSpaces([])
        setCircles([])
      }
    }, 150)
  }, [])

  const hasResults = spaces.length > 0 || circles.length > 0

  return (
    <div>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5">
        <MapPin className="h-4 w-4 shrink-0 text-subtle" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            search(e.target.value)
          }}
          placeholder="Search Spaces and Circles by name"
          disabled={pending}
          className="min-w-0 flex-1 bg-transparent text-sm text-text placeholder:text-subtle outline-none disabled:opacity-60"
        />
      </div>

      {/* Results render IN FLOW (not an absolute overlay) — the module's @container wrapper clips a
          `top-full` dropdown, so an in-flow list is the reliable pattern (see cohost-manager). */}
      {hasResults && (
        <div className="mt-1 overflow-hidden rounded-xl border border-border bg-surface shadow-xl shadow-black/5">
          {spaces.length > 0 && <ResultGroup label="Spaces" type="space" hits={spaces} pending={pending} onPick={onPick} />}
          {circles.length > 0 && <ResultGroup label="Circles" type="circle" hits={circles} pending={pending} onPick={onPick} />}
        </div>
      )}
    </div>
  )
}

function ResultGroup({
  label,
  type,
  hits,
  pending,
  onPick,
}: {
  label: string
  type: PlacementTargetType
  hits: ScopeHit[]
  pending: boolean
  onPick: (type: PlacementTargetType, id: string) => void
}) {
  return (
    <div className="py-1">
      <p className="px-3 py-1 text-2xs font-semibold uppercase tracking-wide text-subtle">{label}</p>
      {hits.map((h) => (
        <button
          key={h.id}
          type="button"
          onClick={() => onPick(type, h.id)}
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
  )
}
