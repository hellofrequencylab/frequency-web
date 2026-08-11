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
// ─────────────────────────────────────────────────────────────────────────────

import type { ElementType, ReactNode } from 'react'
import Link from 'next/link'
import { PenLine, Sparkles } from 'lucide-react'

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
  'flex w-full items-start gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-primary/50 hover:bg-surface-elevated disabled:opacity-60'

function DoorCard({ door, disabled }: { door: SparkDoor; disabled?: boolean }) {
  const body = (
    <>
      <door.Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary-strong" aria-hidden />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-text">{door.label}</span>
        <span className="block text-xs leading-snug text-muted">{door.hint}</span>
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

/**
 * The first screen: the two standard doors, any entity-specific extras, and the shared drop zone
 * (passed as `children`, so it sits under BOTH doors rather than belonging to either one).
 */
export function SparkDoors({
  entityLabel,
  onVera,
  onManual,
  veraLabel,
  veraHint,
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
   * Per-entity door copy. The STRUCTURE is fixed (two doors, equal weight, Vera first) because
   * that is the standard; the WORDS can be true to the entity, because "answer a few questions"
   * is wrong for a research pipeline and "research it" is wrong for a Practice. Structure locked,
   * copy adjustable, which is the same split the manifests use.
   */
  veraLabel?: string
  veraHint?: string
  manualLabel?: string
  manualHint?: string
  /** Entity-specific doors (templates, blueprints), rendered after the two standard ones. */
  extraDoors?: SparkDoor[]
  disabled?: boolean
  /** The drop zone. Serves both doors: an upload is source material either way. */
  children?: ReactNode
}) {
  const doors: SparkDoor[] = [
    {
      key: 'vera',
      label: veraLabel ?? 'Have Vera build it',
      hint: veraHint ?? `Answer a few questions and Vera drafts your ${entityLabel.toLowerCase()} for you to edit.`,
      Icon: Sparkles,
      onSelect: onVera,
    },
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
      <ul className="space-y-2.5">
        {doors.map((door) => (
          <li key={door.key}>
            <DoorCard door={door} disabled={disabled} />
          </li>
        ))}
      </ul>
      {children && <div className="mt-4">{children}</div>}
    </div>
  )
}
