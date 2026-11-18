import Link from 'next/link'
import { Field } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { COMMERCE_CATEGORIES } from '@/lib/commerce/categories'
import {
  MARKET_CONDITIONS,
  MARKET_PRICE_BANDS,
  MARKET_SELLER_TYPES,
  hasMarketFacets,
  marketHref,
  type MarketFacets,
} from '@/lib/commerce/market-facets'
import type { MarketGroup } from '@/lib/commerce/types'

// THE MARKET FILTERS (DEF-ETSY P4). A plain GET form, so the filters live in the URL, work without
// JavaScript, and a filtered Market is a link someone can share. Same folded "More filters" well as
// Housing (fqm-more-filters), kit Field and Select inside it. The page reads the params back through
// lib/commerce/market-facets.ts parseMarketFacets, which drops anything it does not know.

export function MarketFacetForm({ group, facets }: { group: MarketGroup | null; facets: MarketFacets }) {
  const active = hasMarketFacets(facets)
  return (
    <details className="fqm-more-filters" open={active}>
      <summary className="chip">{active ? 'Filters on' : 'More filters'}</summary>
      <form method="get" action="/market" className="fqm-filter-form" aria-label="Filter the Market">
        {group && <input type="hidden" name="group" value={group} />}
        <Field label="Category">
          <Select name="category" emptyLabel="Any" defaultValue={facets.category ?? ''} tone={facets.category ? 'active' : 'default'}>
            {COMMERCE_CATEGORIES.map((c) => (
              <optgroup key={c.value} label={c.label}>
                <option value={c.value}>All of {c.label}</option>
                {c.subcategories.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>
        <Field label="Price">
          <Select
            name="price"
            emptyLabel="Any"
            options={MARKET_PRICE_BANDS.map((b) => ({ value: b.value, label: b.label }))}
            defaultValue={facets.price ?? ''}
            tone={facets.price ? 'active' : 'default'}
          />
        </Field>
        <Field label="Condition">
          <Select
            name="condition"
            emptyLabel="Any"
            options={MARKET_CONDITIONS.map((c) => ({ value: c.value, label: c.label }))}
            defaultValue={facets.condition ?? ''}
            tone={facets.condition ? 'active' : 'default'}
          />
        </Field>
        <Field label="Sold by">
          <Select
            name="seller"
            emptyLabel="Anyone"
            options={MARKET_SELLER_TYPES.map((s) => ({ value: s.value, label: s.label }))}
            defaultValue={facets.seller ?? ''}
            tone={facets.seller ? 'active' : 'default'}
          />
        </Field>
        <div className="row wrap">
          <button type="submit" className="btn pa sm">
            Apply filters
          </button>
          {active && (
            <Link className="btn sm" href={marketHref(group)}>
              Clear
            </Link>
          )}
        </div>
      </form>
    </details>
  )
}
