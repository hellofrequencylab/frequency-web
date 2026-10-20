import { RoleBadge, type RoleChipKey } from '@/lib/community-roles'
import { TierChip } from '@/components/ui/tier-chip'
import type { RankBadgeSize } from '@/components/ui/rank-badge'

// THE MEMBER MARK CLUSTER. What a person wears beside their name on every member page and index: the
// community role when it is above Member, Crew when they are on the paid membership, Founder when they
// hold founding status. A person with none of those wears one quiet Member chip, so every card carries the
// same anatomy and a grid of ordinary members is not a wall of nothing. Same chips in the same order on the
// member directory, Friends, circle rosters and the profile header.
//
// Presentational + server-friendly. Callers resolve the facts (role, Crew via isEndorsed(membership_tier),
// founding via profiles.is_founding_member) exactly as they already do.
export function MemberTierMarks({
  role,
  crew = false,
  founding = false,
  size = 'sm',
}: {
  role?: RoleChipKey | null
  crew?: boolean
  founding?: boolean
  size?: RankBadgeSize
}) {
  const showRole = role != null && role !== 'member'
  if (!showRole && !crew && !founding) return <TierChip tier="member" size={size} />
  return (
    <>
      {showRole && <RoleBadge role={role} size={size} />}
      {crew && <TierChip tier="crew" size={size} />}
      {founding && <TierChip tier="founder" size={size} />}
    </>
  )
}
