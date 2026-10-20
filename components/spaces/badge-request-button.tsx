'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { isError } from '@/lib/action-result'
import { requestBadge } from '@/lib/devices/badge-actions'

/** The "Get a scannable badge" button (LIVE-1180): files the member's request, then the line re-renders. */
export function BadgeRequestButton({ spaceId }: { spaceId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [problem, setProblem] = useState<string | null>(null)
  return (
    <>
      <button
        type="button"
        className="btn sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setProblem(null)
            const out = await requestBadge(spaceId)
            if (isError(out)) setProblem(out.error)
            else router.refresh()
          })
        }
      >
        {pending ? 'Sending...' : 'Get a scannable badge'}
      </button>
      {problem && (
        <span role="alert" className="w-full text-meta text-danger">
          {problem}
        </span>
      )}
    </>
  )
}
