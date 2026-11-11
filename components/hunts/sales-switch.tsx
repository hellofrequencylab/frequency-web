import { Button } from '@/components/ui/button'
import { Input, labelClasses } from '@/components/ui/field'
import { setHuntSalesAction } from '@/app/(main)/hunts/finance/actions'

/**
 * The Hunt sales kill switch (FH-036S). Closing stops NEW pass sales only; payment, refund and
 * reconciliation go on. Closing needs a reason, and every change is written to the audit table.
 */
export function HuntSalesSwitch({ open }: { open: boolean }) {
  return (
    <section aria-labelledby="hunt-sales-switch" className="mt-8 border-t border-border pt-6">
      <h2 id="hunt-sales-switch" className="text-body font-medium">
        New pass sales are {open ? 'open' : 'paused'}
      </h2>
      <p className="mt-1 text-body-sm text-muted">Pausing stops new sales only. Payments, refunds and reconciliation go on.</p>
      <form action={setHuntSalesAction} className="mt-4 flex flex-wrap items-end gap-3">
        <input type="hidden" name="open" value={open ? '0' : '1'} />
        {open && (
          <div className="grow">
            <label htmlFor="hunt-sales-reason" className={labelClasses}>Reason</label>
            <Input id="hunt-sales-reason" name="reason" required maxLength={300} />
          </div>
        )}
        <Button type="submit" variant={open ? 'warningOutline' : 'primary'}>
          {open ? 'Pause new sales' : 'Reopen sales'}
        </Button>
      </form>
    </section>
  )
}
