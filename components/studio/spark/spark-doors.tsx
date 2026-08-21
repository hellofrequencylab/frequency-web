'use client'

// ─────────────────────────────────────────────────────────────────────────────
// THE TWO DOORS (docs/STUDIO.md, ADR-597).
//
// The first screen of every Spark, for every entity. Two choices of EQUAL weight: let Vera draft
// it, or fill it in yourself.
//
// This exists because the survey found the manual door was not really a door. In the Journey,
// Practice, and Event wizards it was an 11px grey text link buried under the card ("Skip, I'll
// build it myself"), while Vera's path got the whole screen. Only the Circle wizard offered a real
// choice. Research on AI creation flows is consistent that users pick the guided path when it is
// offered honestly, and resent it when it is the only path presented: the manual door being
// first-class is what makes the guided one feel like a gift rather than a toll.
//
// Optional extra doors (start from a template, remix a Starter Circle) are DECLARED by the caller
// rather than special-cased here, so one entity having templates never bends the component.
//
// ── THE PROMPT VARIANT (`veraPrompt`) ───────────────────────────────────────────────────────────
// Vera's door can render as a FIELD rather than a button. It is the same door in the same first
// position doing the same job; only the affordance changes, because for some entities the fastest
// possible input IS the description, and asking someone to click a card to reach a text box is a
// step that buys nothing. An entity that does not pass `veraPrompt` is untouched.
//
// When the prompt is on, `children` (the drop zone) moves UP, directly beneath the field. That is
// not cosmetic: in the button layout the zone serves both doors equally and belongs under both, but
// a prompt field and an upload are two ways of saying the same thing — here is my material — so the
// upload belongs with the field it substitutes for, above the doors that ignore it.
// ─────────────────────────────────────────────────────────────────────────────

import type { ElementType, ReactNode } from 'react'
import Link from 'next/link'
import { PenLine, Sparkles } from 'lucide-react'
import { buttonClasses } from '@/components/ui/button'
import { Textarea } from '@/components/ui/field'

export interface SparkDoor {
  key: string
  label: string
  hint: string
  Icon: ElementType
  /** A door either runs something in place or navigates. Exactly one of these. */
  onSelect?: () => void
  href?: string
}

const CARD =
  'flex w-full items-start gap-3 rounded-card border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-primary/50 hover:bg-surface-elevated disabled:opacity-60'

function DoorCard({ door, disabled }: { door: SparkDoor; disabled?: boolean }) {
  const body = (
    <>
      <door.Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary-strong" aria-hidden />
      <span className="min-w-0">
        <span className="block text-body-sm font-semibold text-text">{door.label}</span>
        <span className="block text-meta leading-snug text-muted">{door.hint}</span>
      </span>
    </>
  )

  if (door.href) {
    return (
      <Link href={door.href} className={CARD}>
        {body}
      </Link>
    )
  }
  return (
    <button type="button" onClick={door.onSelect} disabled={disabled} className={CARD}>
      {body}
    </button>
  )
}

/** Vera's door, rendered as a field instead of a button. See the header. */
export interface SparkVeraPrompt {
  /** The ask, in the entity's own words: "Tell me about your Journey". */
  label: string
  placeholder?: string
  value: string
  onChange: (next: string) => void
  /** The button under the field. Defaults to "Draft it with Vera". */
  submitLabel?: string
  /** Extra guidance under the label. Optional; most entities need none. */
  hint?: string
}

