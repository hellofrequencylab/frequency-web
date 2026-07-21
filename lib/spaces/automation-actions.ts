'use server'

// THE CLIENT-CALLABLE SERVER ACTIONS for per-Space automation (R5). A 'use server' module may export
// ONLY async functions, so the pure validation helpers + shared types live in lib/spaces/automation.ts
// (no directive). This thin file is the seam the CLIENT surfaces import (the automation editor), so the
// mutations cross the network boundary as proper Server Actions. The authorization + validation all live
// in the implementations; these wrappers just re-expose them and revalidate the automation surface so the
// list reflects the change.

import { revalidatePath } from 'next/cache'
import {
  createSpaceRule as createSpaceRuleImpl,
  setSpaceRuleEnabled as setSpaceRuleEnabledImpl,
  deleteSpaceRule as deleteSpaceRuleImpl,
  createSpaceSequence as createSpaceSequenceImpl,
  instantiateAutomationTemplate as instantiateAutomationTemplateImpl,
  addSequenceStep as addSequenceStepImpl,
  deleteSequenceStep as deleteSequenceStepImpl,
  setSpaceSequenceEnabled as setSpaceSequenceEnabledImpl,
  deleteSpaceSequence as deleteSpaceSequenceImpl,
  startSequenceForAudience as startSequenceForAudienceImpl,
} from '@/lib/spaces/automation'
import { type ActionResult } from '@/lib/action-result'

// The automation surface lives at /spaces/<slug>/settings/automation. Revalidate it so the rule +
// sequence lists reflect a create / toggle / delete.
function revalidateAutomation(slug: string) {
  revalidatePath(`/spaces/${slug}/settings/automation`)
}

// ── Rules ─────────────────────────────────────────────────────────────────────────────────────

/** Create a trigger -> action rule. Gated on canEditProfile (see the implementation). */
export async function createSpaceRule(
  spaceId: string,
  slug: string,
  input: { name: string; trigger: string; action: string; config: unknown },
): Promise<ActionResult<{ id: string }>> {
  const res = await createSpaceRuleImpl(spaceId, input)
  if (!('error' in res)) revalidateAutomation(slug)
  return res
}

/** Turn a rule on / off. Gated on canEditProfile (see the implementation). */
export async function setSpaceRuleEnabled(
  spaceId: string,
  slug: string,
  id: string,
  enabled: boolean,
): Promise<ActionResult> {
  const res = await setSpaceRuleEnabledImpl(spaceId, id, enabled)
  if (!('error' in res)) revalidateAutomation(slug)
  return res
}

/** Delete a rule. Gated on canEditProfile (see the implementation). */
export async function deleteSpaceRule(
  spaceId: string,
  slug: string,
  id: string,
): Promise<ActionResult> {
  const res = await deleteSpaceRuleImpl(spaceId, id)
  if (!('error' in res)) revalidateAutomation(slug)
  return res
}

// ── Drip sequences ──────────────────────────────────────────────────────────────────────────────

/** Create an empty drip sequence. Gated on canEditProfile (see the implementation). */
export async function createSpaceSequence(
  spaceId: string,
  slug: string,
  input: { name: string; audience?: unknown },
): Promise<ActionResult<{ id: string }>> {
  const res = await createSpaceSequenceImpl(spaceId, input)
  if (!('error' in res)) revalidateAutomation(slug)
  return res
}

/** Add a pre-built template (welcome / onboarding / re-engage) as a new drip sequence, created OFF for
 *  review, plus its auto-enroll rule for a triggered template. Gated on canEditProfile (see the
 *  implementation). */
export async function instantiateAutomationTemplate(
  spaceId: string,
  slug: string,
  templateId: string,
): Promise<ActionResult<{ sequenceId: string }>> {
  const res = await instantiateAutomationTemplateImpl(spaceId, templateId)
  if (!('error' in res)) revalidateAutomation(slug)
  return res
}

/** Append a step to a sequence. Gated on canEditProfile (see the implementation). */
export async function addSequenceStep(
  spaceId: string,
  slug: string,
  sequenceId: string,
  input: { subject: string; body: string; delayHours: number },
): Promise<ActionResult<{ id: string }>> {
  const res = await addSequenceStepImpl(spaceId, sequenceId, input)
  if (!('error' in res)) revalidateAutomation(slug)
  return res
}

/** Delete a step. Gated on canEditProfile (see the implementation). */
export async function deleteSequenceStep(
  spaceId: string,
  slug: string,
  stepId: string,
): Promise<ActionResult> {
  const res = await deleteSequenceStepImpl(spaceId, stepId)
  if (!('error' in res)) revalidateAutomation(slug)
  return res
}

/** Turn a sequence on / off. Gated on canEditProfile (see the implementation). */
export async function setSpaceSequenceEnabled(
  spaceId: string,
  slug: string,
  id: string,
  enabled: boolean,
): Promise<ActionResult> {
  const res = await setSpaceSequenceEnabledImpl(spaceId, id, enabled)
  if (!('error' in res)) revalidateAutomation(slug)
  return res
}

/** Delete a sequence (its steps cascade). Gated on canEditProfile (see the implementation). */
export async function deleteSpaceSequence(
  spaceId: string,
  slug: string,
  id: string,
): Promise<ActionResult> {
  const res = await deleteSpaceSequenceImpl(spaceId, id)
  if (!('error' in res)) revalidateAutomation(slug)
  return res
}

/** START a sequence over its saved audience (the operator's manual RUNNER lever): enroll every matching
 *  contact at step one. Gated on canEditProfile AND the `crm.space.automation` entitlement (see the
 *  implementation, requireAutomationEditor). */
export async function startSequenceForAudience(
  spaceId: string,
  slug: string,
  sequenceId: string,
): Promise<ActionResult<{ enrolled: number }>> {
  const res = await startSequenceForAudienceImpl(spaceId, sequenceId)
  if (!('error' in res)) revalidateAutomation(slug)
  return res
}
