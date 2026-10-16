'use client'

import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { FqIcon } from '@/components/frequency/icon'
import { Input } from '@/components/ui/field'
import type { MapPin } from '@/components/maps/types'
import { moreDatesLine } from '@/lib/maps/pin-copy'
import type { AyMapItem } from './around-you-items'

// THE EVENTS MAP, AS A LIGHTBOX (SCAN-975, owner 2026-10-16: "make it part of the feature section. When
// someone clicks it, it's a pop up lightbox experience ... with sorting, search and controls").
//
// THE TILE is the map's door inside Around you: a still preview of where the pins fall, drawn as an SVG
// from the same privacy-safe points (no map engine, so the list view still ships none). THE LIGHTBOX is a
// native modal <dialog> (showModal: the page behind goes inert, focus moves in and stays, Escape closes it,
// focus returns to the door), holding search, a when band, category chips, a Going toggle and the sort over
// a results list beside the live map. Picking a pin lights its row; every row links to its event.
//
// THE URL OWNS OPEN. `?map=1` opens it (and the old `?view=map` link still lands here), written with
// history.pushState so opening it is instant and never re-reads the page on the server; Back closes it,
// and closing it takes the param off. The lightbox's own search and sort are a lens on the events the
// page already listed, so they stay in the browser.
//
// PRIVACY (ADR-186): a Circle event sits on its Circle's city point and a public event on its own spot;
// the map never learns an exact address, and the note under the map says so.

const MapCanvas = dynamic(() => import('@/components/maps/map-canvas').then((m) => m.MapCanvas), {
  ssr: false,
  loading: () => <div className="evm-ph" aria-hidden="true" />,
})

type When = '' | 'today' | 'week' | 'weekend'
type Sort = 'soon' | 'near' | 'going'

const WHEN: { value: When; label: string }[] = [
  { value: '', label: 'Any day' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'weekend', label: 'Weekend' },
]

function isOpenParam(sp: URLSearchParams): boolean {
  return sp.get('map') === '1' || sp.get('view') === 'map'
}

function urlWith(open: boolean): string {
  const u = new URL(window.location.href)
  if (open) u.searchParams.set('map', '1')
  else {
    u.searchParams.delete('map')
    if (u.searchParams.get('view') === 'map') u.searchParams.delete('view')
  }
  return `${u.pathname}${u.search}${u.hash}`
}

/** Open the lightbox from the tile or the toolbar's Map button. */
function openEventsMap() {
  window.history.pushState(null, '', urlWith(true))
}

/** The toolbar's Map button, beside List and Calendar: it opens the lightbox over whichever view is on. */
export function FqMapButton() {
  return (
    <button type="button" onClick={openEventsMap} aria-haspopup="dialog">
      <FqIcon name="map" />
      <span className="evx-seg-t">Map</span>
    </button>
  )
}

function matchesWhen(i: AyMapItem, when: When): boolean {
  if (!when) return true
  if (when === 'today') return i.daysOut === 0
  if (when === 'week') return i.daysOut >= 0 && i.daysOut < 7
  return i.daysOut >= 0 && i.daysOut < 7 && (i.dow === 5 || i.dow === 6 || i.dow === 0)
}

/** The tile: a still preview of the pins, and the door into the lightbox. */
export function FqMapTile({ items, homeLabel }: { items: AyMapItem[]; homeLabel: string | null }) {
  const dots = useMemo(() => {
    if (items.length === 0) return []
    const lats = items.map((i) => i.lat)
    const lngs = items.map((i) => i.lng)
    const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)]
    const spanLat = Math.max(maxLat - minLat, 0.02)
    const spanLng = Math.max(maxLng - minLng, 0.02)
    const seen = new Map<string, number>()
    for (const i of items) {
      const x = Math.round(12 + ((i.lng - minLng) / spanLng) * 76)
      const y = Math.round(12 + (1 - (i.lat - minLat) / spanLat) * 36)
      const k = `${x},${y}`
      seen.set(k, (seen.get(k) ?? 0) + 1)
    }
    return [...seen.entries()].map(([k, n]) => {
      const [x, y] = k.split(',').map(Number)
      return { x, y, n }
    })
  }, [items])
  const going = items.filter((i) => i.going).length

  return (
    <button type="button" className="evm-tile" onClick={openEventsMap} aria-haspopup="dialog">
      <svg className="evm-tile-map" viewBox="0 0 100 60" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        {dots.map((d) => (
          <g key={`${d.x}-${d.y}`}>
            <circle cx={d.x} cy={d.y} r={Math.min(2 + d.n, 7)} className="evm-halo" />
            <circle cx={d.x} cy={d.y} r={1.4} className="evm-dot" />
          </g>
        ))}
      </svg>
      <span className="evm-tile-b">
        <span className="evm-tile-k">
          <FqIcon name="map" />
          Map
        </span>
        <span className="evm-tile-t">
          {items.length === 0 ? 'Nothing to pin yet' : `${items.length} ${items.length === 1 ? 'event' : 'events'} on the map`}
        </span>
        <span className="t2">
          {[homeLabel ? `Around ${homeLabel}` : null, going > 0 ? `${going} you are going to` : null].filter(Boolean).join(' · ') ||
            'Search, sort and filter by area'}
        </span>
      </span>
      <span className="evm-tile-go">
        Open map
        <FqIcon name="arrow" />
      </span>
    </button>
  )
}

