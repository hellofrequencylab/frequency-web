'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Select } from '@/components/ui/select'
import { isError } from '@/lib/action-result'
import {
  getCircleMoveData,
  moveCircleToSpaceAction,
  type CircleMoveData,
} from '@/app/(main)/circles/[slug]/transfer-actions'

// The circle-side "Move this circle" control, mounted in the circle admin rail's Danger section.
//
// TWO STEPS, ALWAYS. A move carries the roster and restamps every circle event onto the
// destination's calendar (ADR-857), so it is never one click: pick a Space, then read what goes
// with it and confirm. The confirm step names the destination and the member count rather than
// asking "are you sure", because the thing worth checking is WHERE it lands, not whether the
// button was pressed on purpose.
//
// THE REFUSAL COMES FIRST. A circle a membership tier points at is PINNED (lib/circles/transfer.ts
// TIER_LINKED): the read reports that up front and the picker never draws, so nobody chooses a
// destination and only then learns the move was never available.
//
// The server owns every rule. This component holds no gate of its own: the read returns null for
// anyone who may not manage the circle, and the module renders nothing at all in that case.

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
      ) : data.blockedReason ? (
        <p className="rounded-card border border-border bg-surface-elevated/60 p-3 text-2xs text-subtle">
          {data.blockedReason}
        </p>
      ) : data.targets.length === 0 ? (
        <p className="text-2xs text-muted">
          You do not help run any other space yet.{' '}
          <Link href="/spaces/new" className="font-medium text-primary hover:underline">
            Start a space
          </Link>{' '}
          and this circle can move into it.
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

      {error && <p className="text-meta font-medium text-danger">{error}</p>}
    </div>
  )
}
