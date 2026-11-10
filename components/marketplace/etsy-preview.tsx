'use client'

import { Field } from '@/components/ui/field'
import { Select } from '@/components/ui/select'

type ShippingOption = Readonly<{ id: string; label: string; priceLabel: string; detail?: string }>

export function MarketplaceShippingOptions({ options }: { options: readonly ShippingOption[] }) {
  return (
    <section aria-label="Shipping options" className="space-y-2">
      <h2 className="text-lead font-semibold">Shipping options</h2>
      {options.length === 0 ? (
        <p className="text-body-sm text-muted">Shipping options are unavailable.</p>
      ) : (
        <ul className="divide-y divide-border rounded-card border border-border bg-surface">
          {options.map(({ id, label, priceLabel, detail }) => (
            <li key={id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3">
              <div className="min-w-0">
                <p className="text-body font-medium">{label}</p>
                {detail && <p className="text-body-sm text-muted">{detail}</p>}
              </div>
              <span className="text-body-sm font-medium">{priceLabel}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

type FacetId = 'category' | 'tag' | 'condition' | 'price' | 'sellerType'
type Facet = Readonly<{
  id: FacetId
  label: string
  options: readonly { value: string; label: string }[]
}>

const SORT_OPTIONS = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'newest', label: 'Newest' },
  { value: 'price-low', label: 'Price, low to high' },
  { value: 'price-high', label: 'Price, high to low' },
] as const

type MarketplaceSort = (typeof SORT_OPTIONS)[number]['value']

export function MarketplaceDiscoveryControls({ facets, values, sort, onFacetChange, onSortChange }: {
  facets: readonly Facet[]
  values: Readonly<Partial<Record<FacetId, string>>>
  sort: MarketplaceSort
  onFacetChange: (id: FacetId, value: string) => void
  onSortChange: (sort: MarketplaceSort) => void
}) {
  return (
    <div role="group" aria-label="Market filters and sort" className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {facets.map(({ id, label, options }) => (
        <Field key={id} label={label}>
          <Select
            emptyLabel="Any"
            options={[...options]}
            value={values[id] ?? ''}
            tone={values[id] ? 'active' : 'default'}
            onChange={(event) => onFacetChange(id, event.currentTarget.value)}
          />
        </Field>
      ))}
      <Field label="Sort by">
        <Select
          options={[...SORT_OPTIONS]}
          value={sort}
          onChange={(event) => {
            const selection = SORT_OPTIONS.find(({ value }) => value === event.currentTarget.value)
            if (selection) onSortChange(selection.value)
          }}
        />
      </Field>
    </div>
  )
}
