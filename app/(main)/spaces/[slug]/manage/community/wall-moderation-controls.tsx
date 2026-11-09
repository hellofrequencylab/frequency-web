'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { moderateWallPost, type WallModeration } from './actions'

// One wall post's moderation controls: pin or unpin, hide or bring back.
export function WallModerationRow({
  slug,
  postId,
  pinned,
  hidden,
}: {
  slug: string
  postId: string
  pinned: boolean
  hidden: boolean
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function run(action: WallModeration) {
    setError(null)
    start(async () => {
      const res = await moderateWallPost({ slug, postId, action })
      if ('error' in res) setError(res.error)
    })
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-nowrap">
      <Button size="sm" variant="secondary" disabled={pending || hidden} onClick={() => run(pinned ? 'unpin' : 'pin')}>
        {pinned ? 'Unpin' : 'Pin'}
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(hidden ? 'restore' : 'hide')}>
        {hidden ? 'Bring back' : 'Hide'}
      </Button>
      {error ? (
        <p role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}
