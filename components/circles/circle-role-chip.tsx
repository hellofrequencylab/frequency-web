import { RankBadge } from '@/components/ui/rank-badge'
import type { RankKey } from '@/lib/season-ranks'
import { CIRCLE_ROLE_LABEL, type CircleRole } from '@/lib/core/circle-roles'

// The chip a circle rung wears on a roster (ADR-1014). A sibling of `RoleBadge`
// (lib/community-roles.tsx), not a replacement: that one names a rung on the GLOBAL
// community ladder, this one names a rung INSIDE one circle.
//
// 🔴 WHY IT CANNOT BE `RoleBadge`. The two ladders share storage and not meaning. A circle
// Admin is stored as `volunteer_role='guide'` because that value outranks 'host' in the
// Postgres enum, and `RoleBadge` would faithfully print "Guide" — the global word for
// someone who oversees local hosts, which is not the job. One value, two vocabularies; the
// roster has to speak the circle's. Rendering the stored value through `RoleBadge` on a
// circle roster is the drift this component exists to prevent.
//
// It composes the SAME kit primitive `RoleBadge` does (`components/ui/rank-badge`), off the
// same rank tokens, so the two chips sit beside each other and read as one family.

// Rank colours climb with authority, matching the community ladder's own family: the circle
// Host takes the apex plum, Admin teal, Moderator jade, Member neutral stone.
const CIRCLE_ROLE_RANK: Record<CircleRole, RankKey> = {
  host: 'plum',
  admin: 'teal',
  moderator: 'jade',
  member: 'stone',
}

export function CircleRoleChip({
  role,
  className,
}: {
  role: CircleRole
  className?: string
}) {
  return (
    <RankBadge rank={CIRCLE_ROLE_RANK[role]} size="sm" dot={false} className={className}>
      {CIRCLE_ROLE_LABEL[role]}
    </RankBadge>
  )
}
