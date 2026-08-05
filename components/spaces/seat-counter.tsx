import Link from 'next/link'
import { Users, Plus } from 'lucide-react'
import { Meter } from '@/components/ui/meter'
import type { SeatUsage } from '@/lib/spaces/seats'

// SEAT COUNTER (Pricing ladder Phase D, ADR-465). A compact "X of Y seats used" line for the members
// + billing surfaces, with an "add a seat" affordance that links to the plan and billing page (where
// the Team add-on seat control lives). A Server Component (no client JS): it just reads the resolved
// SeatUsage the page already computed and renders it.
//
// WHILE BILLING IS OFF (preview): seats are not enforced yet, so the counter is shown as an
// informational preview and the copy says so plainly (CONTENT-VOICE skeptic test, no em dashes). When
// billing goes live, the same counter reflects the real licensed allowance + the enforcement.

export function SeatCounter({
  usage,
  billingHref,
  enforced,
  canManage,
}: {
  /** The resolved seat usage (licensed / used / remaining) for the Space. */
  usage: SeatUsage
  /** The plan and billing page href (where the seat control + the Team add-on live). */
  billingHref: string
  /** Whether the seat limit is actually enforced (billing live). False = a preview while OFF. */
  enforced: boolean
  /** Whether the viewer may manage seats (owner / admin); gates the "add a seat" link. */
  canManage: boolean
}) {
  const { used, licensed, full } = usage
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-5 py-4 lift-1">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
            enforced && full ? 'bg-warning-bg text-warning' : 'bg-surface-elevated text-subtle'
          }`}
          aria-hidden
        >
          <Users className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          {/* THE CAP METER, THROUGH THE KIT. A licensed seat allowance is exactly what Meter is for
              (DAWN: a Space shows the room it has left, teal with room, amber from 80%, danger only
              AT the cap), and the hand-rolled line here was the third spelling of the same idea.
              The reading is unchanged word for word: "3 of 5 operator seats used". */}
          <Meter used={used} cap={licensed} label="Operator seats" unit="operator seats used" />
          <p className="mt-1.5 text-meta text-muted">
            {enforced ? (
              full ? (
                <>
                  Every operator seat is taken. Add a seat to invite another teammate.{' '}
                  <Link href={billingHref} className="font-medium text-text underline underline-offset-2 hover:text-primary">
                    Team roles come with the Collective plan.
                  </Link>
                </>
              ) : (
                'Admins, moderators, and editors use a seat. Members are free.'
              )
            ) : (
              'Seats are not enforced yet. This is a preview of how your team will be counted when paid plans go live.'
            )}
          </p>
        </div>
      </div>
      {canManage && (
        <Link
          href={billingHref}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-control border border-border px-3 py-2 text-meta font-bold text-text transition-colors hover:bg-surface-elevated"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden /> Add a seat
        </Link>
      )}
    </div>
  )
}
