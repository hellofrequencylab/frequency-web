import { redirect } from 'next/navigation'
import { FocusTemplate } from '@/components/templates'
import { buttonClasses } from '@/components/ui/button'
import { getMyProfileId } from '@/lib/auth'
import { createListingAction } from '../actions'

// Post a listing (General marketplace) — a centered compose surface (Focus, no rail).
// Connect-only: no price processing, buyers reach you by message.

export const metadata = { title: 'Post a listing' }

const FIELD =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-primary'
const LABEL = 'mb-1 block text-sm font-medium text-text'

export default async function NewListingPage() {
  const viewerProfileId = await getMyProfileId()
  if (!viewerProfileId) redirect('/sign-in?next=/marketplace/new')

  return (
    <FocusTemplate
      title="Post a listing"
      description="Sell it, lend it, or give it away. Buyers reach you by message, with no fees and no payment to set up."
      back={{ href: '/marketplace', label: 'Marketplace' }}
    >
      <form action={createListingAction} className="space-y-6">
        <input type="hidden" name="vertical" value="market" />
        <div>
          <label htmlFor="title" className={LABEL}>
            What is it?
          </label>
          <input id="title" name="title" required maxLength={120} className={FIELD} placeholder="e.g. Mid-century armchair" />
        </div>
        <div>
          <label htmlFor="kind" className={LABEL}>
            Type
          </label>
          <select id="kind" name="kind" className={FIELD} defaultValue="offer">
            <option value="offer">For sale</option>
            <option value="free">Free</option>
            <option value="lend">To lend</option>
            <option value="request">Looking for</option>
          </select>
        </div>
        <div>
          <label htmlFor="price_note" className={LABEL}>
            Price (optional)
          </label>
          <input id="price_note" name="price_note" maxLength={80} className={FIELD} placeholder="e.g. $40 or best offer" />
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
            placeholder="Condition, pickup, anything a buyer should know."
          />
        </div>
        <div>
          <label htmlFor="city" className={LABEL}>
            Neighborhood or city
          </label>
          <input id="city" name="city" className={FIELD} placeholder="Where is it?" />
        </div>
        <div className="flex justify-end gap-3">
          <button type="submit" className={buttonClasses('primary', 'md')}>
            Post listing
          </button>
        </div>
      </form>
    </FocusTemplate>
  )
}
