'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { FqIcon } from '@/components/frequency/icon'
import { useCirclesMapZone } from '@/components/circles/circles-map'

// The Circles map in the kit's idiom (the DAWN block's FindNearMeButton + MapBanner, redrawn). Both
// read the one <MapZone> state the DAWN page uses (IP-centred on mount, precise on "Find circles near
// me", Starter pins projected near the viewer), so the behaviour is the same and only the frame is
// the kit's: a pill button in the filter row, a rounded 16:9 pane above the grid, a quiet legend.

const CircleMap = dynamic(() => import('@/components/circles/circle-map'), {
  ssr: false,
  loading: () => <div className="ph fqm-map wide" />,
})

export function FqFindNearMe() {
  const ctx = useCirclesMapZone()
  const [loading, setLoading] = useState(false)
  if (!ctx) return null
  const zone = ctx
  function find() {
    if (zone.open) {
      zone.setOpen(false)
      return
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      zone.setOpen(true)
      return
    }
    setLoading(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        zone.setCenter([pos.coords.longitude, pos.coords.latitude])
        zone.setOpen(true)
        setLoading(false)
      },
      () => {
        zone.setOpen(true)
        setLoading(false)
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    )
  }
  return (
    <button type="button" className={zone.open ? 'chip on' : 'chip'} onClick={find} disabled={loading} aria-pressed={zone.open}>
      <FqIcon name="map" />
      {loading ? 'Locating' : zone.open ? 'Hide the map' : 'Find circles near me'}
    </button>
  )
}

export function FqCirclesMapBanner() {
  const ctx = useCirclesMapZone()
  const [key, setKey] = useState(0)
  if (!ctx || !ctx.open || (ctx.circles.length === 0 && ctx.starters.length === 0)) return null
  return (
    <div className="fqm-lane">
      <div className="fqm-map wide">
        <CircleMap key={key} circles={ctx.circles} starters={ctx.starters} interactive center={ctx.center} className="fqm-map-in" />
      </div>
      <div className="fqm-legend">
        {ctx.circles.length > 0 && (
          <span className="t2">
            <i />
            {ctx.circles.length} in-person {ctx.circles.length === 1 ? 'Circle' : 'Circles'}
          </span>
        )}
        {ctx.starters.length > 0 && (
          <span className="t2">
            <i className="starter" />
            {ctx.starters.length} {ctx.starters.length === 1 ? 'Starter to claim' : 'Starters to claim'}
          </span>
        )}
        <span className="grow" />
        <button type="button" className="btn sm txt" onClick={() => setKey((k) => k + 1)}>
          Reset view
        </button>
        <button type="button" className="btn sm txt" onClick={() => ctx.setOpen(false)}>
          Close
        </button>
      </div>
    </div>
  )
}