/** The lightbox itself. Rendered once by the page body; opens on `?map=1`. */
export function FqEventsMapLightbox({
  items,
  signedIn,
  homeLabel,
}: {
  items: AyMapItem[]
  signedIn: boolean
  homeLabel: string | null
}) {
  const sp = useSearchParams()
  const open = isOpenParam(new URLSearchParams(sp.toString()))
  const dlg = useRef<HTMLDialogElement>(null)
  const listRef = useRef<HTMLOListElement>(null)

  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [when, setWhen] = useState<When>('')
  const [cat, setCat] = useState('')
  const [mine, setMine] = useState(false)
  const [sort, setSort] = useState<Sort>('soon')
  const [picked, setPicked] = useState<string | null>(null)
  const [center, setCenter] = useState<{ key: string; at: [number, number] } | null>(null)

  // Search settles before the map re-fits, so a typed word does not rebuild the map per keystroke.
  useEffect(() => {
    const t = window.setTimeout(() => setQuery(q.trim().toLowerCase()), 250)
    return () => window.clearTimeout(t)
  }, [q])

  useEffect(() => {
    const d = dlg.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  useEffect(() => {
    const d = dlg.current
    if (!d) return
    // Escape, the close button and a tap on the scrim all land here: take the param off the URL.
    const onClose = () => {
      if (isOpenParam(new URLSearchParams(window.location.search))) window.history.replaceState(null, '', urlWith(false))
    }
    d.addEventListener('close', onClose)
    return () => d.removeEventListener('close', onClose)
  }, [])

  const cats = useMemo(() => {
    const m = new Map<string, { label: string; n: number }>()
    for (const i of items) {
      if (!i.category || !i.categoryLabel) continue
      const c = m.get(i.category)
      m.set(i.category, { label: i.categoryLabel, n: (c?.n ?? 0) + 1 })
    }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n)
  }, [items])
  const canNear = items.some((i) => i.miles != null)

  const shown = useMemo(() => {
    const rows = items.filter(
      (i) =>
        matchesWhen(i, when) &&
        (!cat || i.category === cat) &&
        (!mine || i.going) &&
        (!query || `${i.title} ${i.place ?? ''} ${i.categoryLabel ?? ''}`.toLowerCase().includes(query)),
    )
    const bySoon = (a: AyMapItem, b: AyMapItem) => (a.startMs ?? 0) - (b.startMs ?? 0)
    if (sort === 'near') rows.sort((a, b) => (a.miles ?? Infinity) - (b.miles ?? Infinity) || bySoon(a, b))
    else if (sort === 'going') rows.sort((a, b) => b.goingCount - a.goingCount || bySoon(a, b))
    else rows.sort(bySoon)
    return rows
  }, [items, when, cat, mine, query, sort])

  const pins: MapPin[] = useMemo(
    () =>
      shown.map((i) => {
        const more = moreDatesLine(i.moreDates)
        return {
          id: i.id,
          lat: i.lat,
          lng: i.lng,
          kind: 'event',
          title: i.title,
          subtitle: [i.when, more].filter(Boolean).join(' · '),
          detail: i.place,
          imageUrl: i.cover,
          href: `/events/${encodeURIComponent(i.slug)}`,
          hrefLabel: more ? 'See the event and its dates' : 'View event',
          moreCount: i.moreDates,
          place: i.place,
        }
      }),
    [shown],
  )
  // Re-fit the map when the result set changes, not on every render.
  const fitKey = shown.map((i) => i.id).join('|')

  function pick(id: string) {
    setPicked(id)
    const row = listRef.current?.querySelector<HTMLElement>(`[data-ev="${CSS.escape(id)}"]`)
    row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }

  const filtered = !!(query || when || cat || mine || sort !== 'soon')
  function reset() {
    setQ('')
    setQuery('')
    setWhen('')
    setCat('')
    setMine(false)
    setSort('soon')
  }

  return (
    <dialog
      ref={dlg}
      className="evm-dlg"
      aria-labelledby="evm-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close()
      }}
    >
      {open && (
        <div className="evm-panel">
          <div className="evm-head">
            <div className="stack fqm-gap-sm">
              <h2 id="evm-title" className="h3">
                Events on the map
              </h2>
              <span className="t2" aria-live="polite">
                {shown.length} of {items.length} {items.length === 1 ? 'event' : 'events'}
                {homeLabel ? ` around ${homeLabel}` : ''}
              </span>
            </div>
            <button type="button" className="evf-x" aria-label="Close map" onClick={() => dlg.current?.close()}>
              <FqIcon name="close" />
            </button>
          </div>

          <div className="evm-tools">
            <label className="evm-search">
              <FqIcon name="search" />
              <Input
                variant="seamless"
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search the map"
                aria-label="Search events on the map"
                autoComplete="off"
              />
            </label>
            <div className="evm-seg" role="group" aria-label="When">
              {WHEN.map((w) => (
                <button key={w.value || 'any'} type="button" aria-pressed={when === w.value} onClick={() => setWhen(w.value)}>
                  {w.label}
                </button>
              ))}
            </div>
            <div className="evm-seg" role="group" aria-label="Sort">
              <button type="button" aria-pressed={sort === 'soon'} onClick={() => setSort('soon')}>
                Soonest
              </button>
              {canNear && (
                <button type="button" aria-pressed={sort === 'near'} onClick={() => setSort('near')}>
                  Nearest
                </button>
              )}
              <button type="button" aria-pressed={sort === 'going'} onClick={() => setSort('going')}>
                Most going
              </button>
            </div>
          </div>

          <div className="evm-chips" role="group" aria-label="Category">
            {signedIn && (
              <button type="button" className={mine ? 'chip on' : 'chip'} aria-pressed={mine} onClick={() => setMine((v) => !v)}>
                <FqIcon name="check" />
                Going
              </button>
            )}
            <button type="button" className={cat ? 'chip' : 'chip on'} aria-pressed={!cat} onClick={() => setCat('')}>
              All
            </button>
            {cats.map(([value, c]) => (
              <button
                key={value}
                type="button"
                className={cat === value ? 'chip on' : 'chip'}
                aria-pressed={cat === value}
                onClick={() => setCat(cat === value ? '' : value)}
              >
                {c.label}
                <span className="ev-n-tag">{c.n}</span>
              </button>
            ))}
            {filtered && (
              <button type="button" className="btn txt sm" onClick={reset}>
                Reset
              </button>
            )}
          </div>

          <div className="evm-body">
            <ol className="evm-list" ref={listRef} aria-label="Events on the map">
              {shown.length === 0 ? (
                <li className="evm-empty">
                  <span className="h3">Nothing here</span>
                  <span className="t2">Try another day or category, or reset to see every pin.</span>
                </li>
              ) : (
                shown.map((i) => (
                  <li key={i.id} data-ev={i.id} className={picked === i.id ? 'on' : undefined}>
                    <button
                      type="button"
                      className="evm-locate"
                      aria-label={`Show ${i.title} on the map`}
                      onClick={() => {
                        setPicked(i.id)
                        setCenter({ key: fitKey, at: [i.lng, i.lat] })
                      }}
                    >
                      <FqIcon name="pin" />
                    </button>
                    <Link href={`/events/${i.slug}`} onMouseEnter={() => setPicked(i.id)} onFocus={() => setPicked(i.id)}>
                      <span
                        className="evm-thumb"
                        style={i.cover ? { backgroundImage: `url('${i.cover}')`, backgroundPosition: i.coverFocus ?? undefined } : undefined}
                      >
                        <b>{i.day}</b>
                      </span>
                      <span className="evm-row-b">
                        <span className="evm-row-t">{i.title}</span>
                        <span className="t2">{[i.when, i.place].filter(Boolean).join(' · ')}</span>
                        <span className="evm-row-s">
                          {i.going && <span className="ay-sig live">Going</span>}
                          {i.goingCount > 0 && <span>{i.goingCount} going</span>}
                          {i.miles != null && <span>{i.miles} mi</span>}
                          {i.price && <span>{i.price}</span>}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))
              )}
            </ol>
            <div className="evm-map">
              {pins.length > 0 ? (
                <MapCanvas
                  key={fitKey}
                  center={[pins[0].lng, pins[0].lat]}
                  zoom={9}
                  pins={pins}
                  interactive
                  onPinClick={(p) => pick(p.id)}
                  recenterTo={center?.key === fitKey ? center.at : null}
                  fit={{ padding: 60, maxZoom: 13, singleZoom: 12 }}
                  className="evm-canvas"
                />
              ) : (
                <div className="evm-ph" aria-hidden="true" />
              )}
              <p className="t2 evm-note">
                Pins sit on each host&apos;s area, not the exact address. The full venue is on the event page once you RSVP.
              </p>
            </div>
          </div>
        </div>
      )}
    </dialog>
  )
}
