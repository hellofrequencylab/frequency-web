'use client'

import { useState } from 'react'
import { MultiImageUpload } from '@/components/ui/multi-image-upload'
import { buttonClasses } from '@/components/ui/button'
import { AMENITIES, PROPERTY_TYPES } from '@/lib/listings/types'
import { createHousingListingAction } from '../../actions'

// The listing compose form (client) — hosts the photo gallery (MultiImageUpload,
// browser upload into the shared event-media bucket under the signer's own uid
// prefix) and serialises the ordered paths into a hidden field the server action
// reads. Everything else is native form controls so the server action owns
// validation. Connect-only: no payment, a member messages the host.

const FIELD =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-primary'
const LABEL = 'mb-1 block text-sm font-medium text-text'
const CHECK = 'flex items-center gap-2 text-sm text-text'

export function HousingForm() {
  const [images, setImages] = useState<string[]>([])

  return (
    <form action={createHousingListingAction} className="space-y-6">
      <div>
        <label htmlFor="title" className={LABEL}>
          Title
        </label>
        <input
          id="title"
          name="title"
          required
          maxLength={120}
          className={FIELD}
          placeholder="e.g. Sunny room in a 3-bed near the park"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="listing_type" className={LABEL}>
            Listing
          </label>
          <select id="listing_type" name="listing_type" className={FIELD} defaultValue="rental">
            <option value="rental">Rental to offer</option>
            <option value="sublet">Sublet to offer</option>
            <option value="roommate">Room with a roommate</option>
            <option value="roommate_wanted">Looking for a roommate</option>
            <option value="housing_wanted">Looking for a place</option>
          </select>
        </div>
        <div>
          <label htmlFor="property_type" className={LABEL}>
            Property type
          </label>
          <select id="property_type" name="property_type" className={FIELD} defaultValue="">
            <option value="">Not specified</option>
            {PROPERTY_TYPES.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        <div>
          <label htmlFor="sqft" className={LABEL}>
            Square feet (optional)
          </label>
          <input
            id="sqft"
            name="sqft"
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            className={FIELD}
            placeholder="e.g. 850"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="rent" className={LABEL}>
            Rent (per month)
          </label>
          <input id="rent" name="rent" type="number" min="0" step="1" inputMode="numeric" className={FIELD} placeholder="e.g. 1200" />
        </div>
        <div>
          <label htmlFor="deposit" className={LABEL}>
            Deposit (optional)
          </label>
          <input id="deposit" name="deposit" type="number" min="0" step="1" inputMode="numeric" className={FIELD} placeholder="e.g. 1200" />
        </div>
        <div>
          <label htmlFor="lease_months" className={LABEL}>
            Lease (months)
          </label>
          <input
            id="lease_months"
            name="lease_months"
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            className={FIELD}
            placeholder="0 = month-to-month"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="bedrooms" className={LABEL}>
            Bedrooms (optional)
          </label>
          <input id="bedrooms" name="bedrooms" type="number" min="0" step="1" inputMode="numeric" className={FIELD} placeholder="e.g. 2" />
        </div>
        <div>
          <label htmlFor="bathrooms" className={LABEL}>
            Bathrooms (optional)
          </label>
          <input id="bathrooms" name="bathrooms" type="number" min="0" step="0.5" inputMode="decimal" className={FIELD} placeholder="e.g. 1.5" />
        </div>
        <div>
          <label htmlFor="household_size" className={LABEL}>
            People in the home (optional)
          </label>
          <input
            id="household_size"
            name="household_size"
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            className={FIELD}
            placeholder="e.g. 3"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="available_from" className={LABEL}>
            Available from (optional)
          </label>
          <input id="available_from" name="available_from" type="date" className={FIELD} />
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

      <fieldset>
        <legend className={LABEL}>Amenities</legend>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
          {AMENITIES.map((a) => (
            <label key={a.slug} className={CHECK}>
              <input type="checkbox" name="amenities" value={a.slug} className="h-4 w-4 rounded border-border" />
              {a.label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className={LABEL}>House rules</legend>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
          <label className={CHECK}>
            <input type="checkbox" name="furnished" className="h-4 w-4 rounded border-border" />
            Furnished
          </label>
          <label className={CHECK}>
            <input type="checkbox" name="utilities_included" className="h-4 w-4 rounded border-border" />
            Utilities included
          </label>
          <label className={CHECK}>
            <input type="checkbox" name="pets_ok" className="h-4 w-4 rounded border-border" />
            Pets welcome
          </label>
          <label className={CHECK}>
            <input type="checkbox" name="smoking_ok" className="h-4 w-4 rounded border-border" />
            Smoking OK
          </label>
          <label className={CHECK}>
            <input type="checkbox" name="cannabis_ok" className="h-4 w-4 rounded border-border" />
            Cannabis friendly
          </label>
        </div>
      </fieldset>

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

      <div>
        <MultiImageUpload
          value={images}
          onChange={setImages}
          label="Photos"
          folder="housing"
          max={6}
          reorderable
          hint="Add up to 6 photos. The first one is the cover. Drag to reorder."
        />
        <input type="hidden" name="images" value={JSON.stringify(images)} />
      </div>

      <div className="flex justify-end">
        <button type="submit" className={buttonClasses('primary', 'md')}>
          List housing
        </button>
      </div>
    </form>
  )
}
