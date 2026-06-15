import type { CommunityRole } from '@/lib/core/roles'

// Pure validation for a route's status + visibility (lib/page-settings). Dependency-light so
// it is unit-tested and shared by the save action + the layout enforcement read.

export type PageStatus = 'draft' | 'published'

// The lowest community-ladder rung an operator can require to reach a page ('Anyone' = null).
// Kept to the rungs that make sense as a gate; validated on save so an arbitrary string can
// never reach the enforcement comparison (atLeastRole) in (main)/layout.
export const VISIBILITY_ROLES = ['crew', 'host', 'guide', 'mentor'] as const
export type VisibilityRole = (typeof VISIBILITY_ROLES)[number]

export interface StatusInput {
  status?: string | null
  visibilityRole?: string | null
}
export interface StatusFields {
  status: PageStatus
  visibility_role: CommunityRole | null
}

export function isPageStatus(v: unknown): v is PageStatus {
  return v === 'draft' || v === 'published'
}

export function isVisibilityRole(v: unknown): v is VisibilityRole {
  return typeof v === 'string' && (VISIBILITY_ROLES as readonly string[]).includes(v)
}

/** Normalize input into storable fields. Unknown status → 'published' (the safe default);
 *  an invalid/empty visibility role → null (anyone signed in). */
export function normalizeStatus(input: StatusInput): StatusFields {
  return {
    status: isPageStatus(input.status) ? input.status : 'published',
    visibility_role: isVisibilityRole(input.visibilityRole) ? input.visibilityRole : null,
  }
}
