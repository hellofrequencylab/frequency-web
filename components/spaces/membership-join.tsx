import { BadgeCheck, Users } from 'lucide-react'
import { listMembershipTiers, getMyMembership } from '@/lib/spaces/memberships'
import { billingLive } from '@/lib/pricing/settings'
import { EmptyState } from '@/components/ui/empty-state'
import { MembershipJoinCard } from '@/components/spaces/membership-join-card'
import { MembershipCancelButton } from '@/components/spaces/membership-cancel-button'

// MEMBER JOIN SURFACE (ENTITY-SPACES-SYSTEM §2.5, memberships v1). The self-fetching server half of
// the Business "Join" tab: it loads this Space's active tiers and the viewer's own membership (if
// any), then renders the join cards (or, when the viewer is already a member, their current tier +
// a Cancel). When the owner has not published any tiers, an EmptyState names the situation and the
// next step. Server-first; the fetch sits behind a <Suspense> in the caller (entity-cta) so the tab
// paints instantly (PAGE-FRAMEWORK §5).
//
// HONESTY (CONTENT-VOICE skeptic test): v1 takes NO payment. The price is what membership will cost;
// joining registers the member now and paid billing comes later. The copy here and in the join card
// says so plainly, with no narrated feelings and no em/en dashes (CONTENT-VOICE §10).

export async function MembershipJoin({ spaceId }: { spaceId: string }) {
  const [tiers, mine, billingOn] = await Promise.all([
    listMembershipTiers(spaceId),
    getMyMembership(spaceId),
    // When billing is live, a PAID tier joins through Stripe Checkout; while OFF this is false and
    // the join card keeps the EXACT display-only behavior (joinTier records a membership, no charge).
    billingLive(),
  ])

  // Already a member: show the current tier + a Cancel, never the join cards.
  if (mine) {
    const since = new Intl.DateTimeFormat('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(mine.startedAt))
    return (
      <div className="rounded-2xl border border-success/30 bg-success-bg px-6 py-8 text-center">
        <BadgeCheck className="mx-auto mb-3 h-8 w-8 text-success" aria-hidden />
        <p className="text-sm font-semibold text-text">You are a member.</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
          {mine.tierName} since {since}.
        </p>
        <div className="mt-4 flex justify-center">
          <MembershipCancelButton membershipId={mine.id} />
        </div>
      </div>
    )
  }

  if (tiers.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No membership tiers yet."
        description="This space has not posted any tiers. Follow it to hear the moment membership opens."
      />
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        {billingOn
          ? 'Pick a tier to join. A paid tier opens secure checkout; a free tier registers you right away.'
          : 'Pick a tier to join. Joining registers you as a member. We do not take a payment yet, so paid billing is coming later.'}
      </p>
      <div className="grid gap-4 @lg:grid-cols-2">
        {tiers.map((tier) => (
          <MembershipJoinCard key={tier.id} spaceId={spaceId} tier={tier} billingOn={billingOn} />
        ))}
      </div>
    </div>
  )
}
