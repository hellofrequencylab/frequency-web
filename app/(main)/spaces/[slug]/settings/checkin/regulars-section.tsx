import { Flag, Gift, Stamp, Ticket } from 'lucide-react'
import { SectionHeader } from '@/components/ui/section-header'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { LoyaltyProgramForm } from '@/components/spaces/loyalty/program-form'
import { HandoutRoster } from '@/components/spaces/loyalty/handout-roster'
import { HuntsPanel } from '@/components/spaces/loyalty/hunts-panel'
import { listHuntsForSpace } from '@/lib/loyalty/hunt-store'
import {
  getLoyaltyProgram,
  listRewardsToHandOut,
  loyaltyEligibility,
  loyaltyEnabled,
  loyaltyOwnerCounts,
} from '@/lib/loyalty/store'
import type { Space } from '@/lib/spaces/types'

// REGULARS, the owner side (LIVE-940, ADR-1780, docs/LOYALTY.md). Lives INSIDE the Check-in panel because
// the program rides the door code that panel prints: the same scan that fills the roster stamps the card.
// No new module, panel or menu row (MENU-CONTRACT). The gate is the Space's own: a physical location and a
// plan at or above Business (loyaltyEligibility); a draft saves on any Space. While LOYALTY_ENABLED is off
// the section says so and shows nothing to edit. Copy obeys CONTENT-VOICE, no em dashes.

export async function RegularsSection({ space, staffViewing }: { space: Space; staffViewing: boolean }) {
  if (!loyaltyEnabled()) {
    return (
      <section>
        <SectionHeader title="Regulars" />
        <EmptyState
          icon={Stamp}
          title="Regulars is not open yet."
          description="A stamp card on your door code: every check-in stamps it and pays 25 Zaps, a full card earns a reward you set. It opens with the North County launch."
        />
      </section>
    )
  }

  const [program, blocker, counts, rewards, hunts] = await Promise.all([
    getLoyaltyProgram(space.id),
    loyaltyEligibility(space),
    loyaltyOwnerCounts(space.id),
    listRewardsToHandOut(space.id),
    listHuntsForSpace(space.id),
  ])

  return (
    <>
      <section>
        <SectionHeader title="Regulars" />
        <p className="mb-4 text-body-sm text-muted">
          A stamp card on your door code. Every check-in stamps it and pays the member 25 Zaps; a full card earns the reward you set.
        </p>
        <div className="mb-5 grid grid-cols-3 gap-3 sm:max-w-md">
          <StatCard bordered label="Stamps this month" value={counts.stampsThisMonth} icon={Stamp} />
          <StatCard bordered label="Rewards earned" value={counts.earned} icon={Gift} />
          <StatCard bordered label="Handed out" value={counts.handedOut} icon={Ticket} />
        </div>
        <fieldset disabled={staffViewing} className="contents">
          <LoyaltyProgramForm spaceId={space.id} initial={program} blocker={blocker} />
        </fieldset>
      </section>

      <section>
        <SectionHeader title="Rewards to hand out" count={rewards.length} />
        <fieldset disabled={staffViewing} className="contents">
          <HandoutRoster spaceId={space.id} rewards={rewards} />
        </fieldset>
      </section>

      <section>
        <SectionHeader title="Hunts" count={hunts.length} />
        <p className="mb-4 flex items-center gap-1.5 text-body-sm text-muted">
          <Flag className="h-4 w-4" aria-hidden /> A scavenger hunt across neighboring Spaces: members check in at every stop inside the window to earn the host&apos;s reward.
        </p>
        <fieldset disabled={staffViewing} className="contents">
          <HuntsPanel spaceId={space.id} hunts={hunts} canHost={program.status === 'on' && blocker === null} />
        </fieldset>
      </section>
    </>
  )
}
