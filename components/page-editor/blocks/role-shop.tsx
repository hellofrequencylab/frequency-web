'use client'

import { useMemo, useState } from 'react'
import { Select } from '@/components/ui/select'

// THE SHOP ROLE'S SORTING LIST (LIVE-2517). With the Shop block's `filters` switch on, the product list is this one client piece: a tab
// per category (All first, then each category in the order the products name it), the count of what shows, and a sort by price. The
// items arrive already resolved on the server (links through the site's link map, photos through the safe-image check), so this only
// reorders what the block would have drawn. Markup is the role contract (`data-part` hooks, no theme class), the same item shape as the
// server list, so every theme dresses it from role-blocks-css. With the switch off the block never loads this file.

export type RoleShopItem = {
  name: string
  price: string
  badge: string
  detail: string
  category: string
  image: string | null
  alt: string
  focus: string | null
  href: string | null
}

const SORTS = ['Featured', 'Price: low to high', 'Price: high to low'] as const
type Sort = (typeof SORTS)[number]
const ALL = 'All'

/** A price as a number for sorting ("$140" is 140); a price with no number sorts last. */
const amount = (price: string) => {
  const n = Number.parseFloat(price.replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY
}

export function RoleShopGrid({ items, card }: { items: RoleShopItem[]; card: boolean }) {
  const [tab, setTab] = useState<string>(ALL)
  const [sort, setSort] = useState<Sort>('Featured')
  const tabs = useMemo(() => [ALL, ...Array.from(new Set(items.map((i) => i.category).filter(Boolean)))], [items])
  const shown = useMemo(() => {
    const list = items.filter((i) => tab === ALL || i.category === tab)
    if (sort === 'Featured') return list
    const dir = sort === 'Price: low to high' ? 1 : -1
    return [...list].sort((a, b) => (amount(a.price) - amount(b.price)) * dir)
  }, [items, tab, sort])
  return (
    <>
      <div data-part="toolbar">
        {tabs.length > 2 && (
          <div data-part="tabs" role="group" aria-label="Show">
            {tabs.map((t) => (
              <button key={t} type="button" data-part="tab" aria-pressed={tab === t} onClick={() => setTab(t)}>{t}</button>
            ))}
          </div>
        )}
        <div data-part="sorter">
          <span data-part="count" aria-live="polite">{shown.length} {shown.length === 1 ? 'piece' : 'pieces'}</span>
          <Select data-part="input" aria-label="Sort" options={SORTS} value={sort} onChange={(e) => setSort(e.target.value as Sort)} />
        </div>
      </div>
      <ul data-part="list">
        {shown.map((s) => (
          <li key={`${s.name}:${s.price}:${s.image}`} data-part="item" data-card={card ? '' : undefined}>
            {s.image && (
              // eslint-disable-next-line @next/next/no-img-element -- owner photo on an arbitrary host
              <figure data-part="media"><img src={s.image} alt={s.alt} loading="lazy" style={s.focus ? { objectPosition: s.focus } : undefined} /></figure>
            )}
            <div data-part="text">
              {s.badge && <span data-part="badge">{s.badge}</span>}
              <h3 data-part="name">{s.href ? <a href={s.href} {...(/^https?:\/\//.test(s.href) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{s.name}</a> : s.name}</h3>
              {s.detail && <p data-part="meta">{s.detail}</p>}
            </div>
            {s.price && <span data-part="price">{s.price}</span>}
          </li>
        ))}
      </ul>
    </>
  )
}
