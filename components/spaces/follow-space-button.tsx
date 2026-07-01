'use client'

import { useState, useTransition } from 'react'
import { Check, Plus } from 'lucide-react'
import { buttonClasses } from '@/components/ui/button'
import { followSpace, unfollowSpace } from '@/lib/spaces/follows-actions'
import { isError } from '@/lib/action-result'

// The FOLLOW affordance in the entity-profile context band (ENTITY-SPACES-BUILD §A.4). A secondary
// action a signed-in viewer taps to follow a Space. It now PERSISTS: the `space_follows` ledger
// (lib/spaces/follows.ts) backs the toggle via the followSpace / unfollowSpace server actions, so
// the relationship survives a reload and feeds the "Following" filter on the /spaces directory.
//
// The caller (the Space profile layout) resolves `initialFollowing` server-side and passes it in, so
// the button paints in the right state with no mount flicker. The click is OPTIMISTIC: the label
// flips immediately inside a useTransition, then the server action confirms. FAIL-SAFE: if the action
// errors (or returns one), the optimistic flip is rolled back so the UI never lies about the state.
//
// COPY (CONTENT-VOICE §10): "Follow" / "Following" are plain; no hype, no narrated feelings.
export function FollowSpaceButton({
  spaceId,
  spaceName,
  initialFollowing = false,
  className,
}: {
  spaceId: string
  spaceName: string
  initialFollowing?: boolean
  /** Override the default `secondary md` button tokens — e.g. the on-cover styling the Hero overlay
   *  passes so Follow stays legible on a photo. Falls back to the standard secondary token string. */
  className?: string
}) {
  const [following, setFollowing] = useState(initialFollowing)
  const [isPending, startTransition] = useTransition()

  function toggle() {
    const next = !following
    // Optimistic: flip the label now; roll back if the server action reports a failure.
    setFollowing(next)
    startTransition(async () => {
      const result = next ? await followSpace(spaceId) : await unfollowSpace(spaceId)
      if (isError(result)) setFollowing(!next)
    })
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={isPending}
      aria-pressed={following}
      aria-label={following ? `Following ${spaceName}` : `Follow ${spaceName}`}
      className={className ?? buttonClasses('secondary', 'md')}
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
