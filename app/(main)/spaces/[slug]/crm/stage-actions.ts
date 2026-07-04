'use server'

// THE CLIENT-CALLABLE SERVER ACTIONS for per-space pipeline stages (ADR-517 Phase F2).
//
// A 'use server' module may export ONLY async functions, so it cannot also hold the pure helpers or the
// shared types. Those live in lib/crm/stages.ts (no directive: pure helpers + the invariants + the IO
// implementations, all unit-testable). This thin file is the seam the CLIENT stage editor imports, so
// the mutations cross the network boundary as proper Server Actions:
//   stage-editor.tsx -> createStage / renameStage / setStageKind / reorderStages / deleteStage
//
// The authorization (manage gate) + validation + space scoping + the Won/Lost invariant all live in the
// implementations; these wrappers just re-expose them, so the gate is re-checked server-side and can
// never be bypassed.

import {
  createStage as createStageImpl,
  renameStage as renameStageImpl,
  setStageKind as setStageKindImpl,
  reorderStages as reorderStagesImpl,
  deleteStage as deleteStageImpl,
} from '@/lib/crm/stages'
import type { StageKind } from '@/lib/crm/pipeline'
import { type ActionResult } from '@/lib/action-result'

/** Create a stage. Gated on canManage + the crm function, space-scoped (see the implementation). */
export async function createStage(
  slug: string,
  name: string,
  kind: StageKind,
): Promise<ActionResult<{ id: string }>> {
  return createStageImpl(slug, name, kind)
}

/** Rename a stage. Gated + space-scoped. */
export async function renameStage(slug: string, stageId: string, name: string): Promise<ActionResult> {
  return renameStageImpl(slug, stageId, name)
}

/** Set a stage's kind (open / won / lost). Gated + space-scoped; enforces the Won/Lost invariant. */
export async function setStageKind(
  slug: string,
  stageId: string,
  kind: StageKind,
): Promise<ActionResult> {
  return setStageKindImpl(slug, stageId, kind)
}

/** Reorder the stages. Gated + space-scoped; `orderedIds` must be a permutation of the current ids. */
export async function reorderStages(slug: string, orderedIds: string[]): Promise<ActionResult> {
  return reorderStagesImpl(slug, orderedIds)
}

/** Delete a stage. Gated + space-scoped; enforces the Won/Lost invariant + reassigns deals off it. */
export async function deleteStage(slug: string, stageId: string): Promise<ActionResult> {
  return deleteStageImpl(slug, stageId)
}
