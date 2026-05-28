// Single source of truth for community-role chips.
//
// Each role maps to one Dawn rank colour so they all read as a family but
// stay distinct. The progression climbs from neutral grey (Member) to
// lavender (Janitor) — same six colours used everywhere a role chip shows
// up so a "Host" badge never reads identical to a "Crew" or "Janitor"
// badge anywhere in the app.

import type { RankKey } from '@/lib/season-ranks'
import { rankBadgeStyle } from '@/lib/season-ranks'

export type CommunityRole = 'member' | 'crew' | 'host' | 'guide' | 'mentor' | 'janitor'

// Ladder: stone (grey) → clay → jade → teal → indigo → plum (lavender).
// Six distinct colours, ordered as a felt progression.
export const ROLE_RANK: Record<CommunityRole, RankKey> = {
  member:  'stone',
  crew:    'clay',
  host:    'jade',
  guide:   'teal',
  mentor:  'indigo',
  janitor: 'plum',
}

export const ROLE_LABEL: Record<CommunityRole, string> = {
  member:  'Member',
  crew:    'Crew',
  host:    'Host',
  guide:   'Guide',
  mentor:  'Mentor',
  janitor: 'Janitor',
}

// Inline style triplet to feed into the .rank-badge CSS class. Pass the
// result to a `style={}` prop on the chip element.
export function roleBadgeStyle(role: CommunityRole): React.CSSProperties {
  return rankBadgeStyle(ROLE_RANK[role])
}

// Ready-made chip. Use this everywhere a role badge shows up so the colour
// stays consistent — no per-page ROLE_COLOR / ROLE_BADGE constants.
export function RoleBadge({
  role,
  className,
  capitalize,
}: {
  role: CommunityRole | string | null | undefined
  /** Extra utility classes (size, margin). */
  className?: string
  /** Set to false to render the role name as-is instead of the canonical
   *  Title-Case label. Useful when the source string is already cleaned. */
  capitalize?: boolean
}) {
  const safeRole = (role && ROLE_RANK[role as CommunityRole])
    ? (role as CommunityRole)
    : 'member'
  const label = capitalize === false
    ? String(role ?? ROLE_LABEL[safeRole])
    : ROLE_LABEL[safeRole]
  return (
    <span
      className={`rank-badge ${className ?? 'text-[10px] leading-tight'}`}
      style={roleBadgeStyle(safeRole)}
    >
      {label}
    </span>
  )
}
