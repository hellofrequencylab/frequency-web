import { AlertTriangle } from 'lucide-react'
import { ManageBillingButton } from '@/app/(main)/settings/billing/manage-button'
import type { MemberPaymentState } from '@/lib/pricing/dunning'

// PAST-DUE BANNER — the member-facing dunning surface (ADR-370, REMAINING-WORK #7). A calm recovery
// prompt for a failed (past_due) or canceled membership payment, with the one-tap path back into the
// Stripe billing portal to fix the card.
//
// DARK UNTIL LAUNCH: the caller resolves the state via resolveMemberPaymentState (lib/pricing/dunning.ts),
// which returns 'active' while billing is OFF — so this banner never renders today. It only appears once
// billing is live AND the gated member webhook wrote a past_due / canceled status. No em dashes; voice
// per CONTENT-VOICE §10 (plain, never alarmist, gives the next step).

export function PastDueBanner({ state }: { state: MemberPaymentState }) {
  if (state === 'active') return null

  const isCanceled = state === 'canceled'
  const title = isCanceled ? 'Your membership ended' : 'Your last payment did not go through'
  const body = isCanceled
    ? 'Your Crew benefits are paused. Update your payment to pick up where you left off.'
    : 'We could not charge your card. Update your payment to keep your Crew benefits, no rush, it stays simple.'

  return (
    <div className="mb-4 rounded-2xl border border-warning/50 bg-warning-bg/30 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text">{title}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>
          <div className="mt-3">
            <ManageBillingButton />
          </div>
        </div>
      </div>
    </div>
  )
}
