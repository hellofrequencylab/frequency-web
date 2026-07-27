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
import { Gem } from 'lucide-react'

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

// The gold Founding chip — a PEER of the RoleBadge, shown beside "Member" for a Founding
// Member (profiles.is_founding_member). It paints with the brand gold rank token (season
// ranks apex on gold — the highest-energy identity mark), reusing the same .rank-badge
// primitive as every other role chip, so it sits cleanly beside them with no hardcoded colour.
// Render only when the member actually holds founding status (caller-resolved, like
// CharterBadge / VerifiedBadge). The chip reads "Founder"; the durable status stays the
// canonical "Founding Member" (the title attribute + is_founding_member flag).
export function FoundingBadge({
  founding,
  className,
}: {
  founding?: boolean | null
  className?: string
}) {
  if (!founding) return null
  return (
    <span
      className={`rank-badge inline-flex items-center gap-1 ${className ?? 'text-3xs leading-tight'}`}
      style={rankBadgeStyle('gold')}
      title="Founding Member"
    >
      <Gem className="h-3 w-3" aria-hidden />
      Founder
    </span>
  )
}

// The Space-side twin of FoundingBadge: the mark an active FOUNDING BUSINESS wears on its profile
// header and its directory card. It lives HERE, next to the member chip, so the two can never drift
// apart visually — same .rank-badge primitive, same gold rank token, same Gem glyph, same sizing prop.
// A member founder reads "Founder"; a Space founder reads "Founding Business" (the locked cohort term,
// NAMING/canon: Founding Members + Founding Businesses).
//
// PRICE STAYS PRIVATE: this component takes a BOOLEAN and nothing else. The locked monthly rate on the
// founding_members row is a private commercial term between the operator and Frequency, so it is never
// a prop here and never reaches the tooltip. The badge is a status, not a price tag.
//
// `founding` is caller-resolved (like FoundingBadge / CharterBadge / VerifiedBadge) — resolve it with
// foundingBadgeForSpace (one Space) or foundingBadgesForSpaces (a grid, one query) from
// lib/founding/status.ts. This component performs no data read of its own.
export function FoundingBusinessBadge({
  founding,
  className,
}: {
  founding?: boolean | null
  className?: string
}) {
  if (!founding) return null
  return (
    <span
      className={`rank-badge inline-flex items-center gap-1 ${className ?? 'text-3xs leading-tight'}`}
      style={rankBadgeStyle('gold')}
      title="Founding Business. One of the first businesses to join Frequency."
    >
      <Gem className="h-3 w-3" aria-hidden />
      Founding Business
    </span>
  )
}
