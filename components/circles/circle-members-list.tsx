'use client'

// Compact members roster for the circle's right rail: shows the first few
// members, then a disclosure to reveal the rest. Client island so the
// expand/collapse is interactive while the page stays a Server Component.

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { MessageSquare } from 'lucide-react'
import { startConversation } from '@/app/(main)/messages/actions'
import { getInitials } from '@/lib/utils'
import { ProfileFlair } from '@/components/profile-flair'
import { isEndorsed } from '@/lib/season-ranks'
import { type CommunityRole, RoleBadge } from '@/lib/community-roles'

const INITIAL_VISIBLE = 5

type MemberProfile = {
  id: string
  display_name: string
  handle: string
  avatar_url: string | null
  community_role: CommunityRole
  /** Entitlement tier — drives endorsement (PB.1i: flair keys off the tier, not the role). */
  membership_tier: string | null
  current_season_rank: string | null
  current_streak: number
}

export type CircleMemberItem = {
  profile: MemberProfile
  volunteer_role: CommunityRole | null
}

export function CircleMembersList({
  members,
  hostId,
  myProfileId,
  isMember,
}: {
  members: CircleMemberItem[]
  hostId: string | null
  myProfileId: string | null
  isMember: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  if (members.length === 0) {
    return <p className="text-sm text-subtle">No members yet.</p>
  }

  const hasMore = members.length > INITIAL_VISIBLE
  const visible = expanded ? members : members.slice(0, INITIAL_VISIBLE)

  return (
    <div>
      <div className="space-y-0.5">
        {visible.map(({ profile, volunteer_role }) => {
          const memberIsHost = hostId === profile.id
          const isSelf = profile.id === myProfileId

          return (
            <div
              key={profile.id}
              className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-surface transition-colors -mx-3 group"
            >
              <Link
                href={`/people/${profile.handle}`}
                className="flex items-center gap-3 flex-1 min-w-0"
              >
                {profile.avatar_url ? (
                  <Image
                    src={profile.avatar_url}
                    alt={profile.display_name}
                    width={32}
                    height={32}
                    className="w-8 h-8 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-primary-bg text-primary-strong text-xs font-semibold flex items-center justify-center shrink-0 select-none">
                    {getInitials(profile.display_name)}
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-medium text-text truncate">
                      {profile.display_name}
                    </span>
                    {memberIsHost && (
                      <span className="text-xs px-1.5 py-0.5 rounded-md bg-success-bg text-success font-medium">
                        Host
                      </span>
                    )}
                    {volunteer_role && !memberIsHost && (
                      <RoleBadge role={volunteer_role} className="text-xs leading-tight" />
                    )}
                    <ProfileFlair
                      rank={profile.current_season_rank}
                      streak={profile.current_streak}
                      endorsed={isEndorsed(profile.membership_tier)}
                      compact
                    />
                  </div>
                  <p className="text-xs text-subtle mt-0.5">@{profile.handle}</p>
                </div>
              </Link>

              {!isSelf && isMember && (
                <form action={startConversation.bind(null, profile.id)}>
                  <button
                    type="submit"
                    title={`Message ${profile.display_name}`}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-subtle hover:text-primary-strong hover:bg-primary-bg transition-all"
                  >
                    <MessageSquare className="w-4 h-4" />
                  </button>
                </form>
              )}
            </div>
          )
        })}
      </div>

      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-xs font-medium text-primary-strong hover:underline"
        >
          {expanded ? 'Show less' : `Show all (${members.length})`}
        </button>
      )}
    </div>
  )
}
