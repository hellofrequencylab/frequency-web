'use server'

import { getEventsIndexData } from '@/app/(main)/events/index-data'
import { ayMapItems } from '@/components/frequency/members/events/around-you-items'
import type { AyMapItem } from '@/components/frequency/members/events/around-you-items'

// THE RAIL MAP'S ONE READ (SCAN-998). The right rail's Around you panel asks for this once, when the panel
// comes near the viewport, and keeps it for the visit (the rail lives in the layout, so client navigation
// never asks again). It is the Events page's own read and its own pins (getEventsIndexData with no
// filters, folded one pin per series), so the rail and /events always show the same events in the same
// places: a Circle event on its Circle's public city point, a public event on its own spot (ADR-186), never
// an exact address. Nothing here goes to an analytics pixel.
//
// FAIL-SAFE: a refused read logs a tagged line and the panel draws nothing.

export interface RailEventsMap {
  items: AyMapItem[]
  signedIn: boolean
  homeLabel: string | null
}

export async function loadRailEventsMap(): Promise<RailEventsMap | null> {
  try {
    const data = await getEventsIndexData({})
    return {
      items: ayMapItems(data.sortedEvents, data.mapPins, data),
      signedIn: !!data.myProfileId,
      homeLabel: data.homeLabel,
    }
  } catch (e) {
    const detail = typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e)
    console.error('[frequency-rail] events map read failed; that panel degraded to empty:', detail)
    return null
  }
}
