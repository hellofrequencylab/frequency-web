'use client'

import type { BillingInterval } from '@/lib/billing/pricing-keys'
import { Button } from '@/components/ui/button'

// THE MONTHLY / YEARLY SWITCH for the in-app plan buttons (LIVE-990). /pricing has advertised a yearly
// price (two months free, ANNUAL_MONTHS_FREE) since the catalog shipped both intervals, and the
// checkout has accepted `interval: 'year'` the whole time, but every in-app button sent 'month', so the
// yearly deal could not be bought in the product. This is the one control that picks the interval; the
// plan ladder and the Go Business card each hold their own copy of the state and pass it down to the
// button that starts the checkout. A labelled radiogroup, like the marketing page's PlanPeriodSwitch,
// drawn with the Button primitive (primary when picked, ghost at rest). No em dashes (CONTENT-VOICE §10).

export const YEARLY_NOTE = 'Yearly is two months free.'

export function BillingIntervalSwitch({
  value,
  onChange,
  disabled = false,
}: {
  value: BillingInterval
  onChange: (next: BillingInterval) => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="radiogroup" aria-label="Billing period" className="inline-flex rounded-control border border-border p-0.5">
        {(['month', 'year'] as const).map((p) => {
          const on = value === p
          return (
            <Button
              key={p}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={disabled}
              onClick={() => onChange(p)}
              variant={on ? 'primary' : 'ghost'}
              size="xs"
            >
              {p === 'month' ? 'Monthly' : 'Yearly'}
            </Button>
          )
        })}
      </div>
      <span className="text-2xs text-muted">{YEARLY_NOTE}</span>
    </div>
  )
}
