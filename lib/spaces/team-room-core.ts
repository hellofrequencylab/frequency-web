// The pure half of the Space team room (LIVE-2529): its name and how its members follow the team.
// See lib/spaces/team-room.ts.

interface TeamSeat {
  profileId: string
  admin: boolean
}

/** "Sunset Yoga team". A blank name still reads as a room. */
export function teamRoomName(spaceName: string | null | undefined): string {
  const name = (spaceName ?? '').trim()
  return name ? `${name.slice(0, 80)} team` : 'Space team'
}

/**
 * Bring the room in line with the team. The owner and Space admins are room admins; every other
 * active member is a plain member. Someone in the room who is no longer on the team leaves. A row
 * that is already right is left alone, so a re-run writes nothing.
 */
export function teamRoomPlan(input: { ownerId: string; team: readonly TeamSeat[]; current: readonly TeamSeat[] }): {
  upsert: TeamSeat[]
  remove: string[]
} {
  const want = new Map<string, boolean>()
  for (const m of input.team) want.set(m.profileId, (want.get(m.profileId) ?? false) || m.admin)
  want.set(input.ownerId, true)

  const have = new Map(input.current.map((m) => [m.profileId, m.admin]))
  const upsert: TeamSeat[] = []
  for (const [profileId, admin] of want) if (have.get(profileId) !== admin) upsert.push({ profileId, admin })
  const remove = [...have.keys()].filter((id) => !want.has(id))
  return { upsert, remove }
}
