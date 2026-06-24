'use server'

// Vera "Today" actions (Resonance Engine Phase 1 - ADR-382). The governed write path for
// the three Today buttons:
//   • Do it   -> runs the playbook's primary action through the governed confirm-then-execute
//               path (lib/ai/vera/execute.ts), then logs the run (done).
//   • Not now -> records a dismissal interaction + a 'dismissed' run. This IS the training
//               signal (docs/NEXT-GEN-CRM.md): the next night's ranking learns from it.
//   • Tweak   -> handled client-side (opens the draft inline); no server action needed in v1.
//
// authz: every action gates with requireAdmin (the staff floor for /admin/crm), so the
// caller is an authorized operator. The operator's profile id is the timeline OWNER stamped
// on every touch + run (the scope binding). Outbound stays suggest-only: send_playbook_email
// drafts and send-gates, never auto-sends.

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin/guard'
import { executeConfirmedTool } from '@/lib/ai/vera/execute'
import { getPlaybook } from '@/lib/playbooks/registry'
import { recordPlaybookRun, type PlaybookSubjectKind } from '@/lib/playbooks/runs'
import { recordContactInteraction } from '@/lib/crm/interactions'
import { isPlaybookPaused } from '@/lib/playbooks/circuit-breaker'

export interface TodayActionResult {
  ok: boolean
  error?: string
}

/** Whether the card has the bits a given tool needs. */
function argsForTool(
  tool: string,
  card: { contactId: string; subjectProfileId: string | null; playbookId: string; tweak?: { subject?: string; body?: string } },
): Record<string, unknown> | null {
  switch (tool) {
    case 'save_streak':
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
        subject: card.tweak?.subject?.trim() || 'A quick note from Frequency',
        body: card.tweak?.body?.trim() || 'Just checking in. We would love to see you back.',
        playbookId: card.playbookId,
      }
    default:
      return null
  }
}

/**
 * "Do it": run the playbook's PRIMARY (first) governed action against the card's subject.
 * Routes through the same confirm-then-execute path as every Vera write, so it is validated,
 * consent-gated (for the outbound tool), and audited. Then logs the run as done.
 */
export async function runPlaybookAction(input: {
  playbookId: string
  contactId: string
  subjectProfileId: string | null
  tweak?: { subject?: string; body?: string }
}): Promise<TodayActionResult> {
  const { profileId } = await requireAdmin('janitor')

  const playbook = getPlaybook(input.playbookId)
  if (!playbook) return { ok: false, error: 'That playbook is not in the registry.' }
  const primary = playbook.actions[0]
  if (!primary) return { ok: false, error: 'This playbook has nothing to run.' }

  // Circuit breaker (Phase 3 · ADR-384): a PAUSED playbook never executes, even on an explicit tap.
  // FAIL-CLOSED for outbound (isPlaybookPaused suppresses an outbound playbook on a degraded read).
  if (await isPlaybookPaused(input.playbookId)) {
    await recordPlaybookRun({
      playbookId: input.playbookId,
      subjectKind: 'contact' as PlaybookSubjectKind,
      subjectId: input.contactId,
      actorProfileId: profileId,
      status: 'failed',
      outcome: 'paused by circuit breaker',
    })
    return { ok: false, error: 'This playbook is paused for now. Too many people have waved it off lately.' }
  }

  const args = argsForTool(primary.tool, input)
  if (!args) return { ok: false, error: 'This card is missing what that action needs.' }

  const res = await executeConfirmedTool(profileId, primary.tool, args)
  if (!res.ok) {
    await recordPlaybookRun({
      playbookId: input.playbookId,
      subjectKind: 'contact' as PlaybookSubjectKind,
      subjectId: input.contactId,
      actorProfileId: profileId,
      status: 'failed',
      outcome: res.error ?? 'tool failed',
    })
    return { ok: false, error: res.error ?? 'That did not go through.' }
  }

  await recordPlaybookRun({
    playbookId: input.playbookId,
    subjectKind: 'contact' as PlaybookSubjectKind,
    subjectId: input.contactId,
    actorProfileId: profileId,
    status: 'done',
    outcome: primary.tool,
  })

  revalidatePath('/admin/crm/today')
  return { ok: true }
}

/**
 * "Not now": dismiss the card. Records a dismissal touch on the timeline AND a dismissed
 * run, the training signal that teaches the next night's ranking.
 */
export async function dismissPlaybookCard(input: {
  playbookId: string
  contactId: string
}): Promise<TodayActionResult> {
  const { profileId } = await requireAdmin('janitor')

  await recordContactInteraction({
    ownerProfileId: profileId,
    subjectKind: 'contact',
    subjectId: input.contactId,
    channel: 'system',
    direction: 'internal',
    summary: 'Dismissed a Today suggestion',
    metadata: { playbook_id: input.playbookId, action: 'dismiss' },
    source: 'playbook',
  })

  await recordPlaybookRun({
    playbookId: input.playbookId,
    subjectKind: 'contact',
    subjectId: input.contactId,
    actorProfileId: profileId,
    status: 'dismissed',
    outcome: 'not now',
  })

  revalidatePath('/admin/crm/today')
  return { ok: true }
}
