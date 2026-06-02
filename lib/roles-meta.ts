import type { CommunityRole } from '@/lib/core/roles'
import { ROLE_HIERARCHY } from '@/lib/core/roles'

// Themed badge metadata per community role. The emoji is the "icon box" starting
// point (editable persistence is a later phase); the blurb is the one-line
// summary shown on the role roster. Badge colors come from roleBadgeStyle in
// lib/community-roles.
export const ROLE_META: Record<CommunityRole, { emoji: string; blurb: string }> = {
  member:  { emoji: '🌱', blurb: 'Shows up — joins circles, RSVPs, logs practices.' },
  crew:    { emoji: '⚙️', blurb: 'Active contributor helping their circle run day to day.' },
  host:    { emoji: '🔑', blurb: 'Runs a circle — creates events and sets the weekly practice.' },
  guide:   { emoji: '🧭', blurb: 'Stewards a hub of circles in their area.' },
  mentor:  { emoji: '🌟', blurb: 'Stewards a nexus; develops hosts and guides.' },
  admin:   { emoji: '🗝️', blurb: 'Near-full keys — Studio, structural admin, and marketing pages.' },
  janitor: { emoji: '🛡️', blurb: 'Full keys — roles, members, moderation, and the permission grid.' },
}

/** The next role up the ladder, or null if already at the top (janitor). */
export function nextRole(role: CommunityRole): CommunityRole | null {
  const i = ROLE_HIERARCHY.indexOf(role)
  return i >= 0 && i < ROLE_HIERARCHY.length - 1 ? ROLE_HIERARCHY[i + 1] : null
}
