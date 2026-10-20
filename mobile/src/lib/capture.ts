import { useCallback, useState } from 'react'
import * as Location from 'expo-location'
import { api, errorText } from './api'
import type { NodeLink } from './node-link'

// One check-in: POST /api/v1/nodes/{id}/capture with the tag's signed code and, when the member has
// allowed it, where the phone is. The server decides (window, signed code, proximity, capacity); the
// phone is never trusted. A refusal is `ok: false` with the verifier's reason, shown as is.

export type CaptureOutcome = { ok: boolean; reason: string | null; zapsAwarded: number | null; offerTitle: string | null }

async function hereIfAllowed(): Promise<{ lat: number; lng: number } | null> {
  try {
    let { status } = await Location.getForegroundPermissionsAsync()
    if (status !== 'granted') status = (await Location.requestForegroundPermissionsAsync()).status
    if (status !== 'granted') return null
    const pos = (await Location.getLastKnownPositionAsync({ maxAge: 60_000 })) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }))
    return { lat: pos.coords.latitude, lng: pos.coords.longitude }
  } catch {
    return null
  }
}

export function useCapture() {
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<CaptureOutcome | null>(null)
  const [error, setError] = useState<string | null>(null)

  const capture = useCallback(async (link: NodeLink) => {
    setBusy(true)
    setError(null)
    setOutcome(null)
    try {
      const location = await hereIfAllowed()
      setOutcome(await api.capture(link.nodeId, { secret: link.secret, location }))
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }, [])

  return { capture, busy, outcome, error, reset: () => (setOutcome(null), setError(null)) }
}

/** The verifier's reasons (lib/engagement/verify.ts), as a person reads them. Unknown ones pass through. */
export function describeCaptureReason(reason: string | null): string {
  switch (reason) {
    case null:
      return 'That did not go through.'
    case 'already_captured':
      return 'You already checked in here today.'
    case 'too_far':
      return 'You need to be at the place to check in.'
    case 'location_required':
      return 'This check-in needs your location. Allow location for Frequency and tap again.'
    case 'not_yet_valid':
      return 'This check-in is not open yet.'
    case 'expired':
      return 'This check-in has closed.'
    case 'inactive':
      return 'This check-in is switched off right now.'
    case 'bad_signature':
      return 'This tag or code is not valid any more. Ask the host for a fresh one.'
    case 'capacity_reached':
      return 'This check-in is full.'
    case 'unknown_node':
      return 'Frequency does not know this tag.'
    default:
      return reason.replace(/_/g, ' ')
  }
}
