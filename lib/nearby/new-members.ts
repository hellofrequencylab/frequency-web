// Who the Around You "New to the community" row lists. Pure, so the privacy rule is testable:
// the row only ever shows a member the Members directory would show (Show me in the directory ON,
// Ghost mode OFF), never Vera, never the viewer, and never a row with nothing to show or link to.
// It shows a name and a photo and says nothing about where anyone is.

import { isListableInDirectory, type DirectoryTarget } from '@/lib/connections/directory-visibility'

export type NewMemberRow = DirectoryTarget & {
  display_name: string | null
  handle: string | null
  avatar_url: string | null
  created_at: string
  is_system?: boolean | null
}

const NEW_MEMBERS_COUNT = 8

/** `rows` must already be ordered newest first. */
export function pickNewMembers(rows: NewMemberRow[], viewerId: string, count = NEW_MEMBERS_COUNT): NewMemberRow[] {
  return rows
    .filter(
      (r) =>
        r.id !== viewerId &&
        !r.is_system &&
        !!r.handle?.trim() &&
        !!r.display_name?.trim() &&
        isListableInDirectory(r),
    )
    .slice(0, count)
}
