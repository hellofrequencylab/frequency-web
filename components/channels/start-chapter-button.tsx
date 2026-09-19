'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Sparkles } from 'lucide-react'
import { startChapterAction } from '@/app/(main)/channels/actions'

// The "Start a Chapter" CTA on a program Channel. A Chapter is a local Circle
// running the channel's model; starting one is the Remix flow (blueprint →
// private draft you own), so this mirrors RemixButton / StarterClaim: client
// component, useTransition pending state, inline error, then route into the
// draft builder. The action enforces the real-member + circle.create gates
// server-side (ADR-891). circle.create is open to any signed-in member
// (FIRST ONE FREE, ADR-908); LIVE-409 dropped the CrewGate wrapper that
// would have shown an upgrade popup if that capability were ever false.
export function StartChapterButton({
  channelId,
  label = 'Start a Chapter',
  className,
}: {
  channelId: string
  label?: string
  /** Overrides the default filled-primary style — the channel header's hero actions pass
   *  the glassy on-ink HERO_ACTION_CLASS so Tune in stays the one filled CTA. */
  className?: string
  /** @deprecated Starting a Chapter is a Circle compose act (LIVE-409). Sign-in is
   *  still required at the action. Drop this at the call sites. */
  canCreate?: boolean
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
        className={`${className ?? 'inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-body-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover whitespace-nowrap'} disabled:opacity-60`}
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
        {pending ? 'Starting…' : label}
      </button>
      {error && <p className="mt-1.5 text-meta text-danger">{error}</p>}
    </div>
  )
}
