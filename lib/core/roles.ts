// Single source of truth for the community-role ladder and comparisons.
//
// Framework-independent (no Next/Supabase imports) so the web app, the future
// mobile app, and server-side enforcement all share one definition. This is the
// canonical home for the `HIERARCHY` pattern that is currently duplicated across
// several server-action files — new code should import from here; existing
// duplicates can adopt it incrementally.

export type CommunityRole =
  | 'member'
  | 'crew'
  | 'host'
  | 'guide'
  | 'mentor'
  | 'admin'
  | 'janitor'

// Ascending privilege: member < crew < host < guide < mentor < admin < janitor.
// 'admin' sits just below janitor — nearly the same keys, minus the most
// sensitive (role assignment, member management, the permission grid).
export const ROLE_HIERARCHY: readonly CommunityRole[] = [
  'member',
  'crew',
  'host',
  'guide',
  'mentor',
  'admin',
  'janitor',
] as const

/** Numeric rank (0 = member … 5 = janitor); -1 for null/unknown. */
export function roleRank(role: CommunityRole | null | undefined): number {
  return role ? ROLE_HIERARCHY.indexOf(role) : -1
}

/** True when `role` is at least `min` on the ladder. */
export function atLeastRole(
  role: CommunityRole | null | undefined,
  min: CommunityRole,
): boolean {
  return roleRank(role) >= roleRank(min)
}
