import type { ElementType } from 'react'
import { Sprout, Cog, KeyRound, Compass, Star, Key, Shield } from 'lucide-react'
import type { CommunityRole } from '@/lib/core/roles'
import { ROLE_HIERARCHY } from '@/lib/core/roles'

// Themed badge metadata per community role. The icon is a lucide glyph (no emojis
// on roles and permissions — they read as UI chrome, not copy); the blurb is the
// one-line summary shown on the role roster. Badge colors come from roleBadgeStyle
// in lib/community-roles.
export const ROLE_META: Record<CommunityRole, { Icon: ElementType; blurb: string }> = {
  member:  { Icon: Sprout,   blurb: 'Shows up. Joins circles, RSVPs, logs practices.' },
  crew:    { Icon: Cog,      blurb: 'Active contributor helping their circle run day to day.' },
  host:    { Icon: KeyRound, blurb: 'Runs a circle: creates events and sets the weekly practice.' },
  guide:   { Icon: Compass,  blurb: 'Stewards a hub of circles in their area.' },
  mentor:  { Icon: Star,     blurb: 'Stewards a nexus; develops hosts and guides.' },
  admin:   { Icon: Key,      blurb: 'Near-full keys: Studio, structural admin, and marketing pages.' },
  janitor: { Icon: Shield,   blurb: 'Full keys: roles, members, moderation, and the permission grid.' },
}

/** The next role up the ladder, or null if already at the top (janitor). */
export function nextRole(role: CommunityRole): CommunityRole | null {
  const i = ROLE_HIERARCHY.indexOf(role)
  return i >= 0 && i < ROLE_HIERARCHY.length - 1 ? ROLE_HIERARCHY[i + 1] : null
}
