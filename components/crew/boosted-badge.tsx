import { TierChip } from '@/components/pricing/tier-chip'

// The BOOSTED mark (LIVE-756). A Crew member gave this Space a Boost in the last 7 days. Owner ruling
// 2026-10-06 ("Circles only"): a Boost lifts a Circle in discovery, but a Space only wears this mark,
// and the Space directory keeps its earned order (LIVE-262). The look is the shared TierChip, so Boosted
// reads the same on every Space card, header and directory row. Server-friendly.
export function BoostedBadge({ boosted, className = '' }: { boosted?: boolean | null; className?: string }) {
  if (!boosted) return null
  return <TierChip tier="boosted" className={className} />
}
