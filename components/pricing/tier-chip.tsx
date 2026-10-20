import { Rocket, Sparkle } from 'lucide-react'
import { RankBadge, type RankBadgeSize } from '@/components/ui/rank-badge'
import { TIER_MARKS, type TierMarkKey } from '@/lib/pricing/tier-marks'

// THE TIER CHIP. The one pill for every tier, rank and status mark on people and Spaces: Member and Crew,
// the Space plans (Free, Business, Non Profit, Independent, Collective, Network), Founder, Founding Business
// and Boosted. It composes RankBadge (the rank spectrum primitive both designs already style), and the
// registry in lib/pricing/tier-marks.ts decides name, colour and glyph, so a mark reads the same on a member
// card, a profile header, a Space card and the Menu and features index. A ladder rung wears the rank dot, a
// status mark wears a glyph, and nothing here draws a second look. Server-friendly, no hooks.
//
//   <TierChip tier="crew" />
//   <TierChip tier="business" size="md" />
//   <TierChip tier="founding_business" />

export function TierChip({
  tier,
  size = 'sm',
  className,
  label,
}: {
  tier: TierMarkKey
  size?: RankBadgeSize
  className?: string
  /** Override the words (a row that says "Free, more on Business"). The colour and glyph stay the tier's. */
  label?: string
}) {
  const mark = TIER_MARKS[tier]
  const Glyph = mark.glyph === 'sparkle' ? Sparkle : mark.glyph === 'rocket' ? Rocket : null
  return (
    <RankBadge rank={mark.rank} size={size} dot={Glyph === null} className={className} title={mark.title}>
      {Glyph && <Glyph className="h-3 w-3" aria-hidden />}
      {label ?? mark.label}
    </RankBadge>
  )
}
