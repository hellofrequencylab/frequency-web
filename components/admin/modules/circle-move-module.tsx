'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/field'
import { isError } from '@/lib/action-result'
import {
  getCircleMoveData,
  moveCircleToSpaceAction,
  offerCircleToPersonAction,
  cancelCircleOfferAction,
  type CircleMoveData,
} from '@/app/(main)/circles/[slug]/transfer-actions'

// The circle-side "Move this circle" control, mounted in the circle admin rail's Danger section.
//
// TWO DOORS, ONE MODULE. Moving it into a Space you run and handing it to a PERSON are the same
// authority (circle.editSettings) acting on the same subject (where this circle lives), which is
// ADR-846's fold test passing — so they share a control rather than each getting a catalog row.
// ADR-1024 kept `circle.transfer` out of `circle.settings` because settings edit the circle inside
// the home it already has; both of these change the home.
//
// TWO STEPS, ALWAYS, on both doors. A move carries the roster and restamps every circle event onto
// the destination's calendar (ADR-857); a handoff puts the circle in someone else's hands. Neither
// is one click: pick, then read what happens and confirm. The confirm step names the destination
// and the member count rather than asking "are you sure", because the thing worth checking is
// WHERE it lands, not whether the button was pressed on purpose.
//
// THE REFUSAL COMES FIRST, and a PENDING OFFER comes before even that. While a handoff is waiting
// the circle can go nowhere: one pending offer per circle is a unique partial index (migration
// 20261230000000) and the move refuses too, telling the operator to cancel it first. So an open
// offer is shown ahead of both pickers with the only action that is actually available, take it
// back. Otherwise a host could strand their own circle. A circle a membership tier points at is
// PINNED the same way (lib/circles/transfer.ts TIER_LINKED) and reports up front.
//
// The server owns every rule. This component holds no gate of its own: the read returns null for
// anyone who may not manage the circle, and the module renders nothing at all in that case.

interface PersonHit {
  id: string
  handle: string
  display_name: string
}

