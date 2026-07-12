// Pure scheduling helpers + shared types for per-persona nurture (ADR-131). No DB
// here — the store/runner/actions do I/O; this is the testable logic for "which step
// runs next and when". Keeping it pure means the cron's progression is unit-tested.

export interface NurtureSequence {
  id: string
  persona: string
  name: string
  enabled: boolean
  createdAt: string | null
}

export interface NurtureStep {
  id: string
  sequenceId: string
  order: number
  delayHours: number
  subject: string
  body: string
  enabled: boolean
  /** The block-editor body (an entity-blocks EntityLayout, kind 'email') when the step has been designed in
   *  the arranger; null / undefined means the legacy plain `body` drives the send. Read-only carrier for the
   *  admin UI; the pure scheduling helpers below never read it. */
  blockJson?: import('@/lib/entity-blocks/layout').EntityLayout | null
}

/** Enabled steps, ascending by order — the canonical send order. */
export function orderedSteps(steps: NurtureStep[]): NurtureStep[] {
  return steps.filter((s) => s.enabled).sort((a, b) => a.order - b.order)
}

/** The first enabled step of a sequence (what enrollment starts on), or null. */
export function firstStep(steps: NurtureStep[]): NurtureStep | null {
  return orderedSteps(steps)[0] ?? null
}

/** The next enabled step strictly after `order`, or null when the sequence is done. */
export function nextStepAfter(steps: NurtureStep[], order: number): NurtureStep | null {
  return orderedSteps(steps).find((s) => s.order > order) ?? null
}

/** ISO timestamp `delayHours` after `fromMs` (clamped non-negative). */
export function runAtFrom(fromMs: number, delayHours: number): string {
  const hrs = Number.isFinite(delayHours) && delayHours > 0 ? delayHours : 0
  return new Date(fromMs + hrs * 3_600_000).toISOString()
}

/** Validate operator step input. Returns an error string, or null when valid. */
export function validateStepInput(input: { delayHours: number; subject: string; body: string }): string | null {
  if (!Number.isInteger(input.delayHours) || input.delayHours < 0) return 'Delay must be 0 or more whole hours.'
  if (input.delayHours > 24 * 365) return 'Delay is too long.'
  if (!input.subject.trim()) return 'Give the email a subject.'
  if (!input.body.trim()) return 'Write the email body.'
  return null
}
