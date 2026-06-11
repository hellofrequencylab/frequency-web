// Single source of truth for community-role chips.
//
// The COMMUNITY trust ladder (member → crew → host → guide → mentor) maps to one
// Dawn rank colour each so they read as a family but stay distinct, climbing from
// neutral grey (Member) to lavender plum (Mentor — the community apex, NAMING.md
// §Roles). The operational STAFF axis (admin/janitor — now profiles.web_role,
// ADR-208) is NOT aspirational and gets NO rank colour: it renders neutral. The
// admin/janitor keys are retained only for legacy community_role rows on the
// /admin/roles management surface.

import type { RankKey } from '@/lib/season-ranks'
import { rankBadgeStyle } from '@/lib/season-ranks'

export type CommunityRole = 'member' | 'crew' | 'host' | 'guide' | 'mentor' | 'admin' | 'janitor'

// What a chip can SAY is wider than what the role column can HOLD: 'moderator'
// is VIRTUAL (ADR-231) — never stored in the community_role enum, it's the
// member-facing chip for the system voice (Vera, profiles.is_system).
export type RoleChipKey = CommunityRole | 'moderator'

// Community ladder: stone (grey) → clay → jade → teal → plum (lavender, apex).
// admin/janitor are operational web roles → neutral stone (no rank colour).
export const ROLE_RANK: Record<RoleChipKey, RankKey> = {
  member:    'stone',
  crew:      'clay',
  host:      'jade',
  guide:     'teal',
  mentor:    'plum',
  admin:     'stone',
  janitor:   'stone',
  moderator: 'stone',
}

export const ROLE_LABEL: Record<RoleChipKey, string> = {
  member:    'Member',
  crew:      'Crew',
  host:      'Host',
  guide:     'Guide',
  mentor:    'Mentor',
  admin:     'Admin',
  janitor:   'Janitor',
  moderator: 'Moderator',
}

// Inline style triplet to feed into the .rank-badge CSS class. Pass the
// result to a `style={}` prop on the chip element.
export function roleBadgeStyle(role: RoleChipKey): React.CSSProperties {
  return rankBadgeStyle(ROLE_RANK[role])
}

// Ready-made chip. Use this everywhere a role badge shows up so the colour
// stays consistent — no per-page ROLE_COLOR / ROLE_BADGE constants.
export function RoleBadge({
  role,
  className,
  capitalize,
}: {
  role: RoleChipKey | string | null | undefined
  /** Extra utility classes (size, margin). */
  className?: string
  /** Set to false to render the role name as-is instead of the canonical
   *  Title-Case label. Useful when the source string is already cleaned. */
  capitalize?: boolean
}) {
  const safeRole = (role && ROLE_RANK[role as RoleChipKey])
    ? (role as RoleChipKey)
    : 'member'
  const label = capitalize === false
    ? String(role ?? ROLE_LABEL[safeRole])
    : ROLE_LABEL[safeRole]
  return (
    <span
      className={`rank-badge ${className ?? 'text-3xs leading-tight'}`}
      style={roleBadgeStyle(safeRole)}
    >
      {label}
    </span>
  )
}
