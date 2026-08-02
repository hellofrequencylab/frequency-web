'use client'

import { useState, useEffect, useTransition, useRef, useCallback, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import Image from 'next/image'
import { Share2, Check, Clock } from 'lucide-react'
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

type ScopeHit = { id: string; name: string; slug: string; image_url: string | null; type_label?: string }

/** The quiet Space-type badge (ADR-835): every picker result and Collaborator row names its TYPE
 *  ("Business Space" / "Non Profit") next to the logo, so a Space named after its owner never reads
 *  as a person. The badge does the disambiguation; person-named Spaces are eligible. */
function SpaceTypeBadge({ label }: { label: string }) {
  return (
    <span className="shrink-0 rounded-full border border-border bg-surface-elevated px-1.5 py-0.5 text-3xs font-semibold uppercase tracking-wide text-subtle">
      {label}
    </span>
  )
}

// COLLABORATORS (relation B, ADR-834) — the host shares the event with another SPACE so it shows on
// that Space's calendar too (Events EC3). This is CALENDAR VISIBILITY plus a featured credit on the
// event page, never management access. The other relation is PERSONAL COHOSTS (relation A,
// event_cohosts, the EventCohostChooser above this field): members who help RUN the event.
//
// Picking a Space REQUESTS a share; a steward there approves before it appears on their calendar
// (unless the host stewards it too, or the spaces already collaborate, in which case it's accepted
// immediately). A Space that asked to FEATURE this event shows here as a request the host approves.
// The picker offers any real Business / Non Profit Space (ADR-835 — the person/Space distinction is
// structural, so owner-named Spaces are eligible; each result and row wears a Space-type badge +
// logo so it never reads as a person — /api/search-scopes?for=event-share); requestEventShare
// enforces the same rule, and the host side's Collective plan gates Collaborator hosting.
// Mirrors the placement field: results render IN FLOW (the module's @container wrapper clips a
// `top-full` overlay).

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
        Collaborators{' '}
        <span className="font-normal text-subtle">(share this event with another Space)</span>
      </span>

      {shares.length > 0 && (
        <ul className="space-y-1.5">
          {shares.map((s) => (
            <li key={s.id} className="flex items-center gap-2.5 rounded-lg bg-surface px-3 py-2">
              {s.space.logoUrl ? (
                <Image
                  src={s.space.logoUrl}
                  alt={s.space.name}
                  width={28}
                  height={28}
                  className="h-7 w-7 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <div className="flex h-7 w-7 shrink-0 select-none items-center justify-center rounded-lg bg-primary-bg text-3xs font-bold text-primary-strong">
                  {getInitials(s.space.name)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium text-text">{s.space.name}</span>
                  <SpaceTypeBadge label={s.space.typeLabel} />
                </p>
                <p className="flex items-center gap-1 text-xs text-subtle">
                  {s.status === 'accepted' ? (
                    <>
                      <Check className="h-3 w-3 text-success" /> Collaborator
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
                    Approve
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    // Confirm only the destructive case: removing a live Collaborator takes the
                    // event off their calendar. Cancelling your own pending request is low stakes.
                    if (
                      s.status === 'accepted' &&
                      !window.confirm(`Remove ${s.space.name} as a collaborator? The event leaves their calendar.`)
                    )
                      return
                    run(revokeEventShare(s.id))
                  }}
                  disabled={pending}
                  aria-label={s.status === 'accepted' ? 'Remove collaborator' : 'Cancel request'}
                  className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-subtle transition-colors hover:text-danger disabled:opacity-40"
                >
                  {s.status === 'accepted' ? 'Remove' : 'Cancel request'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-subtle">
        A Collaborator is a Business or Non Profit Space that co-hosts this event on its calendar. A
        steward there approves the request. To add a person, invite them as a cohost above.
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
  const boxRef = useRef<HTMLDivElement>(null)

  // 🔴 SAME STUCK-LIST BUG as the host picker, and it predates it. Owner report was against the host
  // field, but this Collaborator picker sits in the SAME rail with the same shape: results render in
  // flow (an absolute overlay is clipped by the module's @container), and nothing here cleared them
  // — not a pick, not Escape, not a click away. `ScopeSearch` in event-placement-field.tsx has always
  // cleared on pick; these two never did.
  const dismiss = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setQuery('')
    setSpaces([])
  }, [])

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      if (e.key === 'Escape' && (query || spaces.length > 0)) {
        e.stopPropagation() // do not also close the admin rail
        dismiss()
      }
    },
    [query, spaces.length, dismiss],
  )

  useEffect(() => {
    if (spaces.length === 0) return
    function onDocClick(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) dismiss()
    }
    document.addEventListener('click', onDocClick, true)
    return () => document.removeEventListener('click', onDocClick, true)
  }, [spaces.length, dismiss])

  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      if (q.trim().length < 2) {
        setSpaces([])
        return
      }
      try {
        // `for=event-share` keeps invalid Collaborator targets (anything that is not a real
        // Business / Non Profit Space) out of the picker and returns each hit's type badge;
        // the server action re-enforces the same rule.
        const res = await fetch(`/api/search-scopes?q=${encodeURIComponent(q.trim())}&for=event-share`)
        const json = await res.json()
        setSpaces(json.spaces ?? [])
      } catch {
        setSpaces([])
      }
    }, 150)
  }, [])

  return (
    <div ref={boxRef} onKeyDown={onKeyDown}>
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
              onClick={() => {
                dismiss()
                onPick(h.id)
              }}
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
              {h.type_label && <SpaceTypeBadge label={h.type_label} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
