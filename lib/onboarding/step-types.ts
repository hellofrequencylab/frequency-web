// Server-safe registry facts — the canonical set of onboarding step TYPES and the terminal ACTION
// keys, split OUT of step-registry.tsx (which is 'use client': it carries the step components + their
// hooks). This module is PURE and dependency-free, so server code — the sequence write layer's pure
// validator (validate-sequence.ts) and the janitor-gated server actions — can consult the registry's
// facts WITHOUT importing the client module (whose runtime exports would become client references
// across the RSC boundary, so Object.keys(STEP_REGISTRY) on the server would be wrong).
//
// step-registry.tsx imports StepType back and types STEP_REGISTRY as Record<StepType, StepDef>, so the
// registry stays the single source of truth and TypeScript flags any drift between the two.

/** Every registered onboarding step type (Layer 1 bindings live in step-registry.tsx). */
export const STEP_TYPES = ['identity', 'profile', 'region', 'review'] as const
export type StepType = (typeof STEP_TYPES)[number]

/** The terminal action keys a sequence's last step may reference. The runner binds each key to its
 *  real server action (do not reimplement); config only ever names a key from this list. */
export const SEQUENCE_ACTION_KEYS = ['completeOnboarding'] as const
export type SequenceActionKey = (typeof SEQUENCE_ACTION_KEYS)[number]

/** True for any registered step type. */
export function isStepType(value: string): value is StepType {
  return (STEP_TYPES as readonly string[]).includes(value)
}

/** True for any known terminal action key. */
export function isSequenceActionKey(value: string): value is SequenceActionKey {
  return (SEQUENCE_ACTION_KEYS as readonly string[]).includes(value)
}
