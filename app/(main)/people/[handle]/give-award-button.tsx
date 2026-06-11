'use client'

// The quiet "give" affordance for Witnessed awards — a small menu, never a
// prompt. Only rendered when the viewer has something left to give (the page
// checks giveableAwards() server-side).

import { useState, useTransition } from 'react'
import { Award } from 'lucide-react'
import { giveWitnessedAward } from './award-actions'
import { isError } from '@/lib/action-result'
import type { WitnessedSlug } from '@/lib/awards/witnessed'

const LABELS: Record<WitnessedSlug, string> = {
  strong_signal: 'Strong Signal',
  carried_the_room: 'Carried the Room',
}

export function GiveAwardButton({ recipientId, giveable }: {
  recipientId: string
  giveable: WitnessedSlug[]
}) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  if (giveable.length === 0 && !note) return null

  const give = (slug: WitnessedSlug) => {
    setOpen(false)
    startTransition(async () => {
      const result = await giveWitnessedAward(recipientId, slug)
      setNote(isError(result) ? result.error : `${LABELS[slug]} given.`)
    })
  }

  return (
    <div className="relative">
      {note ? (
        <span className="text-xs text-subtle">{note}</span>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-elevated"
        >
          <Award className="h-3.5 w-3.5" />
          Give
        </button>
      )}
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-44 rounded-xl border border-border bg-surface-elevated p-1 shadow-md">
          {giveable.map((slug) => (
            <button
              key={slug}
              type="button"
              onClick={() => give(slug)}
              className="block w-full rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-text hover:bg-surface"
            >
              {LABELS[slug]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