export function CircleMoveModule() {
  const pathname = usePathname()
  const router = useRouter()
  const slug = pathname.match(/^\/circles\/([^/]+)/)?.[1] ?? null

  const [data, setData] = useState<CircleMoveData | null>(null)
  const [loading, setLoading] = useState(true)
  const [picked, setPicked] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [movedTo, setMovedTo] = useState<string | null>(null)
  const [pending, start] = useTransition()
  /** Handing it to a person: the handle typed, the matches found, and who is being confirmed. */
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<PersonHit[]>([])
  const [offerTo, setOfferTo] = useState<PersonHit | null>(null)

  // One read, re-run after a write that changes what the control should offer: sending or
  // withdrawing an offer swaps the pickers for the waiting notice and back.
  const load = useCallback(async () => {
    if (!slug) return
    const next = await getCircleMoveData(slug).catch(() => null)
    setData(next)
  }, [slug])

  // The first read is written out rather than calling `load`, because react-hooks/set-state-in-effect
  // refuses a helper that sets state when an effect calls it directly; the promise callback is the
  // boundary the rule accepts.
  useEffect(() => {
    if (!slug) return
    let active = true
    getCircleMoveData(slug)
      .then((d) => {
        if (active) {
          setData(d)
          setLoading(false)
        }
      })
      .catch(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [slug])

  if (!slug) return null
  if (loading) {
    return <div className="h-32 animate-pulse rounded-card border border-border bg-surface-elevated/50" />
  }
  if (!data) return null

  const destination = data.targets.find((t) => t.id === picked) ?? null

  function move() {
    if (!destination || !slug) return
    setError(null)
    const target = destination
    start(async () => {
      const res = await moveCircleToSpaceAction(slug!, target.id)
      if (isError(res)) {
        setError(res.error)
        setConfirming(false)
        return
      }
      setMovedTo(target.name)
      setConfirming(false)
      setPicked('')
      router.refresh()
    })
  }

  /** The person picker's backing search, the same one the Space console uses. */
  function searchPeople(q: string) {
    setQuery(q)
    if (!q.trim()) {
      setHits([])
      return
    }
    fetch(`/api/search-handles?q=${encodeURIComponent(q.trim())}`)
      .then((r) => r.json())
      .then((j) => setHits(j.profiles ?? []))
      .catch(() => setHits([]))
  }

  function sendOffer() {
    if (!offerTo || !slug) return
    setError(null)
    const person = offerTo
    start(async () => {
      const res = await offerCircleToPersonAction(slug!, person.id)
      if (isError(res)) {
        setError(res.error)
        setOfferTo(null)
        return
      }
      setOfferTo(null)
      setQuery('')
      setHits([])
      // Re-read so the waiting offer takes the place of the pickers, which is now the true state.
      await load()
      router.refresh()
    })
  }

  function takeItBack() {
    const offer = data?.pendingOffer
    if (!offer || !slug) return
    setError(null)
    start(async () => {
      const res = await cancelCircleOfferAction(slug!, offer.id)
      if (isError(res)) {
        setError(res.error)
        return
      }
      await load()
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <p className="text-2xs text-muted">
        {data.currentSpace
          ? `This circle belongs to ${data.currentSpace.name}.`
          : 'This is your own circle. No space owns it yet.'}
      </p>

      {movedTo ? (
        <p className="text-meta font-medium text-text">
          {data.name} now belongs to {movedTo}. Its members and its events went with it.
        </p>
      ) : data.pendingOffer ? (
        <div className="space-y-2 rounded-card border border-border bg-surface-elevated/60 p-3">
          <p className="text-meta font-semibold text-text">
            You offered {data.name} to {data.pendingOffer.toName}.
          </p>
          <p className="text-2xs text-subtle">
            It stays yours until they accept. Nothing else can happen to the circle while the offer
            is open, so take it back if you want to move it somewhere else.
          </p>
          <button
            type="button"
            onClick={takeItBack}
            disabled={pending}
            className="rounded-control border border-border bg-surface px-3 py-1.5 text-meta font-semibold text-text transition-colors hover:border-border-strong disabled:opacity-40"
          >
            {pending ? 'Taking it back…' : 'Take it back'}
          </button>
        </div>
      ) : data.blockedReason ? (
        <p className="rounded-card border border-border bg-surface-elevated/60 p-3 text-2xs text-subtle">
          {data.blockedReason}
        </p>
      ) : confirming && destination ? (
        <div className="space-y-2 rounded-card border border-border bg-surface-elevated/60 p-3">
          <p className="text-meta font-semibold text-text">
            Move {data.name} to {destination.name}?
          </p>
          <ul className="space-y-1 text-2xs text-subtle">
            <li>
              {data.memberCount} {data.memberCount === 1 ? 'member stays' : 'members stay'} in the
              circle and move with it.
            </li>
            <li>Its events move onto the {destination.name} calendar.</li>
            <li>The {destination.name} team can manage this circle from then on.</li>
          </ul>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={move}
              disabled={pending}
              className="rounded-control bg-primary px-3 py-1.5 text-meta font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
            >
              {pending ? 'Moving…' : 'Move it'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={pending}
              className="rounded-control px-3 py-1.5 text-meta font-medium text-subtle transition-colors hover:text-text disabled:opacity-40"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : offerTo ? (
        <div className="space-y-2 rounded-card border border-border bg-surface-elevated/60 p-3">
          <p className="text-meta font-semibold text-text">
            Hand {data.name} to {offerTo.display_name}?
          </p>
          <ul className="space-y-1 text-2xs text-subtle">
            <li>It stays yours until they accept. An offer changes nothing on its own.</li>
            <li>
              {data.memberCount} {data.memberCount === 1 ? 'member stays' : 'members stay'} in the
              circle and goes with it if they accept.
            </li>
            <li>You can take the offer back any time before they answer.</li>
          </ul>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={sendOffer}
              disabled={pending}
              className="rounded-control bg-primary px-3 py-1.5 text-meta font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
            >
              {pending ? 'Sending…' : 'Send the offer'}
            </button>
            <button
              type="button"
              onClick={() => setOfferTo(null)}
              disabled={pending}
              className="rounded-control px-3 py-1.5 text-meta font-medium text-subtle transition-colors hover:text-text disabled:opacity-40"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {data.targets.length === 0 ? (
            <p className="text-2xs text-muted">
              You do not help run any other space yet.{' '}
              <Link href="/spaces/new" className="font-medium text-primary hover:underline">
                Start a space
              </Link>{' '}
              and this circle can move into it.
            </p>
          ) : (
            <div className="space-y-2">
              <label htmlFor="circle-move-target" className="block text-meta font-semibold text-text">
                Move it to a space you run
              </label>
              <Select
                id="circle-move-target"
                value={picked}
                onChange={(e) => {
                  setPicked(e.target.value)
                  setError(null)
                }}
                disabled={pending}
                emptyLabel="Pick a space"
                options={data.targets.map((t) => ({ value: t.id, label: t.name }))}
              />
              <button
                type="button"
                onClick={() => setConfirming(true)}
                disabled={pending || !destination}
                className="rounded-control border border-border bg-surface px-3 py-1.5 text-meta font-semibold text-text transition-colors hover:border-border-strong disabled:opacity-40"
              >
                Review the move
              </button>
              <p className="text-2xs text-muted">
                Only spaces you help run are listed. Members and events move with the circle.
              </p>
            </div>
          )}

          {/* Handing it to someone ELSE is an offer, not a move: a circle carries members, so
              nothing changes until they accept (ADR-845). */}
          <div className="space-y-2 border-t border-border pt-3">
            <label htmlFor="circle-handoff-person" className="block text-meta font-semibold text-text">
              Or hand it to a person
            </label>
            <Input
              id="circle-handoff-person"
              type="text"
              value={query}
              onChange={(e) => {
                searchPeople(e.target.value)
                setError(null)
              }}
              placeholder="Search by name or @handle"
              disabled={pending}
              className="py-1.5"
            />
            {hits.length > 0 && (
              <div className="overflow-hidden rounded-card border border-border bg-surface">
                {hits.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setOfferTo(p)}
                    disabled={pending}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-surface-elevated disabled:opacity-40"
                  >
                    <span className="min-w-0 truncate text-meta font-semibold text-text">
                      {p.display_name}
                    </span>
                    <span className="shrink-0 text-2xs text-muted">@{p.handle}</span>
                  </button>
                ))}
              </div>
            )}
            <p className="text-2xs text-muted">
              They get an offer on the circle. It stays yours until they accept.
            </p>
          </div>
        </div>
      )}

      {error && <p className="text-meta font-medium text-danger">{error}</p>}
    </div>
  )
}
