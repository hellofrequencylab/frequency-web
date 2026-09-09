import { Wallet, Clock, Info } from 'lucide-react'
import { getCallerProfile } from '@/lib/auth'
import {
  resolveProfilePayoutPrompt,
  resolveSpacePayoutPrompt,
  resolveSpacePayoutPromptById,
} from '@/lib/billing/payout-prompt-resolve'
import type { PayoutChannel, PayoutPrompt } from '@/lib/billing/payout-prompt'
import { StartPayoutButton } from '@/app/(main)/settings/billing/payout-controls'

// THE ONE CONNECT ONBOARDING PROMPT, rendered (LIVE-233). One component, five money paths:
// memberships, bookings, orders, donations, tickets. There were four hand-written versions of this
// card before it (settings/billing, market manage, the shop storefront tab, the event page), each
// with its own sentence and each LINKING to /settings/billing rather than starting onboarding. The
// decision + copy live in lib/billing/payout-prompt.ts; this file only renders them.
//
// 🔴 IT STARTS ONBOARDING INLINE. That is the whole point of the row. A link to a settings page is a
// second decision on a page the operator did not want to be on, and production has zero completed
// onboardings to show for that design. StartPayoutButton posts to the SAME server action the
// settings card uses (startPayoutOnboarding -> createOnboardingLink) and redirects straight into
// Stripe's hosted form, so the operator finishes where they were already standing.
//
// IT RENDERS NOTHING WHEN THERE IS NOTHING TO SAY. payoutPrompt returns null for a ready account, so
// an operator who onboarded last week is never told to go and do it (ADR-1158's defect class).
//
// SERVER COMPONENT. Both entry props do their own reads, so a caller passes who gets paid and which
// paths this surface covers, and nothing else.

const TONE = {
  needs_setup: { icon: Wallet, ring: 'border-primary/40 bg-primary-bg/20' },
  in_review: { icon: Clock, ring: 'border-border bg-surface-elevated' },
  not_live: { icon: Info, ring: 'border-border bg-surface-elevated' },
} as const

/** Render a resolved prompt. Exported so a surface that already resolved one (or resolves several in
 *  parallel with its own data) does not pay for a second read. */
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
          {prompt.action !== 'none' && prompt.actionLabel && (
            <div className="mt-4">
              <StartPayoutButton label={prompt.actionLabel} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** The prompt for a SPACE's money paths: the space OWNER is the payee (ADR-819), so an admin who is
 *  not the owner is told who has to act instead of being handed a button for the wrong account. */
export async function SpacePayoutSetupPrompt({
  space,
  viewerProfileId,
  channels,
  className,
}: {
  space: { ownerProfileId?: string | null; owner_profile_id?: string | null; name?: string | null; brandName?: string | null }
  viewerProfileId: string | null
  channels: readonly PayoutChannel[]
  className?: string
}) {
  const prompt = await resolveSpacePayoutPrompt({ space, viewerProfileId, channels })
  return <PayoutPromptCard prompt={prompt} className={className} />
}

/** The prompt for a PROFILE payee (a maker's listing, a personal event's tickets). */
export async function PayoutSetupPrompt({
  payeeProfileId,
  viewerProfileId,
  channels,
  payeeName,
  className,
}: {
  payeeProfileId: string | null
  viewerProfileId: string | null
  channels: readonly PayoutChannel[]
  payeeName?: string | null
  className?: string
}) {
  const prompt = await resolveProfilePayoutPrompt({
    payeeProfileId,
    viewerProfileId,
    channels,
    payeeName,
  })
  return <PayoutPromptCard prompt={prompt} className={className} />
}

/** The same prompt for a surface that holds only a space id, resolving the viewer itself. One prop.
 *  Prefer <SpacePayoutSetupPrompt> when the caller already loaded the space. */
export async function SpacePayoutSetupPromptById({
  spaceId,
  channels,
  className,
}: {
  spaceId: string
  channels: readonly PayoutChannel[]
  className?: string
}) {
  const caller = await getCallerProfile()
  const prompt = await resolveSpacePayoutPromptById({
    spaceId,
    viewerProfileId: caller?.id ?? null,
    channels,
  })
  return <PayoutPromptCard prompt={prompt} className={className} />
}
