'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { FqIcon } from '@/components/frequency/icon'
import { distanceKm } from '@/lib/distance'
import { getBrowserPosition } from '@/lib/geo-browser'

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
  lat?: number | null
  lng?: number | null
}

export interface FqGridSection {
  title?: string
  seeAll?: string
  items: FqGridItem[]
}

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
  const q = query.trim().toLowerCase()

  const shown = useMemo(
    () =>
      sections.map((s) => {
        const matched = q ? s.items.filter((i) => i.text.toLowerCase().includes(q)) : s.items
        const rows = matched.map((i) => ({
          i,
          km: coords && i.lat != null && i.lng != null ? distanceKm(coords.lat, coords.lng, i.lat, i.lng) : null,
        }))
        if (coords) rows.sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity))
        return { ...s, rows }
      }),
    [sections, q, coords],
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
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={placeholder} aria-label={placeholder} autoComplete="off" />
        </label>
        {nearMe && (
          <button type="button" className={coords ? 'chip on' : 'chip'} onClick={locate} disabled={locating} aria-pressed={!!coords}>
            <FqIcon name="pin" />
            {locating ? 'Locating' : coords ? 'Sorted by distance' : 'Near me'}
          </button>
        )}
        {before}
      </div>

      {q && total === 0 && <p className="why">No matches for “{query}”.</p>}

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
