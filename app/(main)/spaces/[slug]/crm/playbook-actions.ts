'use server'

// The Space CRM next-best-action picker actions (Resonance Engine · ADR-382 · docs/NEXT-GEN-CRM.md
// Altitude 3 "Action: next-best-action playbook picker"). The OWNER-scoped twin of the staff-only Vera
// Today actions (app/(main)/admin/crm/today/actions.ts): the same governed confirm-then-execute path,
// the same circuit breaker + autonomy gate, the same run log + dismissal training signal, but gated on
// the SPACE EDITOR (owner / admin / editor) for ONE Space, not the platform staff floor.
//
// SELF-GUARDED: re-resolves the Space from the slug and re-gates getSpaceCapabilities(canEditProfile)
// server-side, so a non-editor can never run a play on another operator's Space. The contact must
// belong to THIS Space (getSpaceContactDetail returns null otherwise), and the run is stamped with the
// Space id (the binding scope) so the circuit breaker + dashboard read it per Space.
//
// SUGGEST-BY-DEFAULT stays intact: the outbound leg drafts + send-gates, never auto-sends, and the
// per-Space autonomy slider (fail-closed to suggest_only) governs whether the in-product auto leg may
// run on its own. No em or en dashes (owner copy, CONTENT-VOICE §10).

import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { getSpaceContactDetail } from '@/lib/crm/space-contact-detail'
import { executeConfirmedTool } from '@/lib/ai/vera/execute'
import { getPlaybook } from '@/lib/playbooks/registry'
import { recordPlaybookRun } from '@/lib/playbooks/runs'
import { isPlaybookPaused } from '@/lib/playbooks/circuit-breaker'
import { recordContactInteraction } from '@/lib/crm/interactions'
import { processGamificationEvent } from '@/lib/achievements'
import { type ActionResult, ok, fail } from '@/lib/action-result'

/** Resolve + gate the caller as an editor of this Space, returning the operator profile id + the
 *  contact's member profile id (for save_streak / send-gate), or a failure. The contact MUST belong to
 *  this Space (getSpaceContactDetail is owner-gated + space-scoped, null otherwise). */
async function gateSpaceContact(
  slug: string,
  contactId: string,
): Promise<{ ok: true; spaceId: string; operatorId: string; subjectProfileId: string | null } | { ok: false; error: string }> {
  const caller = await getCallerProfile()
  const operatorId = caller?.id ?? null
  if (!operatorId) return { ok: false, error: 'Sign in to run a play.' }
  const space = await getVisibleSpaceBySlug(slug, operatorId)
  if (!space) return { ok: false, error: 'You do not have access to this space.' }
  const caps = await getSpaceCapabilities(space, operatorId)
  if (!caps.canEditProfile) return { ok: false, error: 'Only the people who run this space can do this.' }
  // The contact must belong to THIS Space (and resolve its member profile id for the subject tools).
  const detail = await getSpaceContactDetail(space.id, contactId)
  if (!detail) return { ok: false, error: 'That contact is not in this space.' }
  return { ok: true, spaceId: space.id, operatorId, subjectProfileId: detail.insight.profileId }
}

/** Shape the args for a playbook's primary tool from the Space card. Mirrors the Today action's
 *  argsForTool, fail-closed: a tool that needs a member profile returns null when the contact is a
 *  pure lead (no login), so the picker shows the calm "cannot run yet" reason. */
function argsForTool(
  tool: string,
  card: { contactId: string; subjectProfileId: string | null; playbookId: string; tweak?: { subject?: string; body?: string } },
): Record<string, unknown> | null {
  switch (tool) {
    case 'save_streak':
      if (!card.subjectProfileId) return null
      return { subjectProfileId: card.subjectProfileId, playbookId: card.playbookId }
    case 'give_gem_gift':
      if (!card.subjectProfileId) return null
      return { subjectProfileId: card.subjectProfileId, playbookId: card.playbookId }
    case 'tag_contact':
      return { contactId: card.contactId, tag: 'cooling', playbookId: card.playbookId }
    case 'move_contact_stage':
      return { contactId: card.contactId, stage: 'advocate', playbookId: card.playbookId }
    case 'send_playbook_email':
      if (!card.subjectProfileId) return null
      return {
        subjectProfileId: card.subjectProfileId,
        contactId: card.contactId,
        category: 'lifecycle',
        subject: card.tweak?.subject?.trim() || 'A quick note',
        body: card.tweak?.body?.trim() || 'Just checking in. We would love to see you back.',
        playbookId: card.playbookId,
      }
    default:
      return null
  }
}

