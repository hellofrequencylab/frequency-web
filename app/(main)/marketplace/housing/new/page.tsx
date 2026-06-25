import { redirect } from 'next/navigation'
import { FocusTemplate } from '@/components/templates'
import { buttonClasses } from '@/components/ui/button'
import { getMyProfileId } from '@/lib/auth'
import { createHousingListingAction } from '../../actions'

// List housing — a centered compose surface (Focus, no rail). Connect-only: no rent is
// processed in-app, a member messages you to arrange it. Roommate listings opt into the
// resonance match on the seeker side; this is the listing half.

export const metadata = { title: 'List housing' }

const FIELD =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-primary'
const LABEL = 'mb-1 block text-sm font-medium text-text'

export default async function NewHousingPage() {
  const viewerProfileId = await getMyProfileId()
  if (!viewerProfileId) redirect('/sign-in?next=/marketplace/housing/new')

  return (
    <FocusTemplate
      title="List housing"
      description="A rental, a sublet, or a room with a roommate. No fees and no payment to set up. Members reach you by message."
      back={{ href: '/marketplace/housing', label: 'Housing' }}
    >
      <form action={createHousingListingAction} className="space-y-6">
        <div>
          <label htmlFor="title" className={LABEL}>
            Title
          </label>
          <input id="title" name="title" required maxLength={120} className={FIELD} placeholder="e.g. Sunny room in a 3-bed near the park" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="listing_type" className={LABEL}>
              Type
            </label>
            <select id="listing_type" name="listing_type" className={FIELD} defaultValue="rental">
              <option value="rental">Rental</option>
              <option value="roommate">Roommate</option>
              <option value="sublet">Sublet</option>
            </select>
          </div>
          <div>
            <label htmlFor="room_type" className={LABEL}>
              Space
            </label>
            <select id="room_type" name="room_type" className={FIELD} defaultValue="">
              <option value="">Not specified</option>
              <option value="private_room">Private room</option>
              <option value="shared_room">Shared room</option>
              <option value="entire_place">Entire place</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="rent" className={LABEL}>
              Rent (per month, optional)
            </label>
            <input id="rent" name="rent" type="number" min="0" step="1" inputMode="numeric" className={FIELD} placeholder="e.g. 1200" />
          </div>
          <div>
            <label htmlFor="bedrooms" className={LABEL}>
              Bedrooms (optional)
            </label>
            <input id="bedrooms" name="bedrooms" type="number" min="0" step="1" inputMode="numeric" className={FIELD} placeholder="e.g. 2" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="neighborhood" className={LABEL}>
              Neighborhood (optional)
            </label>
            <input id="neighborhood" name="neighborhood" className={FIELD} placeholder="e.g. North Park" />
          </div>
          <div>
            <label htmlFor="city" className={LABEL}>
              City
            </label>
            <input id="city" name="city" className={FIELD} placeholder="Where is it?" />
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
            placeholder="The place, the vibe, who'd be a good fit, what's included."
          />
        </div>
        <div className="flex justify-end">
          <button type="submit" className={buttonClasses('primary', 'md')}>
            List housing
          </button>
        </div>
      </form>
    </FocusTemplate>
  )
}
