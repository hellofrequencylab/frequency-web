'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Play, Loader2 } from 'lucide-react'
import { startQuest } from './actions'
import { isError } from '@/lib/action-result'

/** Join a seasonal Journey — free for every member (ADR-150). */
export function StartQuestButton({ chainId }: { chainId: string }) {
  const [pending, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const router = useRouter()

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setErr(null)
            const res = await startQuest(chainId)
            if (isError(res)) setErr(res.error)
            else router.refresh()
          })
        }
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        Start journey
      </button>
      {err && <p className="mt-1 text-xs text-danger">{err}</p>}
    </div>
  )
}
