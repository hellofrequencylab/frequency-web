'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X, Loader2 } from 'lucide-react'
import { reviewContent } from '../actions'
import { isError } from '@/lib/action-result'
import type { ContentType } from '@/lib/library'

export function ReviewActions({ type, id }: { type: ContentType; id: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  const act = (decision: 'approve' | 'reject') =>
    start(async () => {
      const res = await reviewContent(type, id, decision)
      if (!isError(res)) router.refresh()
    })

  return (
    <div className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => act('approve')}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Approve
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => act('reject')}
        className="inline-flex items-center gap-1.5 rounded-lg border border-danger px-3 py-1.5 text-sm font-semibold text-danger transition-colors hover:bg-danger-bg/30 disabled:opacity-50"
      >
        <X className="h-4 w-4" /> Reject
      </button>
    </div>
  )
}
