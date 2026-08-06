'use client'

import { useState } from 'react'
import { MultiImageUpload } from '@/components/ui/multi-image-upload'
import { buttonClasses } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input, Textarea } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { ACCESSIBILITY_TAGS, ADDRESS_PRECISIONS, AMENITIES, LAUNDRY_OPTIONS, PARKING_OPTIONS, PROPERTY_TYPES } from '@/lib/listings/types'
import { createHousingListingAction } from '@/app/(main)/marketplace/actions'

// The listing compose form (client) — hosts the photo gallery (MultiImageUpload,
// browser upload into the shared event-media bucket under the signer's own uid
// prefix) and serialises the ordered paths into a hidden field the server action
// reads. Everything else is native form controls so the server action owns
// validation. Connect-only: no payment, a member messages the host. Reused by the
// EDIT surface ([id]/edit): pass `initial` to prefill + a bound update `action`.

const LABEL = 'mb-1 block text-body-sm font-medium text-text'

/** Prefill values for EDIT mode — the base listing + housing extension, already merged
 *  by the edit page. Field-for-field with the form controls below; money is in dollars
 *  (what the inputs show), never cents. */
export interface HousingFormInitial {
  title: string
  listingType: string
  propertyType: string | null
  roomType: string | null
  sqft: number | null
  rentDollars: number | null
  depositDollars: number | null
  leaseMonths: number | null
  bedrooms: number | null
  bathrooms: number | null
  householdSize: number | null
  availableFrom: string | null
  neighborhood: string | null
  city: string | null
  amenities: string[]
  furnished: boolean
  utilitiesIncluded: boolean
  petsOk: boolean
  smokingOk: boolean
  cannabisOk: boolean
  // Tier B (ADR-867).
  parking: string | null
  laundry: string | null
  bathroomsShared: boolean
  moveInCostsDollars: number | null
  minStayMonths: number | null
  maxOccupants: number | null
  accessibility: string[]
  addressPrecision: string
  addressLine: string | null
  description: string | null
  images: string[]
}

