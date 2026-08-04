'use client'

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import Image from 'next/image'
import { Crown, Loader2 } from 'lucide-react'
import { getInitials } from '@/lib/utils'
import { isError, type ActionResult } from '@/lib/action-result'
import {
  loadPendingHostTransfer,
  offerEventHost,
  acceptEventHostTransfer,
  declineEventHostTransfer,
  revokeEventHostTransfer,
  type HostTransferView,
} from '@/app/(main)/events/host-transfer-actions'

// ── "Hand hosting to another Space" (ADR-911) ──────────────────────────────────────────────
//
// The `Hosted by` select above this can only offer Spaces the CALLER already helps run, because
// setEventHostEntity requires that — and it should, since the host is the PAYEE. The consequence was
// a dead end: a venue's manager could not hand hosting to the practitioner actually running the
// event, so an operator had to do it by hand every time.
//
// This is that path. It is a two-sided handshake, not a permission widening: accepting host means
// accepting the payout liability and the refund obligation for other people's ticket sales, so the
// receiving Space says yes for itself. One live offer per event (a partial unique index), so this
// renders either the pending offer or the picker, never both.

type ScopeHit = { id: string; name: string; image_url?: string | null; type_label?: string | null }

export function EventHostOfferField({ eventId, slug }: { eventId: string; slug: string }) {
  const [offer, setOffer] = useState<HostTransferView | null | undefined>(undefined)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setOffer(await loadPendingHostTransfer(eventId).catch(() => null))
  }, [eventId])

  // The repo's load shape (see HostEntityControl in event-placement-field.tsx): state is set inside
  // the promise callback with an `active` flag, not in the effect body — `await` in the body trips
  // react-hooks/set-state-in-effect, and the flag stops a late resolve writing to an unmounted tree
  // when the operator closes the rail mid-fetch.
  useEffect(() => {
    let active = true
    loadPendingHostTransfer(eventId)
      .then((v) => {
        if (active) setOffer(v)
      })
      .catch(() => {
        if (active) setOffer(null)
      })
    return () => {
      active = false
    }
  }, [eventId])

  // The four actions all return ActionResult, so `isError` is the discriminator (a bare
  // `'error' in res` does not narrow the `{ data: void }` arm and does not typecheck).
  const run = useCallback(
    async (fn: () => Promise<ActionResult>, successNote?: string) => {
      setPending(true)
      setError(null)
      setDone(null)
      const res = await fn()
      setPending(false)
      if (isError(res)) {
        setError(res.error)
        return
      }
      if (successNote) setDone(successNote)
      await refresh()
    },
    [refresh],
  )

  // `undefined` = still loading. Skip the skeleton: this sits inside an already-rendered settings
  // card, and a flashing placeholder for a control most events never use is worse than a beat of
  // nothing.
  if (offer === undefined) return null

  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs font-semibold text-text">
        <Crown className="h-3.5 w-3.5 text-subtle" /> Hand hosting to another Space
      </p>

      {offer ? (
        <div className="mt-1.5 rounded-lg border border-border bg-surface p-2.5">
          <p className="text-xs text-text">
            <span className="font-semibold">{offer.toSpace.name}</span>{' '}
            {offer.initiatedBy === 'host' ? 'has been asked to host this event.' : 'asked to host this event.'}
          </p>
          {offer.awaitingYou ? (
            <>
              {/* Naming the consequence at the point of the click. Accepting is not a credit change:
                  it moves who receives the money and who owes the refunds. */}
              <p className="mt-1 text-2xs text-muted">
                Accepting means registrations and ticket payments run through your Space, and refunds
                are yours to issue.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void run(() => acceptEventHostTransfer(offer.id), 'This Space now hosts the event.')}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
                >
                  {pending && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />} Accept hosting
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void run(() => declineEventHostTransfer(offer.id))}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:bg-surface-elevated disabled:opacity-60"
                >
                  Decline
                </button>
              </div>
            </>
          ) : (
            <div className="mt-2">
              <p className="text-2xs text-muted">Waiting for them to accept.</p>
              <button
                type="button"
                disabled={pending}
                onClick={() => void run(() => revokeEventHostTransfer(offer.id))}
                className="mt-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-elevated hover:text-text disabled:opacity-60"
              >
                Withdraw
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          <p className="mt-0.5 text-2xs text-muted">
            The Space you pick becomes the host: registrations and ticket money run through it. It
            stays at this venue, and they have to accept.
          </p>
          <HostSpaceSearch
            pending={pending}
            onPick={(spaceId) => void run(() => offerEventHost(eventId, spaceId), 'Offer sent.')}
          />
        </>
      )}

      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      {done && <p className="mt-1 text-xs text-success">{done}</p>}
      {/* `slug` is accepted so the caller passes the same pair every other control in this card takes;
          the server actions revalidate by the slug they read off the event row themselves. */}
      <span className="hidden">{slug}</span>
    </div>
  )
}

