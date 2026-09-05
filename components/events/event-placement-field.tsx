'use client'

import { useState, useEffect, useTransition, useRef, useCallback, useMemo } from 'react'
import { createHandleSearch } from '@/lib/mentions/search-handles-client'
import Image from 'next/image'
import { MapPin, Check, Clock, Building2, Users, Crown, X } from 'lucide-react'
import {
  loadEventPlacement,
  requestEventPlacement,
  clearEventPlacement,
  loadEventHostEntity,
  setEventHostEntity,
  listMyHostableSpaces,
} from '@/app/(main)/events/placement-actions'
import { transferEventHost } from '@/app/(main)/events/[slug]/social-actions'
import { isError } from '@/lib/action-result'
import { Input, labelClasses } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { getInitials } from '@/lib/utils'
import { avatarSrc, avatarFocusStyle } from '@/lib/images/avatar-focus'
import type { PlacementView, PlacementTargetType } from '@/lib/events/placement'
import { EventHostOfferField } from '@/components/events/event-host-offer-field'
import { Button } from '@/components/ui/button'

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
    return <div className="h-24 animate-pulse rounded-card border border-border bg-surface-elevated/50" />
  }

  return (
    <div className="space-y-2 rounded-card border border-border bg-surface-elevated/40 p-3">
      {/* VENUE, not "where does this event live" (ADR-911). The old wording sat directly above the
          "Hosted by" control, and because setEventHostEntity wrote BOTH columns the two really were
          one thing — so two labels described one axis and neither was true. This is placement only:
          whose calendar calls the event home. It carries no money and no rights. */}
      <span className={labelClasses}>
        Venue <span className="font-normal text-subtle">(the Space or Circle it lives in)</span>
      </span>

      {view.status === 'live' && view.target ? (
        <CurrentPlacement view={view} pending={pending} onClear={clear} />
      ) : view.status === 'pending' && view.target ? (
        <CurrentPlacement view={view} pending={pending} onClear={clear} />
      ) : (
        <>
          <p className="text-meta text-subtle">
            Search for a Space or Circle. The steward there approves before your event shows up under it.
          </p>
          <ScopeSearch pending={pending} onPick={pick} />
        </>
      )}

      {error && <p className="text-meta text-danger">{error}</p>}

      {/* WHO HOSTS IT (ADR-819) — the hosting entity: you personally, or a Space you help run.
          Space-hosted = the space is the billed + displayed host ("Hosted by <space>"), and ticket
          money routes through it. Genuinely distinct from the Venue above now: setting a host no
          longer re-homes the event (ADR-911), so "at Royal Temple, hosted by Audrey DeWitt" is a
          state the two controls can actually express. */}
      <div className="border-t border-border pt-2">
        <HostEntityControl eventId={eventId} slug={slug} />
      </div>

      {/* HANDING HOSTING OUT (ADR-911). The select above only offers Spaces the caller already helps
          run, which is correct for a payee and is also a dead end for a venue handing an event to the
          business running it. This is the two-sided path for that case. */}
      <div className="border-t border-border pt-2">
        <EventHostOfferField eventId={eventId} slug={slug} />
      </div>

      {/* Transfer host — hand the event to another member. Kept in this box because "where the event
          lives" and "who owns it" are the same stewardship decision. Reuses the transferEventHost
          action; the outgoing host stays on as a cohost. */}
      <div className="border-t border-border pt-2">
        <TransferHostControl eventId={eventId} slug={slug} />
      </div>
    </div>
  )
}

