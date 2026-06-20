'use client'

import { useState } from 'react'
import { Check, Plus } from 'lucide-react'
import { buttonClasses } from '@/components/ui/button'

// The FOLLOW affordance in the entity-profile context band (ENTITY-SPACES-BUILD §A.4). A secondary
// action a signed-in viewer taps to follow a Space. The network-follow ledger (a `space_follows`
// table feeding cross-space discovery + the feed) is a later epic; until it lands this is the
// honest UI seam — a local toggle that flips the label, so the design + interaction are real and the
// persistence swaps in behind it without a UI change.
//
// COPY (CONTENT-VOICE §10): "Follow" / "Following" are plain; no hype, no narrated feelings.
export function FollowSpaceButton({ spaceId, spaceName }: { spaceId: string; spaceName: string }) {
  void spaceId
  const [following, setFollowing] = useState(false)
  return (
    <button
      type="button"
      onClick={() => setFollowing((v) => !v)}
      aria-pressed={following}
      aria-label={following ? `Following ${spaceName}` : `Follow ${spaceName}`}
      className={buttonClasses('secondary', 'md')}
    >
      {following ? (
        <>
          <Check className="h-3.5 w-3.5" aria-hidden />
          Following
        </>
      ) : (
        <>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Follow
        </>
      )}
    </button>
  )
}
