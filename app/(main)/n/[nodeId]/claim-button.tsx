'use client'

import { useState, useTransition } from 'react'
import { Zap, Check, AlertCircle } from 'lucide-react'
import { claimNode, type ClaimResult } from './actions'

const REASON_LABEL: Record<string, string> = {
  not_signed_in: 'Sign in to claim this.',
  already_captured: "You've already claimed this one.",
  too_far: "You're not close enough to claim this.",
  location_required: 'Location needed to claim this.',
  expired: "This one's no longer active.",
  not_yet_valid: 'This one isn’t active yet.',
  inactive: 'This spot is inactive.',
  unknown_node: 'This code isn’t recognised.',
  bad_signature: "Couldn't verify this code.",
}

export function ClaimButton({ nodeId }: { nodeId: string }) {
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
      onClick={() => start(async () => setResult(await claimNode(nodeId)))}
      className="inline-flex items-center gap-2 rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-semibold px-5 py-3 shadow-sm transition-colors disabled:opacity-60"
    >
      <Zap className="w-4 h-4" strokeWidth={2.5} />
      {pending ? 'Claiming…' : 'Claim'}
    </button>
  )
}
