import { Truck } from 'lucide-react'
import { buttonClasses } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import type { CommerceOrder } from '@/lib/commerce/orders'
import type { FulfillmentStatus } from '@/lib/commerce/types'
import { FULFILLMENT_LABEL, FULFILLMENT_STEP_LABEL, nextFulfillmentStep } from '@/lib/commerce/fulfilment-state'

// THE SELLER'S DOOR (LIVE-606, ADR-1575). One control, rendered on every surface that lists an order
// for its seller (the Space Shop Orders tab, the maker console, the operator's Orders page): where
// the order stands, the carrier and tracking once there is one, and the NEXT step as a button. The
// step it offers comes from nextFulfillmentStep, so a digital order is delivered, never shipped,
// and a walked ladder offers nothing. Server component: the form posts to the bound server action
// the parent verified its caller for, so this file decides nothing about who may act.
// On a split order each seller's share has its own control (LIVE-705): the parent hands in the
// share's view (its lines, its step) and, on the operator's page, a label naming whose share it is.

/** A server action already bound to its surface and order: `(status, formData)`. */
export type FulfilmentAction = (status: FulfillmentStatus, formData: FormData) => Promise<void>

export function OrderFulfilmentControl({
  order,
  action,
  readOnly = false,
  label,
}: {
  order: CommerceOrder
  /** Omit (or pass readOnly) to show the state without a door, e.g. a staff preview. */
  action?: FulfilmentAction
  readOnly?: boolean
  /** Whose share this is, when one order carries a control per seller (LIVE-705). */
  label?: string
}) {
  // A service, booking, ticket or Journey is never sent; a refunded or failed order has nothing to send.
  if (!order.needsFulfilment) return null
  if (order.status !== 'paid' && order.status !== 'fulfilled') return null

  const f = order.fulfilment
  const next = action && !readOnly ? nextFulfillmentStep(order.fulfillmentStatus, { ships: order.ships }) : null

  return (
    <div data-order-fulfilment-control className="mt-3 border-t border-border pt-3">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm">
        <Truck className="h-4 w-4 shrink-0 text-muted" aria-hidden />
        {label && <span className="text-muted">{label}:</span>}
        <span className="font-medium text-text">{FULFILLMENT_LABEL[order.fulfillmentStatus]}</span>
        {f.carrier && <span className="text-muted">via {f.carrier}</span>}
        {f.tracking &&
          (f.trackingUrl ? (
            <a href={f.trackingUrl} target="_blank" rel="noreferrer" className="text-primary underline-offset-2 hover:underline">
              {f.tracking}
            </a>
          ) : (
            <span className="text-muted">{f.tracking}</span>
          ))}
      </p>
      {next && (
        // On a phone the door is a stack, full width (LIVE-704): the two fields and the step button each
        // take the row, so "Mark shipped" is a thumb-wide target under the fields instead of a small button
        // wrapped beside a 208px input. From sm the row sits side by side as before.
        <form action={action!.bind(null, next)} className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
          {next === 'shipped' && (
            <>
              <label className="flex flex-col gap-1 text-meta text-muted">
                Carrier
                <Input
                  name="carrier"
                  defaultValue={f.carrier ?? ''}
                  placeholder="USPS, UPS, FedEx"
                  maxLength={60}
                  className="w-full text-body-sm sm:w-40"
                />
              </label>
              <label className="flex flex-col gap-1 text-meta text-muted">
                Tracking number
                <Input name="tracking" defaultValue={f.tracking ?? ''} maxLength={120} className="w-full text-body-sm sm:w-52" />
              </label>
            </>
          )}
          <button type="submit" className={buttonClasses('secondary', 'sm', 'w-full sm:w-auto')}>
            {FULFILLMENT_STEP_LABEL[next]}
          </button>
        </form>
      )}
    </div>
  )
}
