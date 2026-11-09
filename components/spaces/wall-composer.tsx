'use client'

import { Composer } from '@/components/feed/composer'
import { createWallPost } from '@/app/(main)/spaces/[slug]/(profile)/community/actions'

// The Community wall's composer: the same box the Circle feed uses, posting through the wall's own
// action so the database decides who may write (ADR-1938). A client wrapper only because the
// composer's write override is a function and cannot cross the server boundary on its own.

export function WallComposer({
  spaceId,
  slug,
  spaceName,
}: {
  spaceId: string
  slug: string
  spaceName: string
}) {
  return (
    <Composer
      scopeId={spaceId}
      visibility="cluster"
      placeholder={`Share something with ${spaceName}…`}
      onSubmit={async ({ body, imageUrl }) => {
        const res = await createWallPost({ spaceId, slug, body, imageUrl })
        if ('error' in res) return { error: res.error }
      }}
    />
  )
}
