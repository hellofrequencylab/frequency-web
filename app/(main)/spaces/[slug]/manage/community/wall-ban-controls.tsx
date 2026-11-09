'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/avatar'
import { isError, type ActionResult } from '@/lib/action-result'
import { banWallMember, liftWallBanAction, reviewWallReport, type WallReportDecision } from './actions'

// LIVE-2095: the moderation rung's controls on the Community wall console.
//  - BanButton: put one post's author out of the wall (sits next to Pin / Hide on a post row).
//  - BannedRow: one person on the "Banned from the wall" list, with the lift.
//  - ReportRow: one open report on a post of this wall, with "Hide and close" and "Dismiss".
// Every write re-checks the caller's standing on the server; these only ask and show the answer.

function useAction() {
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  function run(task: () => Promise<ActionResult>) {
    setError(null)
    start(async () => {
      const res = await task()
      if (isError(res)) setError(res.error)
    })
  }
  return { error, pending, run }
}

export function BanButton({ slug, profileId, name }: { slug: string; profileId: string; name: string }) {
  const { error, pending, run } = useAction()
  const [confirming, setConfirming] = useState(false)
  if (!confirming) {
    return (
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(true)}>
        Ban {name}
      </Button>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-meta text-muted">Ban {name} from this wall?</span>
      <Button size="sm" variant="danger" disabled={pending} onClick={() => run(() => banWallMember({ slug, profileId }))}>
        {pending ? 'Banning…' : 'Yes, ban'}
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
        Keep
      </Button>
      {error ? (
        <p role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function BannedRow({
  slug,
  profileId,
  name,
  handle,
  avatarUrl,
  since,
}: {
  slug: string
  profileId: string
  name: string
  handle: string | null
  avatarUrl: string | null
  since: string
}) {
  const { error, pending, run } = useAction()
  return (
    <li className="flex items-center justify-between gap-3 p-4">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar src={avatarUrl} name={name} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-body-sm font-semibold text-text">{name}</p>
          <p className="truncate text-meta text-muted">
            {handle ? `@${handle} · ` : ''}banned {since}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => liftWallBanAction({ slug, profileId }))}>
          {pending ? 'Lifting…' : 'Lift ban'}
        </Button>
        {error ? (
          <p role="alert" className="text-body-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </li>
  )
}

export function ReportRow({
  slug,
  reportId,
  reason,
  details,
  excerpt,
  authorName,
  when,
}: {
  slug: string
  reportId: string
  reason: string
  details: string | null
  excerpt: string
  authorName: string
  when: string
}) {
  const { error, pending, run } = useAction()
  const decide = (decision: WallReportDecision) => run(() => reviewWallReport({ slug, reportId, decision }))
  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="text-body-sm font-semibold text-text">
          Reported for {reason}
          <span className="ml-2 font-normal text-muted">{when}</span>
        </p>
        {details ? <p className="text-body-sm text-muted">“{details}”</p> : null}
        <p className="mt-1 line-clamp-2 text-body-sm text-text">
          <span className="font-semibold">{authorName}:</span> {excerpt}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-nowrap">
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => decide('hide')}>
          Hide and close
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => decide('dismiss')}>
          Dismiss
        </Button>
        {error ? (
          <p role="alert" className="text-body-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </li>
  )
}
