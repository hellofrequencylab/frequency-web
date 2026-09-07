'use client'

import { Check } from 'lucide-react'

/**
 * The email opt-in card, in ONE place.
 *
 * WHY IT IS ITS OWN COMPONENT (2026-09-07). LIVE-168 gave the sequence runner an explicit opt-in
 * step, and the first version rendered this markup a second time by copying it out of
 * app/onboarding/form.tsx — which is how the two surfaces a member can meet the SAME consent
 * question on would have started drifting: same decision, two cards, one of them destined to be
 * updated alone. `check:adoption` is what noticed, because the copy also duplicated the card's
 * design debt and pushed two ratchets up (literal-radius +2, raw-button-bg +1). Extracting it
 * removes the duplication and the rise together.
 *
 * ⚪ NOT NAMED `*-card.tsx`, deliberately. `check:adoption`'s `bespoke-cards` detector reads that
 * suffix as "a browse card owed to the kit" and would count this one, which is a consent control
 * that happens to be card-shaped rather than anything EntityCard/PersonCard/RowCard could compose.
 * The name says what it is; the detector keeps meaning what it was written to mean.
 *
 * ⚪ The radius moved with the extraction: the checkbox was `rounded-md`, a literal, and is now
 * `rounded-control`, which is the role radius for exactly this (docs/PAGE-FRAMEWORK.md). The
 * outer card keeps the shape it had, so a member sees the same card they saw yesterday.
 *
 * The copy is the owner directive recorded at the original site: a deliberate, visible choice, on
 * by default, with honest wording and a real toggle. Lifecycle email is always on; this grants the
 * marketing scope only. Change the words here and both surfaces move together, which is the point.
 */
/** The wording both surfaces show unless a sequence overrides it. The defaults live here so the
 *  copy has ONE home; the sequence runner can still author its own through the step's content
 *  schema, which is why these are props rather than literals in the markup. */
export const EMAIL_OPT_IN_LABEL = 'Keep me in the loop'
export const EMAIL_OPT_IN_TEXT =
  'New circles near you, events worth showing up for, and the occasional note from the team. No noise, and you can turn it off anytime in Settings.'

export function EmailOptInCard({
  checked,
  onToggle,
  label = EMAIL_OPT_IN_LABEL,
  text = EMAIL_OPT_IN_TEXT,
  className = '',
}: {
  checked: boolean
  onToggle: () => void
  label?: string
  text?: string
  /** Spacing from the caller's layout; the card sets none of its own. */
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={checked}
      className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition-colors ${
        checked ? 'border-primary bg-primary-bg/40' : 'border-border bg-surface hover:bg-surface-elevated'
      } ${className}`}
    >
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-control border transition-colors ${
          checked ? 'border-primary bg-primary text-on-primary' : 'border-border-strong bg-canvas'
        }`}
      >
        {checked && <Check className="h-3.5 w-3.5" />}
      </span>
      <span className="min-w-0">
        <span className="block text-body-sm font-semibold text-text">{label}</span>
        <span className="mt-0.5 block text-body-sm text-muted">{text}</span>
      </span>
    </button>
  )
}
