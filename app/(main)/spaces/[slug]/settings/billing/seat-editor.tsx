'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Minus, Plus, Loader2, Check } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { setOperatorSeats } from './actions'

// OPERATOR SEAT EDITOR (client, A4/A5). Change a paying Space's LICENSED operator-seat count directly on
// the live subscription (setOperatorSeats -> updateOperatorSeats mutates the operator_seat item with
// proration). Only mounted when the Space is paid AND seats are sellable (activated + priced), so it
// never appears while seats are inert. The count is the EXTRA operators beyond the owner's free seat.
// No em dashes (CONTENT-VOICE §10).

const MAX = 25

/** Whole-dollar money label (no cents when even). Client-side, so no project money lib. */
function usd(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  })
}

export function SeatEditor({
  slug,
  initialSeats,
  seatMonthlyCents = 0,
  usedSeats = 0,
  minSeats = 0,
}: {
  slug: string
  initialSeats: number
  /** The resolved per-seat monthly price in cents, to show the running total. */
  seatMonthlyCents?: number
  /** Active operators consuming a seat (for the downgrade warning copy). */
  usedSeats?: number
  /** The lowest seat count that still covers the active operators (used - the free base). Reducing below
   *  it would leave operators over the licensed allowance, so the minus button floors here. */
  minSeats?: number
}) {
  const router = useRouter()
  const floor = Math.max(0, Math.min(MAX, Math.floor(minSeats)))
  const [seats, setSeats] = useState(Math.max(floor, Math.min(MAX, Math.floor(initialSeats))))
  const [saved, setSaved] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const dirty = seats !== (saved ?? Math.max(0, Math.min(MAX, Math.floor(initialSeats))))
  // At the floor, dropping further would strand active operators over the licensed count.
  const atFloor = seats <= floor && floor > 0

  function save() {
    setError(null)
    start(async () => {
      const res = await setOperatorSeats(slug, seats)
      if (isError(res)) {
        setError(res.error)
        return
      }
      setSaved(res.data.seats)
      router.refresh() // pull the reconciled seat counter once the webhook lands
    })
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-text">Operator seats</h2>
          <p className="mt-1 text-sm text-muted">
            Set how many extra operators you license. Your own seat is included, so this is the team beyond
            you. Changes are prorated on your next invoice.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center gap-1 rounded-lg border border-border">
            <button
              type="button"
              aria-label="Remove a seat"
              onClick={() => setSeats((n) => Math.max(floor, n - 1))}
              disabled={pending || seats <= floor}
              className="inline-flex h-8 w-8 items-center justify-center rounded-l-lg text-muted transition-colors hover:bg-surface-elevated hover:text-text disabled:opacity-40"
            >
              <Minus className="h-4 w-4" aria-hidden />
            </button>
            <span className="min-w-10 text-center text-sm font-semibold tabular-nums text-text" aria-live="polite">
              {seats}
            </span>
            <button
              type="button"
              aria-label="Add a seat"
              onClick={() => setSeats((n) => Math.min(MAX, n + 1))}
              disabled={pending || seats >= MAX}
              className="inline-flex h-8 w-8 items-center justify-center rounded-r-lg text-muted transition-colors hover:bg-surface-elevated hover:text-text disabled:opacity-40"
            >
              <Plus className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <button
            type="button"
            onClick={save}
            disabled={pending || !dirty}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
            Save
          </button>
        </div>
      </div>
      {/* The running cost of the chosen seats, so the count is never priceless. */}
      {seatMonthlyCents > 0 && (
        <p className="mt-3 text-xs font-medium text-text">
          {seats} {seats === 1 ? 'seat' : 'seats'} x {usd(seatMonthlyCents)} = {usd(seatMonthlyCents * seats)}/mo,
          prorated on your next invoice.
        </p>
      )}
      {/* Downgrade guard: at the floor, reducing further would strand active operators over the license. */}
      {atFloor && (
        <p className="mt-2 text-2xs font-medium text-warning">
          {usedSeats} {usedSeats === 1 ? 'operator is' : 'operators are'} active. Remove operators in Members
          before licensing fewer seats, or they stay over your licensed count.
        </p>
      )}
      {saved !== null && !dirty && !error && (
        <p className="mt-3 text-2xs font-medium text-success" role="status">
          Seats updated to {saved}. Your next invoice reflects the prorated change.
        </p>
      )}
      {error && (
        <p className="mt-3 text-2xs font-medium text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
