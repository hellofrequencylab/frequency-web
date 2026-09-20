// SPACE DISCUSSION (LIVE-421 / ADR-1469).
//
// FOCUS-MODEL named a missing `posts.scope_space_id`. Premise re-tested 2026-09-20: the Space
// Circle (ADR-1391, ADR-1393, ADR-1395) already is the Space's conversation. Posts stay
// circle-scoped. Replies already live on that feed. What was missing is a door on the Space
// itself, named Discussion, never Community (NAMING.md).
//
// GATES, in order:
//   • ROOT never offers it. Same leak class the Circles tab closed.
//   • A live hub is `is_space_primary` plus LISTABLE_CIRCLE_STATUS. Off is `inactive`.
//   • A manager keeps the tab when the hub is off, because that empty state is where they
//     turn it on. A visitor is never offered a tab over a room that is not there.
//
// Reads use the admin client. The Circles tab already proved this shape. Fail-closed.

import { createAdminClient } from '@/lib/supabase/admin'
import { LISTABLE_CIRCLE_STATUS } from '@/lib/circles/visibility'

export type SpaceDiscussionHub = {
  id: string
  slug: string
  name: string
  status: string
  is_space_primary: boolean
  space_id: string | null
}

export function isLiveSpaceHub(
  row: { is_space_primary?: boolean | null; status?: string | null } | null | undefined,
): boolean {
  if (!row) return false
  if (row.is_space_primary !== true) return false
  return (LISTABLE_CIRCLE_STATUS as readonly string[]).includes(row.status ?? '')
}

export function canSeeSpaceDiscussionTab(args: {
  spaceType: string
  hubLive: boolean
  canManage: boolean
}): boolean {
  if (args.spaceType === 'root') return false
  return args.hubLive || args.canManage
}

/**
 * The Space Circle when it is on. Null when the Space has turned it off, when the row is
 * missing, or on a broken read.
 */
export async function getLiveSpaceCircle(spaceId: string): Promise<SpaceDiscussionHub | null> {
  if (!spaceId) return null
  try {
    const { data, error } = await createAdminClient()
      .from('circles')
      .select('id, slug, name, status, is_space_primary, space_id')
      .eq('space_id', spaceId)
      .eq('is_space_primary', true)
      .in('status', [...LISTABLE_CIRCLE_STATUS])
      .limit(1)
    if (error) return null
    const row = ((data as SpaceDiscussionHub[] | null) ?? [])[0] ?? null
    return isLiveSpaceHub(row) ? row : null
  } catch {
    return null
  }
}
