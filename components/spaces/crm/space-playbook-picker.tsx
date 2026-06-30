'use client'

import { useState, useTransition } from 'react'
import { Check, Loader2, Pencil, Sparkles, X } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { runSpacePlaybookAction, dismissSpacePlaybook } from '@/app/(main)/spaces/[slug]/crm/playbook-actions'

// THE NEXT-BEST-ACTION PLAYBOOK PICKER on the Space contact detail (Resonance Engine · ADR-382 ·
// docs/NEXT-GEN-CRM.md Altitude 3 "Action: next-best-action playbook picker"). The one-tap move for
// THIS person, resolved server-side from their scores (the same registry the worklist + Today use), so
// the owner acts from the person detail without leaving for the platform Today. Mirrors the Today card
// idiom (Do it / Tweak / Not now) but gated to the Space owner.
//
//   Do it   -> runs the playbook's primary governed action (runSpacePlaybookAction -> the confirm-then-
//              execute path). For the outbound leg the operator can Tweak the draft first; nothing
//              sends on its own (suggest-by-default).
//   Tweak   -> opens the draft inline (subject + body), passed to Do it.
//   Not now -> dismisses + records the training signal.
//
// The EFFECTIVE autonomy tier (after the per-Space slider) is computed server-side and passed in, so
// the badge reads the same as Today + the worklist. Semantic tokens only; copy in voice (no dashes).

export interface SpacePlaybookCard {
  /** The registry playbook id this card runs. */
  playbookId: string
  /** The playbook's operator-facing name. */
  playbookName: string
  /** One plain line: what this play is for + why now (the registry rationale). */
  rationale: string
  /** The EFFECTIVE autonomy tier after the per-Space slider (auto -> suggest when suggest_only). */
  autonomyTier: 'auto' | 'suggest' | 'never_auto'
  /** True when the primary action is outbound (the operator may Tweak the draft, and it never sends). */
  isOutbound: boolean
}

const TIER_BADGE: Record<SpacePlaybookCard['autonomyTier'], { label: string; cls: string }> = {
  auto: { label: 'In-product, reversible', cls: 'bg-success/10 text-success' },
  suggest: { label: 'You approve before it sends', cls: 'bg-primary/10 text-primary-strong' },
  never_auto: { label: 'Needs an explicit confirm', cls: 'bg-warning/10 text-warning' },
}

export function SpacePlaybookPicker({
  slug,
  contactId,
  card,
}: {
  slug: string
  contactId: string
  card: SpacePlaybookCard
}) {
  const [pending, start] = useTransition()
  const [tweaking, setTweaking] = useState(false)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<'ran' | 'dismissed' | null>(null)

  const badge = TIER_BADGE[card.autonomyTier]

  const doIt = () =>
    start(async () => {
      setError(null)
      const res = await runSpacePlaybookAction({
        slug,
        playbookId: card.playbookId,
        contactId,
        tweak: card.isOutbound ? { subject, body } : undefined,
      })
      if (isError(res)) setError(res.error)
      else setDone('ran')
    })

  const notNow = () =>
    start(async () => {
      setError(null)
      const res = await dismissSpacePlaybook({ slug, playbookId: card.playbookId, contactId })
      if (isError(res)) setError(res.error)
      else setDone('dismissed')
    })

  if (done) {
    return (
      <section>
        <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted shadow-sm">
          {done === 'ran' ? 'Done. The move is on their timeline above.' : 'Set aside for now. Vera will learn from that.'}
        </div>
      </section>
    )
  }

  return (
    <section>
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-subtle">
            <Sparkles className="h-3.5 w-3.5" aria-hidden /> Next best move
          </p>
          <span className={`ml-auto rounded-full px-2 py-0.5 text-2xs font-medium ${badge.cls}`}>{badge.label}</span>
        </div>

        <p className="mt-2 text-sm font-medium text-text">{card.playbookName}</p>
        <p className="mt-0.5 text-sm text-muted">{card.rationale}</p>

        {tweaking && card.isOutbound && (
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
          {card.isOutbound && (
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
      </div>
    </section>
  )
}
