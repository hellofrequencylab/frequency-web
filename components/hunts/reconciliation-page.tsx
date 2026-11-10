import { FocusTemplate } from '@/components/templates/focus-template'
import { EmptyState } from '@/components/ui/empty-state'
import type { HuntReconciliationReader, HuntReconciliationScope } from '@/lib/hunts/reconciliation-reader'

const SOURCE_LABEL = { 'event-ticket': 'Event ticket', 'store-order': 'Store order' }
const STATUS_LABEL = { matched: 'Matched', pending: 'Pending', exception: 'Needs review' }

function formatAmount(amountMinor: number, currency: string): string {
  if (!Number.isSafeInteger(amountMinor) || !/^[A-Z]{3}$/.test(currency)) return 'Unavailable'
  const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'code' })
  const minorDigits = formatter.resolvedOptions().maximumFractionDigits ?? 2
  return formatter.format(amountMinor / 10 ** minorDigits)
}

export async function HuntReconciliationPage({
  scope,
  reader,
}: {
  /** The route authorizes this scope before rendering. An absent scope fails closed. */
  scope: HuntReconciliationScope | null
  reader: HuntReconciliationReader
}) {
  const rows = scope ? await reader(scope).catch(() => null) : null

  return (
    <FocusTemplate
      eyebrow="Frequency Hunts"
      title="Reconciliation"
      description="Check payment records against their sources and see what needs review."
      width="xl"
      adminBar={false}
    >
      {!scope ? (
        <EmptyState variant="permission" title="Access required" description="Sign in with permission to review these records." />
      ) : rows === null ? (
        <EmptyState variant="error" title="Records unavailable" description="Try again in a moment." />
      ) : rows.length === 0 ? (
        <EmptyState variant="no-results" title="No reconciliation records" description="Records in your scope will appear here." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-body-sm">
            <caption className="sr-only">Hunt reconciliation records</caption>
            <thead className="border-b border-border text-muted">
              <tr>
                <th scope="col" className="px-3 py-3">Source</th>
                <th scope="col" className="px-3 py-3">Amount</th>
                <th scope="col" className="px-3 py-3">Status</th>
                <th scope="col" className="px-3 py-3">Age</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index} className="border-b border-border">
                  <th scope="row" className="px-3 py-3 font-medium">
                    {SOURCE_LABEL[row.sourceType] ?? 'Unknown source'}
                    {/^[a-f0-9]{8,16}$/.test(row.sourceHash) && (
                      <span className="block font-mono text-meta text-muted">{row.sourceHash}</span>
                    )}
                  </th>
                  <td className="px-3 py-3">{formatAmount(row.amountMinor, row.currency)}</td>
                  <td className="px-3 py-3">{STATUS_LABEL[row.status] ?? 'Unknown status'}</td>
                  <td className="px-3 py-3">
                    {Number.isSafeInteger(row.ageMinutes) && row.ageMinutes >= 0 ? `${row.ageMinutes} min` : 'Unknown'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </FocusTemplate>
  )
}