function VeraPrompt({
  prompt,
  onVera,
  disabled,
}: {
  prompt: SparkVeraPrompt
  onVera: () => void
  disabled?: boolean
}) {
  const id = `spark-vera-prompt-${prompt.label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`
  const ready = prompt.value.trim().length > 0
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <label htmlFor={id} className="flex items-center gap-2 text-body-sm font-semibold text-text">
        <Sparkles className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
        {prompt.label}
      </label>
      {prompt.hint && <p className="mt-1 text-meta leading-snug text-muted">{prompt.hint}</p>}
      {/* The field PRIMITIVE, not a raw textarea. The adoption ratchet caught the first version of
          this component hand-rolling one, which is the exact debt class the kit exists to retire. */}
      <Textarea
        id={id}
        value={prompt.value}
        onChange={(e) => prompt.onChange(e.target.value)}
        disabled={disabled}
        rows={4}
        placeholder={prompt.placeholder}
        className="mt-2 resize-y"
      />
      {/* Disabled until there is something to read, because "Draft it with Vera" on an empty field
          is a button that can only fail. The drop zone below is the other way to satisfy it. */}
      <button
        type="button"
        onClick={onVera}
        disabled={disabled || !ready}
        className={`${buttonClasses('primary')} mt-2 w-full`}
      >
        {prompt.submitLabel ?? 'Draft it with Vera'}
      </button>
    </div>
  )
}

/**
 * The first screen: the two standard doors, any entity-specific extras, and the shared drop zone
 * (passed as `children`, so it sits under BOTH doors rather than belonging to either one — unless
 * `veraPrompt` is on, in which case it rides with the field; see the header).
 */
export function SparkDoors({
  entityLabel,
  onVera,
  onManual,
  veraLabel,
  veraHint,
  veraPrompt,
  manualLabel,
  manualHint,
  extraDoors = [],
  disabled,
  children,
}: {
  /** The thing being made, for the default door copy. */
  entityLabel: string
  onVera: () => void
  onManual: () => void
  /**
   * Per-entity door copy. The STRUCTURE is fixed — Vera first, build-it-yourself second, extras
   * after, every one at equal weight — because that is the standard; the WORDS can be true to the
   * entity, because "answer a few questions" is wrong for a research pipeline and "research it" is
   * wrong for a Practice. Structure locked, copy adjustable, which is the same split the manifests
   * use.
   *
   * `veraPrompt` changes the AFFORDANCE of the first door, never its position or its weight, so
   * the lock still holds: Vera is still first and the manual door is still its equal.
   */
  veraLabel?: string
  veraHint?: string
  /** Render Vera's door as a field rather than a button. Omit for the standard two-button screen. */
  veraPrompt?: SparkVeraPrompt
  manualLabel?: string
  manualHint?: string
  /** Entity-specific doors (templates, blueprints), rendered after the two standard ones. */
  extraDoors?: SparkDoor[]
  disabled?: boolean
  /** The drop zone. Serves both doors: an upload is source material either way. */
  children?: ReactNode
}) {
  // The prompt IS the Vera door, so it is not also listed as one. Everything else keeps its order.
  const doors: SparkDoor[] = [
    ...(veraPrompt
      ? []
      : [
          {
            key: 'vera',
            label: veraLabel ?? 'Have Vera build it',
            hint: veraHint ?? `Answer a few questions and Vera drafts your ${entityLabel.toLowerCase()} for you to edit.`,
            Icon: Sparkles,
            onSelect: onVera,
          },
        ]),
    {
      key: 'manual',
      label: manualLabel ?? 'Build it yourself',
      hint: manualHint ?? 'Go straight to the full form and fill it in your own way.',
      Icon: PenLine,
      onSelect: onManual,
    },
    ...extraDoors,
  ]

  return (
    <div>
      {veraPrompt && (
        <div className="mb-2.5 space-y-2.5">
          <VeraPrompt prompt={veraPrompt} onVera={onVera} disabled={disabled} />
          {children}
        </div>
      )}
      <ul className="space-y-2.5">
        {doors.map((door) => (
          <li key={door.key}>
            <DoorCard door={door} disabled={disabled} />
          </li>
        ))}
      </ul>
      {/* Only when the prompt is off — otherwise the zone has already been rendered with the field. */}
      {!veraPrompt && children && <div className="mt-4">{children}</div>}
    </div>
  )
}
