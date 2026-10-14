'use client'

// The town finder for the every-town list on /discover/cities under the Frequency design (/discover/places
// merged there, 2026-10-14): the same instant filter as the DAWN
// PlacesFinder (components/discover/places-finder.tsx) over a list that is already server-rendered in full,
// drawn as the kit's town cards. No fetching; the box appears once there are enough towns to scan.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { FqIcon } from '@/components/frequency/icon'
import { Input } from '@/components/ui/field'
import { BETA_CTA_HREF, BETA_CTA_LABEL } from '@/lib/site'

export interface FinderTown {
  city: string
  slug: string
  circleCount: number
  eventCount: number
}

function counts(t: FinderTown): string {
  const bits: string[] = []
  if (t.circleCount > 0) bits.push(`${t.circleCount} ${t.circleCount === 1 ? 'Circle' : 'Circles'}`)
  if (t.eventCount > 0) bits.push(`${t.eventCount} upcoming ${t.eventCount === 1 ? 'event' : 'events'}`)
  return bits.join(' · ')
}

export function FrequencyPlacesFinder({ towns }: { towns: FinderTown[] }) {
  const [query, setQuery] = useState('')
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? towns.filter((t) => t.city.toLowerCase().includes(q)) : towns
  }, [towns, query])

  return (
    <div>
      {towns.length > 6 && (
        <label className="dx-find">
          <FqIcon name="search" />
          <span className="sr-only">Find your town</span>
          <Input
            variant="seamless"
            type="search"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find your town"
          />
        </label>
      )}
      {shown.length > 0 ? (
        <ul className="dx-towns">
          {shown.map((t) => (
            <li key={t.slug}>
              <Link className="dx-town" href={`/discover/cities/${t.slug}`}>
                <span className="ic" aria-hidden="true">
                  <FqIcon name="pin" />
                </span>
                <span className="dx-tx">
                  <b>{t.city}</b>
                  {counts(t) && <em>{counts(t)}</em>}
                </span>
                <span className="ar" aria-hidden="true">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="dx-note">
          <b>No towns matching “{query.trim()}” yet.</b>
          <p>Frequency grows one neighborhood at a time. Be the one who starts the first Circle where you live.</p>
          <Link className="btn fq-iri-btn" href={BETA_CTA_HREF}>
            {BETA_CTA_LABEL}
          </Link>
        </div>
      )}
    </div>
  )
}
