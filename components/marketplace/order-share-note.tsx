import { Badge, type BadgeTone } from '@/components/ui/badge'
import type { CommerceOrder } from '@/lib/commerce/orders'
import type { TransferStatus } from '@/lib/commerce/transfers'

// A SELLER'S SHARE OF A SPLIT ORDER (LIVE-624, ADR-1616). One line under an order on every surface
// that lists a seller's sales (the Space Shop Orders tab, the maker console): what share of how many
// sellers' order this was, what reaches them after the fee, and where their payout stands. It reads
// `order.share`, which only a seller's own read sets, so a destination order, the buyer's view and
// the operator's view render nothing here. Server component; decides nothing about who may see it.

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100)
}

/** Where a seller's payout stands, in their words. */
export const SHARE_STATUS: Record<TransferStatus, { label: string; tone: BadgeTone }> = {
  planned: { label: 'Payout on its way', tone: 'neutral' },
  created: { label: 'Paid out', tone: 'success' },
  failed: { label: "Payout delayed. We're retrying it.", tone: 'warning' },
  reversed: { label: 'Payout reversed', tone: 'neutral' },
  cancelled: { label: 'Refunded before payout', tone: 'neutral' },
}

export function OrderShareNote({ order }: { order: CommerceOrder }) {
  const s = order.share
  if (!s) return null
  const status = SHARE_STATUS[s.transferStatus]
  return (
    <div data-order-share={s.transferStatus} className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-muted">
      <span>
        Your share of a {order.sellerCount}-seller order. {money(s.netCents, order.currency)} to you after a{' '}
        {money(s.feeCents, order.currency)} fee.
      </span>
      <Badge tone={status.tone}>{status.label}</Badge>
      {s.reversedCents > 0 && s.transferStatus !== 'reversed' && (
        <span>{money(s.reversedCents, order.currency)} pulled back.</span>
      )}
    </div>
  )
}
