import Image from 'next/image'
import type { SpaceContentData } from '@/lib/spaces/content-data'
import type { SpaceProfileContext } from '@/lib/spaces/profile-modules'
import { getInitials } from '@/lib/utils'
import { ModuleSection } from './section'

// TEAM — the people who run this space. Reads the team roster off the data bag (getSpaceTeam: active
// space_members holding an operator role, joined to their public profile). FAIL-SAFE: no team, no
// section (an operator who has added no team, or a soloed space, renders nothing — never invented data).
export function TeamBlock({
  data,
  header,
}: {
  space: SpaceProfileContext
  data: SpaceContentData
  header?: { eyebrow?: string; heading?: string }
}) {
  const team = data.team ?? []
  if (team.length === 0) return null
  return (
    <ModuleSection anchor="team">
      <div>
        <p className="text-2xs font-bold uppercase tracking-[0.2em] text-primary-strong">{header?.eyebrow ?? 'The people'}</p>
        <h2 className="mt-1.5 text-xl font-bold tracking-tight text-text sm:text-2xl">{header?.heading ?? 'Team'}</h2>
        <ul className="mt-6 grid gap-4 @sm/profile:grid-cols-2 @xl/profile:grid-cols-3">
          {team.map((member) => (
            <li
              key={member.profileId}
              className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3 shadow-sm"
            >
              {member.avatarUrl ? (
                <Image
                  src={member.avatarUrl}
                  alt=""
                  width={44}
                  height={44}
                  className="h-11 w-11 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-bg text-sm font-bold text-primary-strong"
                  aria-hidden
                >
                  {getInitials(member.name)}
                </span>
              )}
              {/* A horizontal name tag: avatar on the left, name (+ handle) on ONE line to its right. flex-1
                  min-w-0 gives the name the row's remaining width; `truncate` keeps it to a single line and
                  ellipsizes only when genuinely too narrow — it never wraps a name character-by-character
                  (the bug from breaking words in a narrow Main/Side column). */}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-text">{member.name}</span>
                {member.handle && <span className="block truncate text-xs text-muted">@{member.handle}</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </ModuleSection>
  )
}
