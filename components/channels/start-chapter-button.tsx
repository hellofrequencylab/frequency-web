'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Sparkles } from 'lucide-react'
import { startChapterAction } from '@/app/(main)/channels/actions'

// The "Start a Chapter" CTA on a program Channel. A Chapter is a local Circle
// running the channel's model; starting one is the Remix flow (blueprint →
// private draft you own), so this mirrors RemixButton / StarterClaim: client
// component, useTransition pending state, inline error, then route into the
// draft builder. The action enforces the real-member gate server-side.
export function StartChapterButton({
  channelId,
  label = 'Start a Chapter',
}: {
  channelId: string
  label?: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const startAChapter = () => {
    setError(null)
    start(async () => {
      try {
        const res = await startChapterAction(channelId)
        router.push(`/circles/${res.slug}/edit`)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not start your Chapter. Try again.')
      }
    })
  }

  return (
    <div>
      <button
        type="button"
        onClick={startAChapter}
        disabled={pending}
        title="You get a private draft to shape before anyone sees it."
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60 whitespace-nowrap"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
        {pending ? 'Starting…' : label}
      </button>
      {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
    </div>
  )
}
