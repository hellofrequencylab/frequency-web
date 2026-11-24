import 'server-only'
import { listSpaceTeam } from '@/lib/spaces/membership'
import type { MentionPerson } from '@/components/mentions/use-tag-picker'

// WHO IS ON A SPACE'S TEAM, for an item thread (LIVE-2527): the owner and every active member. These
// are the people the thread is shared with (item_comments reads follow can_write_space_content), so
// they are the only people @ offers and the only people a tag or a reply may reach. The names come
// from lib/spaces/membership.ts, the one service-role reader of the team.

export async function spaceTeamIds(spaceId: string): Promise<Set<string>> {
  return new Set((await listSpaceTeam(spaceId)).map((m) => m.profileId))
}

/** Display names for the team, by profile id. */
export async function spaceTeamNames(spaceId: string): Promise<Map<string, string>> {
  return new Map((await listSpaceTeam(spaceId)).map((m) => [m.profileId, m.name]))
}

/** The team as the @ list offers it, everyone but the viewer. */
export async function spaceTeamPeople(spaceId: string, viewerProfileId: string | null): Promise<MentionPerson[]> {
  return (await listSpaceTeam(spaceId))
    .filter((m) => m.profileId !== viewerProfileId)
    .map((m) => ({ value: m.profileId, label: m.name }))
    .sort((a, b) => a.label.localeCompare(b.label))
}
