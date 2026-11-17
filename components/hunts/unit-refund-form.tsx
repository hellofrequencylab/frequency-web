import { Button } from '@/components/ui/button'
import { Input, labelClasses } from '@/components/ui/field'
import { revokeOrderUnitsAction } from '@/app/(main)/hunts/finance/actions'

/**
 * Record which units of one store order line a partial refund covered (FH-038S). The provider reports a
 * partial refund by amount alone, and an amount never names a unit, so a person does: only that many units
 * of that line lose their Hunt benefit, unused ones first. No money moves here.
 */
export function HuntUnitRefundForm() {
  return (
    <section aria-labelledby="hunt-unit-refund" className="mt-8 border-t border-border pt-6">
      <h2 id="hunt-unit-refund" className="text-body font-medium">Record a refunded unit</h2>
      <p className="mt-1 text-body-sm text-muted">
        For a partial refund on a store order. Only the units you count here lose their Hunt benefit. The refund itself stays with the store and the payment provider.
      </p>
      <form action={revokeOrderUnitsAction} className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="hunt-unit-order" className={labelClasses}>Order ID</label>
          <Input id="hunt-unit-order" name="orderId" required maxLength={36} />
        </div>
        <div>
          <label htmlFor="hunt-unit-line" className={labelClasses}>Order line ID</label>
          <Input id="hunt-unit-line" name="lineId" required maxLength={36} />
        </div>
        <div>
          <label htmlFor="hunt-unit-count" className={labelClasses}>Units refunded</label>
          <Input id="hunt-unit-count" name="count" type="number" min={1} max={99} defaultValue={1} required />
        </div>
        <div>
          <label htmlFor="hunt-unit-ref" className={labelClasses}>Refund reference</label>
          <Input id="hunt-unit-ref" name="ref" required maxLength={120} />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" variant="warningOutline">Revoke those units</Button>
        </div>
      </form>
    </section>
  )
}
