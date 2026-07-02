// Onboarding sequences — the four-layer contract (docs/LOOM-PLATFORM.md §3, generalising the
// beta copy-layer in resolve-sequence.ts). An onboarding flow is a Loom-managed asset
// (library_assets kind='sequence'); this file is the PURE data shape that lands in its
// `config jsonb`. Dependency-free (only types + zod), so the resolver (server), the runner
// (client), and the default-sequence (code) can all import it.
//
//   Layer 1 (code, git) — the step *components* + detection + side-effects. Lives in
//                         lib/onboarding/step-registry.tsx. A step points back into it by `type`
//                         (the element/{registry,name} bindings pattern) and by `action` key.
//   Layer 2 (data)      — order / content / targeting / gating: THIS `SequenceDef`, stored as
//                         config on a kind='sequence' row (or shipped in code as the default).
//   Layer 3 (targeting) — SequenceTarget (who/where) + per-step AppGate (may-see).
//   Layer 4 (tokens)    — styling stays token-only; no shape here.

import { z } from 'zod'
import type { AppGate } from '@/lib/apps/types'

/** WHO/WHERE a managed sequence applies to. Each axis is a set; an ABSENT/empty axis is a
 *  wildcard (matches everyone). The resolver ranks matches most-specific-first. */
export interface SequenceTarget {
  /** Persona ids this sequence is for (lib/onboarding/personas.ts). Absent = every persona. */
  personas?: string[]
  /** nexus_region_id values this sequence is for. Absent = every region. */
  regionIds?: string[]
}

/** One step in a flow. `type` binds to a registered step in code (step-registry.tsx); `content`
 *  is the operator-editable copy for that type (validated by the type's contentSchema); `gate`
 *  reuses the App gate union so a step can be hidden from viewers who can't pass it; the terminal
 *  step names its side-effecting server action by `action` KEY (resolved in code, never inlined). */
export interface SequenceStep {
  /** Stable id — the progress/animation/focus key. */
  id: string
  /** The registered step type (binds to a component + contentSchema + validate). */
  type: string
  /** Progress-cue label shown in WizardProgress (e.g. "About you"). */
  label?: string
  /** Operator-editable copy for this step; shape is the step type's contentSchema. */
  content?: Record<string, unknown>
  /** Per-step visibility gate (reuses AppGate). Absent = always shown. */
  gate?: AppGate
  /** Terminal action key resolved in code (do not reimplement). Only the last step sets this. */
  action?: string
}

/** A whole onboarding flow, expressed as data. Shipped in code as the default, or stored on a
 *  kind='sequence' library asset's `config`. */
export interface SequenceDef {
  /** Stable key (mirrors the asset slug). */
  key: string
  /** Operator/analytics label for the flow. */
  label: string
  /** The quiet kicker above every step's heading (WizardShell eyebrow). */
  eyebrow?: string
  /** The ordered steps. */
  steps: SequenceStep[]
  /** Who/where this flow targets (most-specific wins in the resolver). */
  target?: SequenceTarget
}

// ── Runtime validation ────────────────────────────────────────────────────────────────────
// A managed row's `config` is untrusted jsonb, so the resolver parses it through this before it
// ever reaches the runner. `gate` is passed through as unknown here (the App gate union is
// validated where it's consumed); everything structural is checked.

const targetSchema = z
  .object({
    personas: z.array(z.string()).optional(),
    regionIds: z.array(z.string()).optional(),
  })
  .optional()

const stepSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  label: z.string().optional(),
  content: z.record(z.string(), z.unknown()).optional(),
  gate: z.unknown().optional(),
  action: z.string().optional(),
})

const sequenceDefSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  eyebrow: z.string().optional(),
  steps: z.array(stepSchema).min(1),
  target: targetSchema,
})

/** Parse an untrusted `config` jsonb into a SequenceDef, or null if it doesn't validate. The
 *  resolver treats null as "no managed sequence here" and falls back to the code default. */
export function parseSequenceDef(config: unknown): SequenceDef | null {
  const parsed = sequenceDefSchema.safeParse(config)
  return parsed.success ? (parsed.data as unknown as SequenceDef) : null
}
