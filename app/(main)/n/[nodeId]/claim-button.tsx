'use client'

import { useState, useTransition } from 'react'
import { Zap, Check, AlertCircle } from 'lucide-react'
import { claimNode, type ClaimResult } from './actions'
import { showZapToast } from '@/components/zap-toast'

const REASON_LABEL: Record<string, string> = {
  not_signed_in: 'Sign in to claim this.',
  already_captured: "You've already claimed this one.",
  too_far: "You're not close enough to claim this.",
  location_required: 'Location needed to claim this.',
  capacity_reached: 'All claimed — this one reached its limit.',
  expired: "This one's no longer active.",
  not_yet_valid: 'This one isn’t active yet.',
  inactive: 'This spot is inactive.',
  unknown_node: 'This code isn’t recognised.',
  bad_signature: "Couldn't verify this code.",
}

// Best-effort device location for proximity-gated codes. Resolves null on denial,
// timeout, or no support — the server then decides (a non-geofenced code is fine;
// a geofenced one returns `location_required`, surfaced below).
function getCoords(): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null)
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    )
  })
}

export function ClaimButton({ nodeId, secret }: { nodeId: string; secret?: string | null }) {
  const [result, setResult] = useState<ClaimResult | null>(null)
  const [pending, start] = useTransition()

  if (result?.ok) {
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="inline-flex items-center gap-2 rounded-xl bg-success-bg text-success px-4 py-3 font-semibold">
          <Check className="w-5 h-5" />
          Claimed! +{result.zapsAwarded ?? 0} zaps
        </div>
        {result.offerTitle && (
          <p className="text-sm text-muted">
            🎟 Offer unlocked: <span className="font-medium text-text">{result.offerTitle}</span>
          </p>
        )}
      </div>
    )
  }

  if (result && !result.ok) {
    const isDone = result.reason === 'already_captured'
    return (
      <div
        className={`inline-flex items-center gap-2 rounded-xl px-4 py-3 font-medium ${
          isDone ? 'bg-surface-elevated text-muted' : 'bg-danger-bg text-danger'
        }`}
      >
        {isDone ? <Check className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
        {REASON_LABEL[result.reason ?? ''] ?? "Couldn't claim this."}
      </div>
    )
  }

  return (
    <button
      disabled={pending}
      onClick={() =>
        start(async () => {
          const coords = await getCoords()
          const res = await claimNode(nodeId, coords, secret ?? null)
          setResult(res)
          if (res.ok && res.zapsAwarded) {
            showZapToast({ amount: res.zapsAwarded, label: 'Claimed' })
          }
        })
      }
      className="inline-flex items-center gap-2 rounded-xl bg-primary hover:bg-primary-hover text-on-primary text-sm font-semibold px-5 py-3 shadow-sm transition-colors disabled:opacity-60"
    >
      <Zap className="w-4 h-4" strokeWidth={2.5} />
      {pending ? 'Claiming…' : 'Claim'}
    </button>
  )
}
