import { redirect } from 'next/navigation'
import { FocusTemplate } from '@/components/templates'
import { buttonClasses } from '@/components/ui/button'
import { getMyProfileId } from '@/lib/auth'
import { createMakerProductAction } from '../../marketplace/commerce-actions'

// Open a maker storefront — list your first piece. Creating a product is free and lists it
// to browse immediately. Getting PAID needs a connected payout account (Stripe Connect) and
// billing enabled; until then a buyer sees "payments aren't on yet" at checkout.

export const metadata = { title: 'Open a storefront' }

const FIELD =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-primary'
const LABEL = 'mb-1 block text-sm font-medium text-text'

export default async function MakerSellPage() {
  const viewerProfileId = await getMyProfileId()
  if (!viewerProfileId) redirect('/sign-in?next=/market/sell')

  return (
    <FocusTemplate
      title="Open a storefront"
      description="List a piece and it shows up in Makers right away. Set up payouts later to start taking orders."
      back={{ href: '/market', label: 'Market' }}
    >
      <form action={createMakerProductAction} className="space-y-6">
        <div>
          <label htmlFor="title" className={LABEL}>
            What are you selling?
          </label>
          <input id="title" name="title" required maxLength={200} className={FIELD} placeholder="e.g. Hand-thrown ceramic mug" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="price" className={LABEL}>
              Price (USD)
            </label>
            <input id="price" name="price" type="number" min="0" step="0.01" inputMode="decimal" required className={FIELD} placeholder="e.g. 28" />
          </div>
          <div>
            <label htmlFor="category" className={LABEL}>
              Category (optional)
            </label>
            <input id="category" name="category" maxLength={60} className={FIELD} placeholder="e.g. Ceramics" />
          </div>
        </div>
        <div>
          <label htmlFor="description" className={LABEL}>
            Details
          </label>
          <textarea
            id="description"
            name="description"
            rows={5}
            maxLength={2000}
            className={FIELD}
            placeholder="Materials, size, how it's made, shipping or pickup."
          />
        </div>
        <p className="text-xs text-subtle">
          Payouts run on Stripe Connect, so the money goes straight to you. Set up a payout account
          before your first sale; the platform fee stays low.
        </p>
        <div className="flex justify-end">
          <button type="submit" className={buttonClasses('primary', 'md')}>
            List it
          </button>
        </div>
      </form>
    </FocusTemplate>
  )
}