// The hosting entity switch: personal, or one of the spaces the caller helps run (editor+). The
// server re-validates both the event capability and the space authority, so this list is a
// convenience only. Small and in-flow like everything else in this box.
function HostEntityControl({ eventId, slug }: { eventId: string; slug: string }) {
  const [hostSpace, setHostSpace] = useState<{ id: string; slug: string; name: string } | null>(null)
  const [options, setOptions] = useState<{ id: string; slug: string; name: string }[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    let active = true
    Promise.all([loadEventHostEntity(eventId), listMyHostableSpaces()])
      .then(([entity, spaces]) => {
        if (!active) return
        setHostSpace(entity.hostSpace)
        setOptions(spaces)
      })
      .catch(() => {
        if (active) setOptions([])
      })
    return () => {
      active = false
    }
  }, [eventId])

  function choose(value: string) {
    setError(null)
    startTransition(async () => {
      const res = await setEventHostEntity(
        eventId,
        slug,
        value === 'personal' ? { kind: 'profile' } : { kind: 'space', spaceId: value },
      )
      if (isError(res)) {
        setError(res.error)
        return
      }
      setHostSpace(res.data.hostSpace)
    })
  }

  if (options === null) return null

  return (
    <div>
      <p className="flex items-center gap-1.5 text-meta font-semibold text-text">
        <Building2 className="h-3.5 w-3.5 text-subtle" /> Hosted by
      </p>
      <p className="mt-0.5 text-2xs text-muted">
        {hostSpace
          ? `${hostSpace.name} is the host. Registrations and ticket payments run through it.`
          : 'You host this personally. Pick a space to run it through the space instead.'}
      </p>
      {options.length > 0 ? (
        <Select
          value={hostSpace?.id ?? 'personal'}
          onChange={(e) => choose(e.target.value)}
          disabled={pending}
          aria-label="Who hosts this event"
          wrapperClassName="mt-1.5"
        >
          <option value="personal">You (personal event)</option>
          {options.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
          {hostSpace && !options.some((s) => s.id === hostSpace.id) && (
            <option value={hostSpace.id}>{hostSpace.name}</option>
          )}
        </Select>
      ) : hostSpace ? (
        <p className="mt-1 text-2xs text-muted">Only someone who helps run {hostSpace.name} can change this.</p>
      ) : null}
      {error && <p className="mt-1 text-meta text-danger">{error}</p>}
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
  const searchHandles = useMemo(() => createHandleSearch<HandleHit>(), [])
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
      // Never throws; null is a stale response for a query already typed past.
      const found = await searchHandles(q)
      if (found) setHits(found)
    }, 150)
  }, [searchHandles])

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
        className="inline-flex items-center gap-1.5 text-meta font-medium text-subtle transition-colors hover:text-text"
      >
        <Crown className="h-3.5 w-3.5" /> Transfer host role
      </button>
    )
  }

  return (
    <div className="rounded-card bg-surface p-3">
      <div className="flex items-center justify-between">
        <p className="text-meta font-semibold text-text">Transfer host role</p>
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
          <p className="text-meta text-muted">
            Make <span className="font-semibold text-text">@{choice.handle}</span> the host? You will
            stay on as a cohost.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Button
              size="sm"
              type="button"
              onClick={confirm}
              disabled={pending}
            >
              {pending ? 'Transferring…' : 'Confirm transfer'}
            </Button>
            <button
              type="button"
              onClick={() => setChoice(null)}
              disabled={pending}
              className="rounded-control px-2 py-1.5 text-meta font-medium text-muted transition-colors hover:text-text disabled:opacity-40"
            >
              Back
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2">
          <Input
            type="text"
            aria-label="New host"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              search(e.target.value)
            }}
            placeholder="New host by name or @handle"
            disabled={pending}
            className="py-1.5"
          />
          {hits.length > 0 && (
            <div className="mt-1 overflow-hidden rounded-card border border-border bg-surface py-1 lift-3">
              {hits.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setChoice(p)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-surface-elevated"
                >
                  {p.avatar_url ? (
                    <Image src={avatarSrc(p.avatar_url)} alt={p.display_name} width={24} height={24} className="h-6 w-6 shrink-0 rounded-pill object-cover" style={avatarFocusStyle(p.avatar_url)} />
                  ) : (
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-pill bg-primary-bg text-3xs font-bold text-primary-strong">
                      {getInitials(p.display_name)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-meta font-semibold text-text">{p.display_name}</p>
                    <p className="truncate text-2xs text-muted">@{p.handle}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-1.5 text-meta text-danger">{error}</p>}
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
    <div className="flex items-center gap-2.5 rounded-card bg-surface px-3 py-2">
      <TargetIcon className="h-4 w-4 shrink-0 text-subtle" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-body-sm font-medium text-text">{target.name}</p>
        <p className="flex items-center gap-1 text-meta text-subtle">
          {live ? (
            <>
              <Check className="h-3 w-3 text-success" /> Lives here
            </>
          ) : (
            // A pending ask names who it waits on, so a placement that needs approval never
            // reads as one that silently failed.
            <>
              <Clock className="h-3 w-3" /> Waiting on {target.name}&rsquo;s{' '}
              {target.type === 'space' ? 'steward' : 'host'} to approve
            </>
          )}
        </p>
      </div>
      <button
        type="button"
        onClick={onClear}
        disabled={pending}
        aria-label={live ? 'Remove from this Space or Circle' : 'Cancel request'}
        className="shrink-0 rounded-control px-2 py-1 text-meta font-medium text-subtle transition-colors hover:text-danger disabled:opacity-40"
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
      <div className="flex items-center gap-2 rounded-control border border-border bg-surface px-3 py-1.5">
        <MapPin className="h-4 w-4 shrink-0 text-subtle" />
        <Input
          variant="seamless"
          type="text"
          aria-label="Search Spaces and Circles by name"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            search(e.target.value)
          }}
          placeholder="Search Spaces and Circles by name"
          disabled={pending}
          className="min-w-0 flex-1 text-body-sm text-text"
        />
      </div>

      {/* Results render IN FLOW (not an absolute overlay) — the module's @container wrapper clips a
          `top-full` dropdown, so an in-flow list is the reliable pattern (see cohost-manager). */}
      {hasResults && (
        <div className="mt-1 overflow-hidden rounded-card border border-border bg-surface lift-3">
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
      <p className="px-3 py-1 text-2xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      {hits.map((h) => (
        <button
          key={h.id}
          type="button"
          onClick={() => onPick(type, h.id)}
          disabled={pending}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-surface-elevated disabled:opacity-40"
        >
          {h.image_url ? (
            <Image src={h.image_url} alt={h.name} width={24} height={24} className="h-6 w-6 shrink-0 rounded-control object-cover" />
          ) : (
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-control bg-primary-bg text-3xs font-bold text-primary-strong">
              {getInitials(h.name)}
            </div>
          )}
          <span className="min-w-0 flex-1 truncate text-meta font-semibold text-text">{h.name}</span>
        </button>
      ))}
    </div>
  )
}
