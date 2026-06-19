'use client'

import { useTransition } from 'react'
import { dropPracticeAction } from '@/app/(main)/practices/actions'

// The quiet "Adopted · Remove" affordance on a "Your practices" row. A practice only
// appears there because it's already yours, so there's no big "Adopted" toggle to show —
// just a muted label and a small text button that un-adopts it. Reuses the existing
// dropPracticeAction (same drop path AdoptPracticeButton uses); no new server write.
export function RemovePracticeButton({ practiceId, title }: { practiceId: string; title: string }) {
  const [pending, start] = useTransition()
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-subtle">
      <span className="font-medium">Adopted</span>
      <span aria-hidden>·</span>
      <button
        type="button"
        disabled={pending}
        aria-label={`Remove ${title} from your practices`}
        onClick={() => start(async () => void (await dropPracticeAction(practiceId)))}
        className="font-medium text-muted underline-offset-2 hover:text-text hover:underline disabled:opacity-60"
      >
        {pending ? 'Removing…' : 'Remove'}
      </button>
    </span>
  )
}