/** Space picker. Reuses `for=event-share`, which already filters to real Business / Non Profit
 *  Spaces and returns a type badge — the same structural rule a host must satisfy, so the picker and
 *  `hostSpaceGateError` agree. The server action re-enforces it; this is convenience only. */
function HostSpaceSearch({ pending, onPick }: { pending: boolean; onPick: (spaceId: string) => void }) {
  const [query, setQuery] = useState('')
  const [spaces, setSpaces] = useState<ScopeHit[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  // 🔴 THE RESULT LIST HAD NO WAY TO CLOSE. Owner report: "once the field of suggested spaces comes
  // up, it doesn't close no matter what I do. I have to close the rail for it to turn off."
  //
  // Three exits were all missing, and the list is rendered IN FLOW (it has to be — the settings
  // module's @container wrapper clips an absolute overlay), so it pushes the rest of the rail down
  // and reads as stuck rather than as a dropdown. `ScopeSearch` in event-placement-field.tsx already
  // clears query + hits after a pick; this is that, plus the two dismissals nothing in this rail had.
  const dismiss = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setQuery('')
    setSpaces([])
  }, [])

  // Escape, the reflex for any open list. Bound to the box, not the window, so it cannot swallow the
  // Escape that closes the admin rail itself when this picker is already empty.
  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      if (e.key === 'Escape' && (query || spaces.length > 0)) {
        e.stopPropagation()
        dismiss()
      }
    },
    [query, spaces.length, dismiss],
  )

  // A click anywhere outside. Capture phase so it lands before a click on some other rail control
  // does its own work, and only mounted while there is something to close.
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
        const res = await fetch(`/api/search-scopes?q=${encodeURIComponent(q.trim())}&for=event-share`)
        const json = await res.json()
        setSpaces(json.spaces ?? [])
      } catch {
        setSpaces([])
      }
    }, 150)
  }, [])

  return (
    <div className="mt-1.5" ref={boxRef} onKeyDown={onKeyDown}>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5">
        <Crown className="h-4 w-4 shrink-0 text-subtle" />
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

      {/* Results render IN FLOW, not as an absolute overlay: the settings module's @container wrapper
          clips a `top-full` dropdown (the same reason ScopeSearch and SpaceSearch do it this way). */}
      {spaces.length > 0 && (
        <div className="mt-1 overflow-hidden rounded-xl border border-border bg-surface py-1 lift-3">
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
                <Image
                  src={h.image_url}
                  alt={h.name}
                  width={24}
                  height={24}
                  className="h-6 w-6 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary-bg text-3xs font-bold text-primary-strong">
                  {getInitials(h.name)}
                </div>
              )}
              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-text">{h.name}</span>
              {h.type_label && (
                <span className="shrink-0 rounded-md bg-surface-elevated px-1.5 py-0.5 text-3xs font-semibold uppercase tracking-wide text-muted">
                  {h.type_label}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
