'use client'

import { Wallet, Clock, Info, Check } from 'lucide-react'
import type { PayoutPrompt } from '@/lib/billing/payout-prompt'
import { StartPayoutButton, ManagePayoutButton } from './payout-controls'

// THE CARD HALF of the one Connect prompt (LIVE-233). Client-safe so a rail that already
// resolved the prompt (Journey sell, Market manage) can render the same chrome the server
// wrappers use. Decision and copy stay in lib/billing/payout-prompt.ts.

const TONE = {
  needs_setup: { icon: Wallet, ring: 'border-primary/40 bg-primary-bg/20' },
  in_review: { icon: Clock, ring: 'border-border bg-surface-elevated' },
  not_live: { icon: Info, ring: 'border-border bg-surface-elevated' },
  ready: { icon: Check, ring: 'border-border bg-surface-elevated' },
} as const

/** Render a resolved prompt. A surface that already resolved one does not pay for a second read. */
export function PayoutPromptCard({
  prompt,
  className = '',
}: {
  prompt: PayoutPrompt | null
  className?: string
}) {
  if (!prompt) return null
  const tone = TONE[prompt.state]
  const Icon = tone.icon

  return (
    <div className={`rounded-card border p-5 lift-1 ${tone.ring} ${className}`}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-subtle" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-body font-bold leading-tight text-text">{prompt.headline}</p>
          <p className="mt-1 text-body-sm leading-relaxed text-muted">{prompt.body}</p>
          {prompt.action === 'manage' ? (
            <div className="mt-4">
              <ManagePayoutButton />
            </div>
          ) : prompt.action !== 'none' && prompt.actionLabel ? (
            <div className="mt-4">
              <StartPayoutButton label={prompt.actionLabel} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
