// The PURE structural validator for a managed onboarding flow (Layer 2 data; see sequence-schema.ts).
// No IO, no client imports — it reads only the server-safe registry facts (step-types.ts), so the
// janitor-gated write layer (app/(main)/admin/library/sequence-actions.ts), the client editor, and a
// unit test can all call it. parseSequenceDef (sequence-schema.ts) already enforces the SHAPE (a
// non-empty steps array of {id, type}); this adds the SEMANTIC rules the resolver relies on, so an
// invalid flow can never be published to `approved`/`final` (the statuses that serve live members).
//
// Rules checked, each as a plain, presentation-ready error string (voice canon: no em dashes):
//   1. the flow has at least one step
//   2. every step's `type` is a registered step type (step-types.ts / STEP_REGISTRY)
//   3. step ids are unique
//   4. any terminal `action` is a known key (SEQUENCE_ACTION_KEYS)
//   5. exactly one step names an action, and it is the LAST step

import type { SequenceDef } from './sequence-schema'
import { isStepType, isSequenceActionKey } from './step-types'

export type SequenceValidation = { ok: true } | { ok: false; errors: string[] }

export function validateSequenceDef(def: SequenceDef): SequenceValidation {
  const errors: string[] = []
  const steps = def.steps ?? []

  // 1. At least one step.
  if (steps.length === 0) {
    return { ok: false, errors: ['A flow needs at least one step.'] }
  }

  // 2. Every step type is registered.
  for (const step of steps) {
    if (!isStepType(step.type)) {
      const which = step.id ? `Step "${step.id}"` : 'A step'
      errors.push(`${which} uses an unknown step type "${step.type}".`)
    }
  }

  // 3. Step ids are unique.
  const seen = new Set<string>()
  const flagged = new Set<string>()
  for (const step of steps) {
    if (seen.has(step.id) && !flagged.has(step.id)) {
      errors.push(`Two steps share the id "${step.id}". Step ids must be unique.`)
      flagged.add(step.id)
    }
    seen.add(step.id)
  }

  // 4. Any named terminal action is a known key.
  for (const step of steps) {
    if (step.action !== undefined && !isSequenceActionKey(step.action)) {
      const which = step.id ? `Step "${step.id}"` : 'A step'
      errors.push(`${which} names an unknown terminal action "${step.action}".`)
    }
  }

  // 5. Exactly one action, on the last step.
  const withAction = steps.filter((s) => s.action !== undefined)
  const lastStep = steps[steps.length - 1]
  if (withAction.length === 0) {
    errors.push('The flow has no terminal action. The last step must complete the flow.')
  } else if (withAction.length > 1) {
    errors.push('Only one step can carry the terminal action.')
  } else if (withAction[0] !== lastStep) {
    errors.push('The terminal action must be on the last step.')
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors }
}
