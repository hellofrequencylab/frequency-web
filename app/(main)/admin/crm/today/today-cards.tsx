'use client'

import { useState, useTransition } from 'react'
import { Check, Loader2, Pencil, X } from 'lucide-react'
import type { TodayCard } from '@/lib/ai/vera/today'
import { runPlaybookAction, dismissPlaybookCard } from './actions'

// The Today cards (Resonance Engine Phase 1 - ADR-382). One card per person, each one tap:
//   Do it   -> runs the governed playbook action (lib/ai/vera/execute.ts via the action).
//   Tweak   -> opens the draft inline (subject + body for an outbound playbook), captured
//              and passed to Do it. Suggest-by-default: a member-facing send is always a
//              draft a human approves, never an auto-send.
//   Not now -> dismisses + records the training signal.
// Semantic tokens only (no hardcoded hex); copy in voice (no em or en dashes).

// The autonomy badge: a quiet label so the operator knows what a Do-it will do. `auto` is
// in-product + reversible; `suggest` drafts an outbound message they approve.
const TIER_BADGE: Record<TodayCard['autonomyTier'], { label: string; cls: string }> = {
  auto: { label: 'In-product, reversible', cls: 'bg-success/10 text-success' },
  suggest: { label: 'You approve before it sends', cls: 'bg-primary/10 text-primary-strong' },
  never_auto: { label: 'Needs an explicit confirm', cls: 'bg-warning/10 text-warning' },
}

function CardRow({ card, onDone }: { card: TodayCard; onDone: (contactId: string) => void }) {
  const [pending, start] = useTransition()
  const [tweaking, setTweaking] = useState(false)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)

  const isOutbound = card.autonomyTier === 'suggest'
  const badge = TIER_BADGE[card.autonomyTier]

  const doIt = () =>
    start(async () => {
      setError(null)
      const res = await runPlaybookAction({
        playbookId: card.playbookId,
        contactId: card.contactId,
        subjectProfileId: card.subjectProfileId,
        tweak: isOutbound ? { subject, body } : undefined,
      })
      if (res.ok) onDone(card.contactId)
      else setError(res.error ?? 'That did not go through.')
    })

  const notNow = () =>
    start(async () => {
      setError(null)
      const res = await dismissPlaybookCard({ playbookId: card.playbookId, contactId: card.contactId })
      if (res.ok) onDone(card.contactId)
      else setError(res.error ?? 'That did not go through.')
    })

  return (
    <li className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-sm font-bold text-text">{card.name}</span>
        <span className="text-xs text-subtle">{card.context}</span>
        <span className={`ml-auto rounded-full px-2 py-0.5 text-2xs font-medium ${badge.cls}`}>{badge.label}</span>
      </div>

      <p className="mt-2 text-sm text-muted">{card.whyNow}</p>
      <p className="mt-1 text-sm font-medium text-text">{card.actionDraft}</p>

      {tweaking && isOutbound && (
        <div className="mt-3 space-y-2">
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="w-full rounded-xl border border-border bg-canvas px-3 py-2 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write the note in your own words. You approve before it sends."
            rows={4}
            className="w-full rounded-xl border border-border bg-canvas px-3 py-2 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          />
        </div>
      )}

      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={doIt}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-on-primary transition-colors hover:bg-primary-strong disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Do it
        </button>
        {isOutbound && (
          <button
            type="button"
            disabled={pending}
            onClick={() => setTweaking((t) => !t)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm font-medium text-text transition-colors hover:bg-surface-elevated disabled:opacity-50"
          >
            <Pencil className="h-4 w-4" />
            Tweak
          </button>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={notNow}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-elevated disabled:opacity-50"
        >
          <X className="h-4 w-4" />
          Not now
        </button>
      </div>
    </li>
  )
}

export function TodayCards({ cards }: { cards: TodayCard[] }) {
  // Optimistically remove a cleared card so the queue visibly drains toward zero. A
  // revalidate from the server action re-syncs the real set on the next paint.
  const [cleared, setCleared] = useState<Set<string>>(new Set())
  const visible = cards.filter((c) => !cleared.has(c.contactId))

  if (visible.length === 0) {
    return <p className="text-sm text-muted">Cleared for now. Vera will line up the next moves overnight.</p>
  }

  return (
    <ul className="space-y-3">
      {visible.map((card) => (
        <CardRow
          key={card.contactId}
          card={card}
          onDone={(id) => setCleared((prev) => new Set(prev).add(id))}
        />
      ))}
    </ul>
  )
}
