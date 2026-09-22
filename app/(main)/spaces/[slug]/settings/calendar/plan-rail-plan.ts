// ─────────────────────────────────────────────────────────────────────────────
// THE PLAN DRAWER'S PLAN (ADR-1386 · ADR-1468 · ADR-1240 · PROG-CAL2).
//
// The drawer used to declare its fields by hand: four labelled controls with their own option
// lists, beside a manifest (lib/studio/entities/space-plan.ts) that declared the same fields with
// its own labels and options. Nothing compared the two, and they drifted: the drawer offered "Plan"
// where the manifest said "Planning" (LIVE-461), and the manifest's `links` repeat had no control at
// all, so `space_plans.links` was unreachable from the product (HYG-108's finding on this row).
//
// Now the drawer renders THIS, and this is the manifest filtered through the kernel's edit plan.
// What this file says for itself is only the SAVE PATH: the columns `saveSpacePlan` carries in its
// PlanInput. Everything a field IS — label, kind, options, required, order — is the manifest's,
// read through `railForm()`. Reorder the manifest and the drawer reorders. Add a field to the
// manifest and, if the action writes it, it appears; if the action does not, it lands in `dropped`
// and the test beside this file says so.
//
// PURE: the manifest and the kernel only. The drawer and its test both import this, so the test
// pins what the drawer renders without mounting a client component that reaches server actions.
// ─────────────────────────────────────────────────────────────────────────────

import { SPACE_PLAN_MANIFEST } from '@/lib/studio/entities/space-plan'
import { railForm, type RailForm } from '@/lib/studio/kernel/edit-plan'

/**
 * The columns `saveSpacePlan` writes, as `PlanInput` names them. `playbookId` is also a written
 * column but is not here on purpose: the drawer never edits it (a Plan takes its playbook when it is
 * started from one, `startPlanFromPlaybook`), so listing it would put a control on the rail for a
 * value the drawer has no business changing.
 */
export const PLAN_WRITES = ['title', 'notes', 'stage', 'targetKind', 'links'] as const

export const PLAN_RAIL: RailForm = railForm(SPACE_PLAN_MANIFEST, PLAN_WRITES)

/**
 * The word a stage VALUE is shown as, from the one place that declares it. The production summary's
 * Stage row used to spell this with its own ternary, which is how the drawer came to disagree with
 * itself (LIVE-461: "Planning" in the summary, "Plan" in the picker below it).
 */
export function planStageLabel(stage: string): string {
  const field = SPACE_PLAN_MANIFEST.fields.find((f) => f.path === 'stage')
  return field?.options?.find((o) => o.value === stage)?.label ?? stage
}