export function HousingForm({
  initial,
  action,
}: {
  /** Prefill for edit mode; omitted on the compose surface. */
  initial?: HousingFormInitial
  /** A bound server action (edit mode). Defaults to the create action. */
  action?: (formData: FormData) => Promise<void>
} = {}) {
  const [images, setImages] = useState<string[]>(initial?.images ?? [])
  // The Privacy toggle: the street-address input only exists while 'exact' is picked,
  // so a coarser choice never carries a stale address in the submit.
  const [precision, setPrecision] = useState<string>(initial?.addressPrecision ?? 'city')

  return (
    <form action={action ?? createHousingListingAction} className="space-y-6">
      <div>
        <label htmlFor="title" className={LABEL}>
          Title
        </label>
        <Input
          id="title"
          name="title"
          required
          maxLength={120}
          defaultValue={initial?.title}
          placeholder="e.g. Sunny room in a 3-bed near the park"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="listing_type" className={LABEL}>
            Listing
          </label>
          <Select id="listing_type" name="listing_type" defaultValue={initial?.listingType ?? 'rental'}>
            <option value="rental">Rental to offer</option>
            <option value="sublet">Sublet to offer</option>
            <option value="roommate">Room with a roommate</option>
            <option value="roommate_wanted">Looking for a roommate</option>
            <option value="housing_wanted">Looking for a place</option>
          </Select>
        </div>
        <div>
          <label htmlFor="property_type" className={LABEL}>
            Property type
          </label>
          <Select id="property_type" name="property_type" defaultValue={initial?.propertyType ?? ''} emptyLabel="Not specified">
            {PROPERTY_TYPES.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="room_type" className={LABEL}>
            Space
          </label>
          <Select id="room_type" name="room_type" defaultValue={initial?.roomType ?? ''} emptyLabel="Not specified">
            <option value="private_room">Private room</option>
            <option value="shared_room">Shared room</option>
            <option value="entire_place">Entire place</option>
          </Select>
        </div>
        <div>
          <label htmlFor="sqft" className={LABEL}>
            Square feet (optional)
          </label>
          <Input
            id="sqft"
            name="sqft"
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            defaultValue={initial?.sqft ?? ''}
            placeholder="e.g. 850"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="rent" className={LABEL}>
            Rent (per month)
          </label>
          <Input id="rent" name="rent" type="number" min="0" step="1" inputMode="numeric" defaultValue={initial?.rentDollars ?? ''} placeholder="e.g. 1200" />
        </div>
        <div>
          <label htmlFor="deposit" className={LABEL}>
            Deposit (optional)
          </label>
          <Input id="deposit" name="deposit" type="number" min="0" step="1" inputMode="numeric" defaultValue={initial?.depositDollars ?? ''} placeholder="e.g. 1200" />
        </div>
        <div>
          <label htmlFor="lease_months" className={LABEL}>
            Lease (months)
          </label>
          <Input
            id="lease_months"
            name="lease_months"
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            defaultValue={initial?.leaseMonths ?? ''}
            placeholder="0 = month-to-month"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="bedrooms" className={LABEL}>
            Bedrooms (optional)
          </label>
          <Input id="bedrooms" name="bedrooms" type="number" min="0" step="1" inputMode="numeric" defaultValue={initial?.bedrooms ?? ''} placeholder="e.g. 2" />
        </div>
        <div>
          <label htmlFor="bathrooms" className={LABEL}>
            Bathrooms (optional)
          </label>
          <Input id="bathrooms" name="bathrooms" type="number" min="0" step="0.5" inputMode="decimal" defaultValue={initial?.bathrooms ?? ''} placeholder="e.g. 1.5" />
        </div>
        <div>
          <label htmlFor="household_size" className={LABEL}>
            People in the home (optional)
          </label>
          <Input
            id="household_size"
            name="household_size"
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            defaultValue={initial?.householdSize ?? ''}
            placeholder="e.g. 3"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="available_from" className={LABEL}>
            Available from (optional)
          </label>
          <Input id="available_from" name="available_from" type="date" defaultValue={initial?.availableFrom ?? ''} />
        </div>
      </div>

      {/* Tier B details (ADR-867): facts about the home a renter decides on. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="parking" className={LABEL}>
            Parking
          </label>
          <Select id="parking" name="parking" defaultValue={initial?.parking ?? ''} emptyLabel="Not specified">
            {PARKING_OPTIONS.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="laundry" className={LABEL}>
            Laundry
          </label>
          <Select id="laundry" name="laundry" defaultValue={initial?.laundry ?? ''} emptyLabel="Not specified">
            {LAUNDRY_OPTIONS.map((l) => (
              <option key={l.slug} value={l.slug}>
                {l.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="move_in_costs" className={LABEL}>
            Move-in costs (optional)
          </label>
          <Input
            id="move_in_costs"
            name="move_in_costs"
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            defaultValue={initial?.moveInCostsDollars ?? ''}
            placeholder="Total beyond the deposit"
          />
        </div>
        <div>
          <label htmlFor="min_stay_months" className={LABEL}>
            Minimum stay (months)
          </label>
          <Input
            id="min_stay_months"
            name="min_stay_months"
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            defaultValue={initial?.minStayMonths ?? ''}
            placeholder="e.g. 3"
          />
        </div>
        <div>
          <label htmlFor="max_occupants" className={LABEL}>
            Max occupants (optional)
          </label>
          <Input
            id="max_occupants"
            name="max_occupants"
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            defaultValue={initial?.maxOccupants ?? ''}
            placeholder="e.g. 2"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="neighborhood" className={LABEL}>
            Neighborhood (optional)
          </label>
          <Input id="neighborhood" name="neighborhood" defaultValue={initial?.neighborhood ?? ''} placeholder="e.g. North Park" />
        </div>
        <div>
          <label htmlFor="city" className={LABEL}>
            City
          </label>
          <Input id="city" name="city" defaultValue={initial?.city ?? ''} placeholder="Where is it?" />
        </div>
      </div>

      {/* Privacy (ADR-867): the member picks how much of the location the listing shows.
          The exact address only ever renders to signed-in members, and never reaches
          search engines, previews, or structured data. */}
      <fieldset>
        <legend className={LABEL}>Address privacy</legend>
        <p className="mb-2 text-meta text-subtle">
          Choose how much of the location shows on the listing.
        </p>
        <div className="space-y-2">
          {ADDRESS_PRECISIONS.map((p) => (
            <label key={p.slug} className="flex items-start gap-2 text-body-sm text-text">
              <input
                type="radio"
                name="address_precision"
                value={p.slug}
                checked={precision === p.slug}
                onChange={() => setPrecision(p.slug)}
                className="mt-0.5 h-4 w-4 border-border"
              />
              <span>
                <span className="font-medium">{p.label}</span>
                <span className="block text-meta text-subtle">{p.hint}</span>
              </span>
            </label>
          ))}
        </div>
        {precision === 'exact' && (
          <div className="mt-3">
            <label htmlFor="address_line" className={LABEL}>
              Street address
            </label>
            <Input
              id="address_line"
              name="address_line"
              maxLength={200}
              defaultValue={initial?.addressLine ?? ''}
              placeholder="e.g. 412 Maple St, Unit B"
            />
          </div>
        )}
      </fieldset>

      <fieldset>
        <legend className={LABEL}>Amenities</legend>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
          {AMENITIES.map((a) => (
            <Checkbox
              key={a.slug}
              name="amenities"
              value={a.slug}
              defaultChecked={initial?.amenities.includes(a.slug)}
              label={a.label}
            />
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className={LABEL}>Accessibility</legend>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
          {ACCESSIBILITY_TAGS.map((t) => (
            <Checkbox
              key={t.slug}
              name="accessibility"
              value={t.slug}
              defaultChecked={initial?.accessibility.includes(t.slug)}
              label={t.label}
            />
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className={LABEL}>House rules</legend>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
          <Checkbox name="furnished" defaultChecked={initial?.furnished} label="Furnished" />
          <Checkbox name="utilities_included" defaultChecked={initial?.utilitiesIncluded} label="Utilities included" />
          <Checkbox name="pets_ok" defaultChecked={initial?.petsOk} label="Pets welcome" />
          <Checkbox name="smoking_ok" defaultChecked={initial?.smokingOk} label="Smoking OK" />
          <Checkbox name="cannabis_ok" defaultChecked={initial?.cannabisOk} label="Cannabis friendly" />
          <Checkbox name="bathrooms_shared" defaultChecked={initial?.bathroomsShared} label="Shared bathroom" />
        </div>
      </fieldset>

      <div>
        <label htmlFor="description" className={LABEL}>
          Details
        </label>
        <Textarea
          id="description"
          name="description"
          rows={5}
          maxLength={2000}
          defaultValue={initial?.description ?? ''}
          placeholder="The place, the vibe, who'd be a good fit, what's included."
        />
      </div>

      <div>
        <MultiImageUpload
          loom
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
          {initial ? 'Save changes' : 'List housing'}
        </button>
      </div>
    </form>
  )
}
