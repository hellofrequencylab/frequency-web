'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isError } from '@/lib/action-result'
import { catalogItems } from '@/lib/billing/pricing-keys'
import { formatCents } from '@/lib/pricing/display'
import { setBetaPriceGrantAction } from '@/app/(main)/admin/spaces/[id]/beta-grant-actions'

// THE BETA PRICE GRANT panel on /admin/spaces/[id] (ADR-1061). One switch: does this Space check out
// at the closed beta rate instead of list? The public pricing page is untouched either way, which is
// the entire point of the feature.
//
// 🔴 THE AMOUNTS ARE DERIVED, NEVER WRITTEN DOWN HERE. This panel spent a while telling the operator
// the grant bought "Business $19 a month" after ADR-1067 had removed Business's founding rate
// (business_base is 2900/2900, founding == list), so a granted Space paid $29 for Business and the
// panel said otherwise. It described a commercial promise that the checkout would not honour. The
// list below is computed from the same CATALOG the checkout bills from, so an item that gains or
// loses a beta rate changes this copy by itself.
//
// THREE STATES, and the third is the one that matters. `unavailable` means the column is not in the
// database yet, and it renders the instruction rather than a toggle: a control that cannot write must
// say so, not look enabled and quietly do nothing. Every write is a janitor-gated server action that
// re-checks authorization; this component only collects intent and surfaces the result.
//
// Token-only styling; no em dashes (CONTENT-VOICE).

/** The serializable read of the grant the page hands down. */
export type BetaPriceGrantState =
  | { kind: 'ok'; granted: boolean; grantedAt: string | null; grantedByName: string | null }
  | { kind: 'unavailable'; message: string }

function stampLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

/** The catalog items that actually carry a beta rate today: founding strictly under list. ADR-1067
 *  left exactly one (Collective), and a flat item says "no beta rate" by having the two equal. PURE
 *  read of the code CATALOG, which is what the checkout resolves. */
const BETA_RATE_ITEMS = catalogItems().filter((i) => i.month.foundingCents < i.month.listCents)

/** "Collective $49 a month" — the plan names carry the magic, so the label drops its product prefix. */
function itemPhrase(cents: (m: { listCents: number; foundingCents: number }) => number): string {
  return BETA_RATE_ITEMS.map(
    (i) => `${i.label.replace(/^Frequency /, '')} ${formatCents(cents(i.month))} a month`,
  ).join(', ')
}

export function BetaPriceGrantPanel({
  spaceId,
  state,
}: {
  spaceId: string
  state: BetaPriceGrantState
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  if (state.kind === 'unavailable') {
    return (
      <div className="rounded-card border border-warning/60 bg-warning-bg p-4">
        <p className="text-body-sm font-semibold text-text">Not available yet</p>
        <p className="mt-1 text-body-sm text-muted">{state.message}</p>
      </div>
    )
  }

  const { granted, grantedAt, grantedByName } = state

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={
            granted
              ? 'rounded-pill bg-success-bg px-3 py-1 text-meta font-semibold text-success'
              : 'rounded-pill bg-surface-elevated px-3 py-1 text-meta font-semibold text-muted'
          }
        >
          {granted ? 'Beta rate granted' : 'Regular pricing'}
        </span>
        <p className="text-body-sm text-muted">
          {granted
            ? `This space checks out at the beta rate: ${itemPhrase((m) => m.foundingCents)}, or ten times that for the year. Every other plan bills at the published price, because no other plan has a beta rate.`
            : `This space checks out at the published price: ${itemPhrase((m) => m.listCents)}, or ten times that for the year.`}
        </p>
      </div>

      {granted && grantedAt && (
        <p className="text-meta text-subtle">
          Granted {stampLabel(grantedAt)}
          {grantedByName ? ` by ${grantedByName}` : ''}.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant={granted ? 'secondary' : 'primary'}
          disabled={pending}
          onClick={() => {
            setError(null)
            start(async () => {
              const result = await setBetaPriceGrantAction(spaceId, !granted)
              if (isError(result)) setError(result.error)
              else router.refresh()
            })
          }}
        >
          {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
          {granted ? 'Remove the beta rate' : 'Grant the beta rate'}
        </Button>
        <p className="text-meta text-muted">
          {granted
            ? 'Removing it only affects a space that has not subscribed yet. Once they check out, the price they paid is locked in and this switch stops mattering.'
            : 'Nothing about the pricing page changes. Only this space sees the older price, and only at checkout.'}
        </p>
      </div>
      {error && <p className="text-body-sm text-danger">{error}</p>}
    </div>
  )
}
