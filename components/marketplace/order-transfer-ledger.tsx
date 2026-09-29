import { Badge, type BadgeTone } from '@/components/ui/badge'
import { ConfirmSubmitButton } from '@/components/ui/confirm-submit-button'
import { sellerNameKey } from '@/lib/commerce/orders'
import { MAX_TRANSFER_ATTEMPTS, type OrderTransfer, type TransferStatus } from '@/lib/commerce/transfers'

// THE OPERATOR'S TRANSFER LEDGER FOR ONE SPLIT ORDER (LIVE-624, ADR-1616). Every row the order owes
// its sellers (lib/commerce/transfers.ts), with its state, attempts, last error and transfer id, so a
// stuck transfer is on the Orders page and not only a log line. A planned or failed row carries a
// retry that goes through the same idempotent path the reconciler uses. Rendered by the platform
// operator's /admin/marketplace/orders only, under `[data-order-transfers]`. Server component: the
// retry posts to a server action the page bound after its own operator check.

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100)
}

const STATUS: Record<TransferStatus | 'stuck', { label: string; tone: BadgeTone }> = {
  planned: { label: 'Planned', tone: 'neutral' },
  created: { label: 'Paid', tone: 'success' },
  failed: { label: 'Failed', tone: 'warning' },
  reversed: { label: 'Reversed', tone: 'neutral' },
  stuck: { label: 'Stuck', tone: 'danger' },
}

const OPEN: TransferStatus[] = ['planned', 'failed']

/** A server action already bound to one transfer row. */
export type TransferRetryAction = () => Promise<void>

export function OrderTransferLedger({
  transfers,
  names,
  retry,
}: {
  /** The order's rows, or null when the ledger could not be read. */
  transfers: OrderTransfer[] | null
  /** Seller display names from sellerNames(), keyed by sellerNameKey(). */
  names: Map<string, string>
  /** Binds the retry action to one row. Omit to show the ledger without a door. */
  retry?: (transferId: string) => TransferRetryAction
}) {
  return (
    <div data-order-transfers={transfers ? transfers.length : 'unreadable'} className="mt-3 border-t border-border pt-3">
      <p className="text-meta font-medium text-text">Transfers to sellers</p>
      {transfers === null ? (
        <p className="mt-1 text-meta text-warning">The transfer ledger could not be read. Reload to try again.</p>
      ) : transfers.length === 0 ? (
        <p className="mt-1 text-meta text-muted">No transfers planned yet. The next reconciler run plans them.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {transfers.map((t) => {
            const open = OPEN.includes(t.status)
            const state = open && t.attempts >= MAX_TRANSFER_ATTEMPTS ? STATUS.stuck : STATUS[t.status]
            const seller = { kind: t.ownerKind, profileId: t.ownerProfileId, spaceId: t.ownerSpaceId }
            const name = names.get(sellerNameKey(seller)) ?? (t.ownerKind === 'space' ? 'A Space' : 'A maker')
            return (
              <li key={t.id} data-transfer-status={t.status} className="rounded-card border border-border px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="min-w-0 text-body-sm text-text">
                    <span className="font-medium">{name}</span>
                    <span className="text-muted"> · {t.ownerKind === 'space' ? 'Space' : 'Maker'}</span>
                  </p>
                  <div className="flex items-center gap-2">
                    <Badge tone={state.tone}>{state.label}</Badge>
                    <span className="text-body-sm font-semibold text-text">{money(t.amountCents, t.currency)}</span>
                  </div>
                </div>
                <p className="mt-1 text-meta text-muted">
                  Fee kept {money(t.platformFeeCents, t.currency)} · {t.attempts} {t.attempts === 1 ? 'attempt' : 'attempts'}
                  {t.reversedCents > 0 && <> · {money(t.reversedCents, t.currency)} reversed</>}
                  {t.stripeTransferId && <> · <span className="font-mono">{t.stripeTransferId}</span></>}
                </p>
                {t.lastError && open && <p className="mt-1 break-words text-meta text-warning">{t.lastError}</p>}
                {open && retry && (
                  <form action={retry(t.id)} className="mt-2">
                    <ConfirmSubmitButton
                      confirm="Send this transfer again? It uses the same key as every earlier attempt, so the seller can't be paid twice."
                      label="Retry transfer"
                      variant="secondary"
                    />
                  </form>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
