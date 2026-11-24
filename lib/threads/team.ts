import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSpaceById } from '@/lib/spaces/store'
import { listSpaceMembers } from '@/lib/spaces/membership'
import type { MentionPerson } from '@/components/mentions/use-tag-picker'

// WHO IS ON A SPACE'S TEAM, for an item thread (LIVE-2527): the owner and every active member. These
// are the people the thread is shared with (item_comments reads follow can_write_space_content), so
// they are the only people @ offers and the only people a tag or a reply may reach.

export async function spaceTeamIds(spaceId: string): Promise<Set<string>> {
  const ids = new Set<string>()
  const space = await getSpaceById(spaceId)
  if (space?.ownerProfileId) ids.add(space.ownerProfileId)
  for (const m of await listSpaceMembers(spaceId)) if (m.status === 'active') ids.add(m.profileId)
  return ids
}

/** Display names by profile id. Service-role read of names only, for people the caller already shares a thread with. */
export async function profileNames(ids: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)].filter(Boolean)
  if (unique.length === 0) return new Map()
  const { data } = await createAdminClient().from('profiles').select('id, display_name').in('id', unique)
  return new Map((data ?? []).map((p) => [p.id, p.display_name?.trim() || 'Someone']))
}

/** The team as the @ list offers it, everyone but the viewer. */
export async function spaceTeamPeople(spaceId: string, viewerProfileId: string | null): Promise<MentionPerson[]> {
  const ids = [...(await spaceTeamIds(spaceId))].filter((id) => id !== viewerProfileId)
  const names = await profileNames(ids)
  return ids
    .map((id) => ({ value: id, label: names.get(id) ?? 'Someone' }))
    .sort((a, b) => a.label.localeCompare(b.label))
}
