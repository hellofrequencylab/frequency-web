'use client'

import { useEffect, useRef, useState } from 'react'
import { MapCanvas } from '@/components/maps/map-canvas'
import type { MapPin } from '@/components/maps/types'

// THE LIVE MAP BEHIND THE WEBSITE'S "WHAT'S HAPPENING" LIST. Renders through the one map seam
// (<MapCanvas>, ADR-901), so it is Google with the browsable key and MapLibre without it, and wears the
// Frequency basemap (lib/maps/basemap-look.ts) read from the Stage band it sits in.
//
// LEAN ON PURPOSE (every Google map load is billed): nothing mounts until the pane is within 400px of
// the viewport, and a pane the kit hides never mounts at all: at or under 900px, and in a chapter
// split where the list fills the frame (app/themes/frequency/site-pages-a.css). Until it mounts, the
// design's rings hold the space.

export function WhatsOnMap({ pins }: { pins: MapPin[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const [show, setShow] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || pins.length === 0 || typeof IntersectionObserver === 'undefined') return
    // A hidden pane (display:none, as on a phone or under a full-width list) never intersects, so it
    // never mounts and never bills a load. If it is shown later (a window widened), it fires then.
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShow(true)
          io.disconnect()
        }
      },
      { rootMargin: '400px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [pins.length])

  const first = pins[0]
  return (
    <div ref={ref} className="fqm-live-map">
      {show && first && (
        <MapCanvas
          center={[first.lng, first.lat]}
          zoom={10}
          pins={pins}
          fit={{ padding: 72, maxZoom: 11, singleZoom: 11 }}
          className="h-full w-full"
        />
      )}
    </div>
  )
}
