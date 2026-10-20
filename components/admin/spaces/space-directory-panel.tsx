'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isError } from '@/lib/action-result'
import { setSpaceDirectoryFeaturedAction } from '@/app/(main)/admin/spaces/[id]/featured-actions'

// The DIRECTORY panel on /admin/spaces/[id] (LIVE-1018): one switch that puts this Space in the Featured
// row at the top of the Business Spaces directory. The server action is janitor-gated and audited; this
// component only collects intent and shows the result. Token-only styling; no em dashes (CONTENT-VOICE).

export function SpaceDirectoryPanel({ spaceId, featured }: { spaceId: string; featured: boolean }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  return (
    <div className="space-y-4">
      <p className="text-body-sm text-muted">
        {featured
          ? 'This space is in the Featured row at the top of the Business Spaces directory.'
          : 'This space is not featured. When no space is featured, the directory shows the most active ones instead.'}
      </p>
      <Button
        type="button"
        variant={featured ? 'secondary' : 'primary'}
        disabled={pending}
        onClick={() => {
          setError(null)
          start(async () => {
            const result = await setSpaceDirectoryFeaturedAction(spaceId, !featured)
            if (isError(result)) setError(result.error)
            else router.refresh()
          })
        }}
      >
        {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
        {featured ? 'Remove from Featured' : 'Feature in the directory'}
      </Button>
      {error && <p className="text-body-sm text-danger">{error}</p>}
    </div>
  )
}
