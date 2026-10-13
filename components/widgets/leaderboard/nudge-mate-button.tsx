'use client'

// The one-tap streak nudge (Resonance Engine Phase 5 · ADR-386). One button per at-risk
// Circle mate in the Consistency module's "mates at risk" row. Pressing it calls
// `nudgeStreakMate`, which re-resolves the nudger from the session and refuses unless the
// two share an active Circle — this leaf is UX only, never authority. The smallest possible
// client island, like StreakHero beside it: the row itself stays a Server Component.
//
// One tap means ONE tap: a sent nudge collapses the button into a "Nudged" mark, so the
// same mate cannot be poked twice from one render (the no-spam rule the selector's cap
// serves). A refusal from the action is surfaced verbatim, in place.

import { useState, useTransition } from 'react'
import { Check, Loader2, Zap } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { Button } from '@/components/ui/button'
import { nudgeStreakMate } from '@/app/(main)/crew/leaderboard/streak-actions'

export function NudgeMateButton({ mateProfileId, mateName }: { mateProfileId: string; mateName: string }) {
  const [pending, start] = useTransition()
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function onNudge() {
    if (pending || sent) return
    start(async () => {
      setError(null)
      const res = await nudgeStreakMate(mateProfileId)
      if (isError(res)) setError(res.error)
      else setSent(true)
    })
  }

  if (sent) {
    return (
      <span className="inline-flex items-center gap-1 text-meta font-semibold text-success">
        <Check className="h-3.5 w-3.5" aria-hidden /> Nudged
      </span>
    )
  }

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <Button type="button" size="sm" onClick={onNudge} disabled={pending} aria-label={`Nudge ${mateName}`}>
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Zap className="h-3.5 w-3.5" aria-hidden />}
        {pending ? 'Nudging' : 'Nudge'}
      </Button>
      {error && <span className="text-meta text-danger">{error}</span>}
    </span>
  )
}
