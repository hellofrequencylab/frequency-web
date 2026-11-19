import { Truck } from 'lucide-react'
import { buttonClasses } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { listSpaceShippingProfiles } from '@/lib/commerce/shipping-profiles-store'
import { EVERYWHERE, type ShippingProfile, type ShippingRate } from '@/lib/commerce/shipping-profiles'
import { SHIP_TO_COUNTRIES } from '@/lib/commerce/shipping'
import type { CommerceProduct } from '@/lib/commerce/types'
import { saveShippingProfileAction } from './shop-actions'

// Shipping profiles on the Catalog tab of the Shop console (DEF-ETSY P3). A seller names a profile, says how
// many days they take to send an order, sets a price for the first item and each extra item by place, and
// picks which physical listings ship with it. The caller renders this only while COMMERCE_CART_ENABLED is set
// and the viewer can write; the action re-checks both. Server-action forms, no client code. No em or en dashes.

const LABEL = 'mb-1 block text-body-sm font-medium text-text'
/** Blank rate rows offered under the saved ones, so a seller can add places without a client island. */
const BLANK_ROWS = 2

const dollars = (cents: number) => (cents / 100).toFixed(2)
const REGION_OPTIONS = [{ value: EVERYWHERE, label: 'Everywhere else' }, ...SHIP_TO_COUNTRIES.map((c) => ({ value: c, label: c }))]

function RateRow({ rate, index }: { rate: ShippingRate | null; index: number }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <Select
        name="rateRegion"
        aria-label={`Place ${index + 1}`}
        defaultValue={rate?.region ?? EVERYWHERE}
        options={REGION_OPTIONS}
      />
      <Input
        name="rateFirst"
        aria-label={`First item, place ${index + 1}`}
        inputMode="decimal"
        placeholder="First item"
        defaultValue={rate ? dollars(rate.firstCents) : ''}
      />
      <Input
        name="rateAdditional"
        aria-label={`Each extra item, place ${index + 1}`}
        inputMode="decimal"
        placeholder="Each extra"
        defaultValue={rate ? dollars(rate.additionalCents) : ''}
      />
    </div>
  )
}

function ProfileForm({
  slug,
  profile,
  items,
  attached,
}: {
  slug: string
  profile: ShippingProfile | null
  items: CommerceProduct[]
  attached: ReadonlyMap<string, string>
}) {
  const key = profile?.id ?? 'new'
  const rows: (ShippingRate | null)[] = [...(profile?.rates ?? []), ...Array.from({ length: BLANK_ROWS }, () => null)]
  return (
    <form action={saveShippingProfileAction.bind(null, slug, profile?.id ?? null)} className="mt-3 space-y-4">
      <div>
        <label htmlFor={`ship-name-${key}`} className={LABEL}>
          Profile name
        </label>
        <Input id={`ship-name-${key}`} name="name" required maxLength={80} defaultValue={profile?.name ?? ''} placeholder="Standard" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`ship-min-${key}`} className={LABEL}>
            Ships in at least (days)
          </label>
          <Input id={`ship-min-${key}`} name="processingDaysMin" type="number" min={0} max={60} defaultValue={profile?.processingDaysMin ?? 1} />
        </div>
        <div>
          <label htmlFor={`ship-max-${key}`} className={LABEL}>
            And at most (days)
          </label>
          <Input id={`ship-max-${key}`} name="processingDaysMax" type="number" min={0} max={60} defaultValue={profile?.processingDaysMax ?? 3} />
        </div>
      </div>
      <fieldset className="space-y-2">
        <legend className={LABEL}>Rates in dollars</legend>
        <p className="text-meta text-subtle">
          The first item pays the first price, and each extra item from you pays the second. Leave a row blank to skip it.
        </p>
        {rows.map((rate, i) => (
          <RateRow key={i} rate={rate} index={i} />
        ))}
      </fieldset>
      {items.length > 0 ? (
        <fieldset className="space-y-1">
          <legend className={LABEL}>Listings that ship with this profile</legend>
          {items.map((p) => (
            <Checkbox
              key={p.id}
              name="productIds"
              value={p.id}
              defaultChecked={profile ? attached.get(p.id) === profile.id : false}
              label={p.title}
              wrapperClassName="flex"
            />
          ))}
        </fieldset>
      ) : null}
      <div className="flex justify-end">
        <button type="submit" className={buttonClasses('primary', 'sm')}>
          Save shipping profile
        </button>
      </div>
    </form>
  )
}

export async function ShippingProfilesSection({ slug, spaceId, items }: { slug: string; spaceId: string; items: CommerceProduct[] }) {
  let data: Awaited<ReturnType<typeof listSpaceShippingProfiles>>
  try {
    data = await listSpaceShippingProfiles(spaceId)
  } catch (err) {
    console.error('[shipping] could not load shipping profiles', { spaceId, err })
    return <p className="text-body-sm text-muted">Shipping profiles could not load. Refresh to try again.</p>
  }
  const physical = items.filter((p) => p.productKind === 'physical')
  return (
    <section className="space-y-3" aria-labelledby="shipping-profiles-heading">
      <h2 id="shipping-profiles-heading" className="flex items-center gap-2 text-body font-semibold text-text">
        <Truck className="h-4 w-4" aria-hidden />
        Shipping
      </h2>
      <p className="text-meta text-muted">Set your shipping rates once and choose which listings use them.</p>
      {data.profiles.map((profile) => (
        <details key={profile.id} className="rounded-card border border-border bg-surface p-4">
          <summary className="cursor-pointer text-body-sm font-semibold text-text">
            {profile.name}
            <span className="ml-2 font-normal text-muted">
              Ships in {profile.processingDaysMin} to {profile.processingDaysMax} days
            </span>
          </summary>
          <ProfileForm slug={slug} profile={profile} items={physical} attached={data.attached} />
        </details>
      ))}
      <details className="rounded-card border border-border bg-surface p-4">
        <summary className="cursor-pointer text-body-sm font-semibold text-text">+ New shipping profile</summary>
        <ProfileForm slug={slug} profile={null} items={physical} attached={data.attached} />
      </details>
    </section>
  )
}
