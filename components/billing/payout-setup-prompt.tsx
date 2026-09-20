import { getCallerProfile } from '@/lib/auth'
import {
  resolveProfilePayoutPrompt,
  resolveSpacePayoutPrompt,
  resolveSpacePayoutPromptById,
} from '@/lib/billing/payout-prompt-resolve'
import type { PayoutChannel } from '@/lib/billing/payout-prompt'
import { PayoutPromptCard } from './payout-prompt-card'

export { PayoutPromptCard } from './payout-prompt-card'

// THE ONE CONNECT ONBOARDING PROMPT, rendered (LIVE-233, LIVE-425). Server wrappers around the
// shared card. Money paths: memberships, bookings, orders, donations, tickets, Journeys. The
// decision + copy live in lib/billing/payout-prompt.ts. The card lives in payout-prompt-card.tsx
// so a client rail (Sell this Journey) can render a prompt it already resolved.
//
// 🔴 IT STARTS ONBOARDING INLINE. That is the whole point of the row. A link to a settings page is a
// second decision on a page the operator did not want to be on, and for as long as it was the only
// design production had ZERO completed onboardings.
//
// ⚠️ THAT ZERO IS NOW A TWO, so do not re-quote it as current. Measured 2026-09-15 (PROG-R5): 2 of 58
// profiles hold a Stripe account and both are fully onboarded, charges and payouts enabled. Both rows
// were last written after this card shipped (#2507, 2026-09-09), which is consistent with the inline
// shape working but is NOT proof of it: `updated_at` moves on any profile write, and nothing records
// which surface started an onboarding. Attributing it would need a real event, not this column.
// StartPayoutButton posts to the SAME server action the
// settings card uses (startPayoutOnboarding -> createOnboardingLink) and redirects straight into
// Stripe's hosted form, so the operator finishes where they were already standing.
//
// IT RENDERS NOTHING WHEN THERE IS NOTHING TO SAY. payoutPrompt returns null for a ready account
// UNLESS the surface passes whenReady="status" (LIVE-290: on Offerings and the Shop storefront this
// card IS the payments UI, so a ready owner needs the dashboard link rather than silence), so
// an operator who onboarded last week is never told to go and do it (ADR-1158's defect class).
//
// SERVER COMPONENT. Both entry props do their own reads, so a caller passes who gets paid and which
// paths this surface covers, and nothing else.

/** The prompt for a SPACE's money paths: the space OWNER is the payee (ADR-819), so an admin who is
 *  not the owner is told who has to act instead of being handed a button for the wrong account. */
export async function SpacePayoutSetupPrompt({
  space,
  viewerProfileId,
  channels,
  className,
  whenReady,
}: {
  space: { ownerProfileId?: string | null; owner_profile_id?: string | null; name?: string | null; brandName?: string | null }
  viewerProfileId: string | null
  channels: readonly PayoutChannel[]
  className?: string
  /** `status` on a surface where this card IS the payments UI, so a ready owner sees the dashboard
   *  link instead of nothing at all. Omitted keeps the nudge semantics. */
  whenReady?: 'silent' | 'status'
}) {
  const prompt = await resolveSpacePayoutPrompt({ space, viewerProfileId, channels, whenReady })
  return <PayoutPromptCard prompt={prompt} className={className} />
}

/** The prompt for a PROFILE payee (a maker's listing, a personal event's tickets). */
export async function PayoutSetupPrompt({
  payeeProfileId,
  viewerProfileId,
  channels,
  payeeName,
  className,
  whenReady,
}: {
  payeeProfileId: string | null
  viewerProfileId: string | null
  channels: readonly PayoutChannel[]
  payeeName?: string | null
  className?: string
  /** See SpacePayoutSetupPrompt.whenReady. */
  whenReady?: 'silent' | 'status'
}) {
  const prompt = await resolveProfilePayoutPrompt({
    payeeProfileId,
    viewerProfileId,
    channels,
    payeeName,
    whenReady,
  })
  return <PayoutPromptCard prompt={prompt} className={className} />
}

/** The same prompt for a surface that holds only a space id, resolving the viewer itself. One prop.
 *  Prefer <SpacePayoutSetupPrompt> when the caller already loaded the space. */
export async function SpacePayoutSetupPromptById({
  spaceId,
  channels,
  className,
  whenReady,
}: {
  spaceId: string
  channels: readonly PayoutChannel[]
  className?: string
  /** See SpacePayoutSetupPrompt.whenReady. */
  whenReady?: 'silent' | 'status'
}) {
  const caller = await getCallerProfile()
  const prompt = await resolveSpacePayoutPromptById({
    spaceId,
    viewerProfileId: caller?.id ?? null,
    channels,
    whenReady,
  })
  return <PayoutPromptCard prompt={prompt} className={className} />
}
