import type { Metadata } from 'next'
import Link from 'next/link'
import { Stamp } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { DashboardTemplate } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { SectionHeader } from '@/components/ui/section-header'
import { StampCard } from '@/components/loyalty/stamps'
import { HuntProgressList } from '@/components/loyalty/hunt-progress'
import { LiveHuntsList, NearbyRegularsList } from '@/components/loyalty/nearby'
import { listMyHuntProgress } from '@/lib/loyalty/hunt-store'
import { listLiveHunts, listNearbyRegulars } from '@/lib/loyalty/discover'
import { listMyLoyaltyCards, loyaltyEnabled } from '@/lib/loyalty/store'

export const dynamic = 'force-dynamic'

// MY REWARDS (LIVE-940, docs/LOYALTY.md): every Regulars card the member holds, with any reward code
// waiting to be collected. A member page behind sign-in: noindex, the global rail (railFor falls through).
// Hunts the member has started sit under the cards (LIVE-942). Under those, the Spaces running Regulars
// nearest the member and the hunts live today (LIVE-944), so a member with no card yet sees where to get
// one. No em dashes.
export const metadata: Metadata = {
  title: 'Rewards',
  robots: { index: false },
}

export default async function RewardsPage() {
  const profileId = await getMyProfileId()
  const on = !!profileId && loyaltyEnabled()
  const [cards, hunts, nearby, liveHunts] = on
    ? await Promise.all([listMyLoyaltyCards(profileId), listMyHuntProgress(profileId), listNearbyRegulars(profileId), listLiveHunts()])
    : [[], [], [], []]
  const started = new Set(hunts.map((h) => h.slug))
  const openHunts = liveHunts.filter((h) => !started.has(h.slug))

  return (
    <DashboardTemplate
      title="Rewards"
      description="Your stamp cards at the places you check in. A full card earns the reward the shop set."
      width="default"
    >
      {hunts.length > 0 && (
        <section className="mb-6">
          <SectionHeader title="Hunts" count={hunts.length} />
          <HuntProgressList hunts={hunts} />
        </section>
      )}
      {cards.length === 0 ? (
        <EmptyState
          icon={Stamp}
          title="No cards yet."
          description="Check in at a shop that runs Regulars and your first card lands here, with 25 Zaps for the visit."
          action={
            <Link href={nearby.length > 0 ? '#near-you' : '/discover/spaces'} className="btn">
              Find a place
            </Link>
          }
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {cards.map((c) => (
            <li key={c.spaceId}>
              <Link href={`/spaces/${c.spaceSlug}`} className="block rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong">
                <StampCard
                  spaceName={c.spaceName}
                  stamps={c.stamps}
                  required={c.required}
                  rewardTitle={c.rewardTitle}
                  rewardValueCents={c.rewardValueCents}
                  openRewards={c.openRewards}
                  standing={c.standing}
                  surpriseOdds={c.surpriseOdds}
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {nearby.length > 0 && (
        <section className="mt-8" id="near-you">
          <SectionHeader title="Near you" count={nearby.length} />
          <NearbyRegularsList places={nearby} />
        </section>
      )}
      {openHunts.length > 0 && (
        <section className="mt-8">
          <SectionHeader title="Hunts on now" count={openHunts.length} />
          <LiveHuntsList hunts={openHunts} />
        </section>
      )}
    </DashboardTemplate>
  )
}
