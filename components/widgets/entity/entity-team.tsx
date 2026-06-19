import { getActiveSpace } from '@/lib/spaces/active-space'
import { listSpaceMembers } from '@/lib/spaces/membership'
import { createAdminClient } from '@/lib/supabase/admin'
import { SectionHeader } from '@/components/ui/section-header'
import { PersonCard } from '@/components/cards/person-card'

// ENTITY MODULE — Team (ENTITY-SPACES-BUILD §B.2, row `entity-team`). A self-fetching RSC: reads
// the active Space, gathers the OWNER plus active `space_members` (space_id-scoped), looks up each
// one's public profile card, and renders a `PersonCard` grid. NULL when there's no active Space or
// no public people to show (a solo practitioner with no roster → render nothing, not an empty box,
// since a team section only makes sense once there IS a team).
//
// COPY: "The team" is plain; role labels are the space-role nouns (Owner / Admin / …); no
// em/en dashes.
const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  moderator: 'Moderator',
  editor: 'Editor',
  viewer: 'Member',
}

export async function EntityTeam() {
  const space = getActiveSpace()
  if (!space) return null

  const members = (await listSpaceMembers(space.id)).filter((m) => m.status === 'active')

  // The people to show: the owner first, then active members. De-duped by profile id (an owner
  // who also has a member row appears once, as Owner).
  const byProfile = new Map<string, string>() // profileId -> role label
  if (space.ownerProfileId) byProfile.set(space.ownerProfileId, 'Owner')
  for (const m of members) {
    if (!byProfile.has(m.profileId)) byProfile.set(m.profileId, ROLE_LABEL[m.role] ?? 'Member')
  }
  const profileIds = [...byProfile.keys()]
  if (profileIds.length === 0) return null

  const { data } = await createAdminClient()
    .from('profiles')
    .select('id, handle, display_name, avatar_url, is_demo')
    .in('id', profileIds)
    .eq('is_active', true)

  const people = (data ?? []).filter((p) => p.handle && p.display_name)
  if (people.length === 0) return null

  return (
    <div>
      <SectionHeader title="The team" count={people.length} />
      <div className="grid gap-4 @lg:grid-cols-2">
        {people.map((p) => (
          <PersonCard
            key={p.id as string}
            handle={p.handle as string}
            displayName={p.display_name as string}
            avatarUrl={p.avatar_url as string | null}
            isDemo={(p as { is_demo?: boolean }).is_demo ?? false}
            meta={<span className="font-medium text-primary-strong">{byProfile.get(p.id as string)}</span>}
          />
        ))}
      </div>
    </div>
  )
}
