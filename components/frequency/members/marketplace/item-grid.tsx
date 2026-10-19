'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { FqIcon } from '@/components/frequency/icon'
import { distanceKm } from '@/lib/distance'
import { getBrowserPosition } from '@/lib/geo-browser'
import { Input } from '@/components/ui/field'

// THE MARKETPLACE GRID, IN THE KIT (templates/members/Marketplace.html: four-up portrait cards, the
// title and price on one line, "who · how far" under it, one button). The DAWN pages' instant search
// and Near me are kept and drawn in the kit's row: the find pill filters every card on each
// keystroke (no round trip, the same plain contains-match MarketGrid uses), and Near me asks the
// browser for a position and sorts by distance, printing the miles the reference shows. Listings
// without a point sink to the end. A Market page passes its groups as sections, each with See all.

export interface FqGridItem {
  id: string
  href: string
  title: string
  price: string
  /** "Priya Shah" / "Ceramics" / "Sold out": the line under the title, before any distance. */
  sub: string | null
  image: string | null
  /** Searched by the find pill. */
  text: string
  cta: string
  /** A corner tag on the photo ("Unclaimed", "Verified"). */
  tag?: string | null
  /** The seller's category, offered as a filter chip when two or more exist. */
  category?: string | null
  /** Price in cents for the price sorts; null/absent sinks to the end. */
  cents?: number | null
  /** ISO created time for Newest. */
  at?: string | null
  lat?: number | null
  lng?: number | null
}

interface FqGridSection {
  title?: string
  seeAll?: string
  items: FqGridItem[]
}

type Sort = 'top' | 'new' | 'low' | 'high'
const SORTS: { key: Sort; label: string }[] = [
  { key: 'top', label: 'Top picks' },
  { key: 'new', label: 'Newest' },
  { key: 'low', label: 'Price low' },
  { key: 'high', label: 'Price high' },
]

function miles(km: number): string {
  const mi = km / 1.609344
  return mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi)} mi`
}

export function FqItemGrid({
  sections,
  placeholder,
  nearMe = false,
  before,
}: {
  sections: FqGridSection[]
  placeholder: string
  /** Offer Near me (only where cards carry a point). */
  nearMe?: boolean
  /** Server-rendered controls that sit in the same row (kind chips). */
  before?: React.ReactNode
}) {
  const [query, setQuery] = useState('')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [locating, setLocating] = useState(false)
  const [category, setCategory] = useState<string | null>(null)
  const [sort, setSort] = useState<Sort>('top')
  const q = query.trim().toLowerCase()
  const categories = useMemo(() => {
    const seen = new Map<string, number>()
    for (const s of sections) for (const i of s.items) if (i.category) seen.set(i.category, (seen.get(i.category) ?? 0) + 1)
    return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c)
  }, [sections])
  const sortable = sections.some((s) => s.items.some((i) => i.cents != null || i.at))

  const shown = useMemo(
    () =>
      sections.map((s) => {
        const matched = s.items.filter((i) => (!q || i.text.toLowerCase().includes(q)) && (!category || i.category === category))
        const rows = matched.map((i) => ({
          i,
          km: coords && i.lat != null && i.lng != null ? distanceKm(coords.lat, coords.lng, i.lat, i.lng) : null,
        }))
        if (coords) rows.sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity))
        else if (sort === 'new') rows.sort((a, b) => (b.i.at ?? '').localeCompare(a.i.at ?? ''))
        else if (sort === 'low') rows.sort((a, b) => (a.i.cents ?? Infinity) - (b.i.cents ?? Infinity))
        else if (sort === 'high') rows.sort((a, b) => (b.i.cents ?? -1) - (a.i.cents ?? -1))
        return { ...s, rows }
      }),
    [sections, q, coords, category, sort],
  )
  const total = shown.reduce((n, s) => n + s.rows.length, 0)

  async function locate() {
    if (coords) {
      setCoords(null)
      return
    }
    setLocating(true)
    const pos = await getBrowserPosition()
    setLocating(false)
    if (pos) setCoords(pos)
  }

  return (
    <>
      <div className="fqm-tools">
        <label className="fqm-find">
          <FqIcon name="search" />
          <Input variant="seamless" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={placeholder} aria-label={placeholder} autoComplete="off" />
        </label>
        {nearMe && (
          <button type="button" className={coords ? 'chip on' : 'chip'} onClick={locate} disabled={locating} aria-pressed={!!coords}>
            <FqIcon name="pin" />
            {locating ? 'Locating' : coords ? 'Sorted by distance' : 'Near me'}
          </button>
        )}
        {before}
      </div>

      {(categories.length > 1 || sortable) && (
        <div className="fqm-tools">
          {categories.length > 1 && (
            <div className="chips" role="group" aria-label="Category">
              <button type="button" className={category ? 'chip' : 'chip on'} aria-pressed={!category} onClick={() => setCategory(null)}>
                All categories
              </button>
              {categories.map((c) => (
                <button key={c} type="button" className={category === c ? 'chip on' : 'chip'} aria-pressed={category === c} onClick={() => setCategory(category === c ? null : c)}>
                  {c}
                </button>
              ))}
            </div>
          )}
          {sortable && (
            <div className="chips fqm-end" role="group" aria-label="Sort">
              {SORTS.map((o) => (
                <button key={o.key} type="button" className={sort === o.key && !coords ? 'chip on' : 'chip'} aria-pressed={sort === o.key && !coords} onClick={() => { setSort(o.key); setCoords(null) }}>
                  {o.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {(q || category) && total === 0 && (
        <p className="why">
          {q ? `No matches for “${query}”.` : 'Nothing in this category yet.'}{' '}
          <button type="button" className="chip" onClick={() => { setQuery(''); setCategory(null) }}>
            Clear filters
          </button>
        </p>
      )}

      {shown.map((s, si) =>
        s.rows.length === 0 ? null : (
          <section key={s.title ?? si} className={s.title && si > 0 ? 'sec' : undefined}>
            {s.title && (
              <div className="sec-h">
                <h2 className="h2">{s.title}</h2>
                {s.seeAll && (
                  <Link className="meta" href={s.seeAll}>
                    See all
                  </Link>
                )}
              </div>
            )}
            <div className="g4">
              {s.rows.map(({ i, km }) => (
                <div key={i.id} className="stack fqm-item">
                  <Link className="ph fqm-item-ph" href={i.href} aria-label={i.title} style={i.image ? { backgroundImage: `url('${i.image}')` } : undefined}>
                    {i.tag && <span className="tag glass fqm-corner">{i.tag}</span>}
                  </Link>
                  <span className="row">
                    <Link className="t1 grow" href={i.href}>
                      {i.title}
                    </Link>
                    <span className="t1">{i.price}</span>
                  </span>
                  {(i.sub || km != null) && <span className="t2">{[i.sub, km != null ? miles(km) : null].filter(Boolean).join(' · ')}</span>}
                  <Link className="btn sm" href={i.href}>
                    {i.cta.startsWith('Message') && <FqIcon name="message" />}
                    {i.cta}
                  </Link>
                </div>
              ))}
            </div>
          </section>
        ),
      )}
    </>
  )
}