/**
 * "Do it" on the Space picker: run the playbook's PRIMARY governed action against this Space contact,
 * through the same confirm-then-execute path as every Vera write (validated, consent-gated for the
 * outbound tool, audited), then log the run as done and revalidate the board. The circuit breaker is
 * consulted first (a paused playbook never runs, even on an explicit tap).
 */
export async function runSpacePlaybookAction(input: {
  slug: string
  playbookId: string
  contactId: string
  tweak?: { subject?: string; body?: string }
}): Promise<ActionResult> {
  const gate = await gateSpaceContact(input.slug, input.contactId)
  if (!gate.ok) return fail(gate.error)
  const { spaceId, operatorId, subjectProfileId } = gate

  const playbook = getPlaybook(input.playbookId)
  if (!playbook) return fail('That play is not in the registry.')
  const primary = playbook.actions[0]
  if (!primary) return fail('This play has nothing to run.')

  // Circuit breaker (Phase 3 · ADR-384), scoped to this Space's runs. Fail-closed for outbound.
  if (await isPlaybookPaused(input.playbookId, { spaceId })) {
    await recordPlaybookRun({
      playbookId: input.playbookId,
      subjectKind: 'contact',
      subjectId: input.contactId,
      actorProfileId: operatorId,
      status: 'failed',
      outcome: 'paused by circuit breaker',
      spaceId,
    })
    return fail('This play is paused for now. Too many people have waved it off lately.')
  }

  const args = argsForTool(primary.tool, { ...input, subjectProfileId })
  if (!args) return fail('This contact is missing what that move needs. They may not be a member yet.')

  const res = await executeConfirmedTool(operatorId, primary.tool, args)
  if (!res.ok) {
    await recordPlaybookRun({
      playbookId: input.playbookId,
      subjectKind: 'contact',
      subjectId: input.contactId,
      actorProfileId: operatorId,
      status: 'failed',
      outcome: res.error ?? 'tool failed',
      spaceId,
    })
    return fail(res.error ?? 'That did not go through.')
  }

  await recordPlaybookRun({
    playbookId: input.playbookId,
    subjectKind: 'contact',
    subjectId: input.contactId,
    actorProfileId: operatorId,
    status: 'done',
    outcome: primary.tool,
    spaceId,
  })

  // A finished play can fire a retroactive milestone for the member it touched (best-effort, swallowed).
  if (subjectProfileId) {
    processGamificationEvent({
      type: 'playbook_complete',
      profileId: subjectProfileId,
      playbookId: input.playbookId,
    }).catch(() => {})
  }

  revalidatePath(`/spaces/${input.slug}/crm`)
  return ok()
}

/**
 * "Not now" on the Space picker: dismiss the suggestion. Records a dismissal touch on the timeline AND
 * a dismissed run (the training signal that teaches the next night's ranking), both scoped to this
 * Space. Owner-gated, contact must belong to this Space.
 */
export async function dismissSpacePlaybook(input: {
  slug: string
  playbookId: string
  contactId: string
}): Promise<ActionResult> {
  const gate = await gateSpaceContact(input.slug, input.contactId)
  if (!gate.ok) return fail(gate.error)
  const { spaceId, operatorId } = gate

  await recordContactInteraction(
    {
      ownerProfileId: operatorId,
      subjectKind: 'contact',
      subjectId: input.contactId,
      channel: 'system',
      direction: 'internal',
      summary: 'Dismissed a suggested play',
      metadata: { playbook_id: input.playbookId, action: 'dismiss' },
      source: 'playbook',
    },
    spaceId,
  )

  await recordPlaybookRun({
    playbookId: input.playbookId,
    subjectKind: 'contact',
    subjectId: input.contactId,
    actorProfileId: operatorId,
    status: 'dismissed',
    outcome: 'not now',
    spaceId,
  })

  revalidatePath(`/spaces/${input.slug}/crm`)
  return ok()
}
