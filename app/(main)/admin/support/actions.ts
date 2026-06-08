'use server'

// Support console actions (ADR-159) — staff triage. Gated to host+ (the Studio
// default for this area; a janitor can retune it from the permission grid). Writes
// go through the service-role store behind this authz.

import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { atLeastRole } from '@/lib/core/roles'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import { updateTicketFields, addStaffMessage, getTicketAdmin, type TicketUpdate } from '@/lib/support/store'
import { aiAvailable, featureOverBudget, recordAiUsage } from '@/lib/ai/usage'
import { completeText, AiUnavailableError } from '@/lib/ai/complete'

async function requireAgent(): Promise<{ id: string } | string> {
  const me = await getCallerProfile()
  if (!me) return 'Sign in first.'
  if (!atLeastRole(me.community_role, 'host')) return 'Support console is staff-only.'
  return { id: me.id }
}

export async function setTicketFields(id: string, patch: TicketUpdate): Promise<ActionResult> {
  const agent = await requireAgent()
  if (typeof agent === 'string') return fail(agent)
  await updateTicketFields(id, patch)
  revalidatePath(`/admin/support/${id}`)
  revalidatePath('/admin/support')
  return ok()
}

export async function staffReply(id: string, body: string, isInternal: boolean): Promise<ActionResult> {
  const agent = await requireAgent()
  if (typeof agent === 'string') return fail(agent)
  if (!body.trim()) return fail('Write a message first.')
  await addStaffMessage(id, agent.id, body, isInternal)
  revalidatePath(`/admin/support/${id}`)
  revalidatePath('/admin/support')
  return ok()
}

const DRAFT_SYSTEM = `You are a member of the Frequency community team drafting a reply to a support ticket, for a human teammate to review and send. Be warm, concise, and specific to what the member asked. If you don't actually know a platform specific (a price, a setting, an exact step), do NOT invent it — say the team will look into it and follow up. Plain text, 2–5 sentences, a friendly sign-off. Output ONLY the reply.`

// Draft a suggested reply to a ticket with Claude (the "virtual staff" seam, ADR-167).
// Host+ only. Drafts from the ticket thread; returns the text for the agent to edit and
// send (never auto-sends). Budget-gated with a deterministic fallback. (Help-article
// grounding is a follow-up — it needs a retrieval that doesn't log to the help-gap signal.)
export async function draftReply(id: string): Promise<ActionResult<{ draft: string }>> {
  const agent = await requireAgent()
  if (typeof agent === 'string') return fail(agent)

  const ticket = await getTicketAdmin(id)
  if (!ticket) return fail('Ticket not found.')

  // The member-visible conversation (drop internal notes), oldest first.
  const convo = ticket.messages
    .filter((m) => !m.isInternal)
    .map((m) => `${m.authorKind === 'member' ? 'Member' : m.authorKind === 'staff' ? 'Team' : m.authorKind}: ${m.body}`)
    .join('\n')

  if ((await aiAvailable()) && !(await featureOverBudget('support-draft'))) {
    try {
      const res = await completeText({
        system: DRAFT_SYSTEM,
        messages: [{ role: 'user', content: `TICKET (${ticket.type}): ${ticket.subject}\n\n${convo}` }],
        tier: 'haiku',
        maxTokens: 320,
      })
      await recordAiUsage({ feature: 'support-draft', model: res.tier, usage: res.usage, costUsd: res.costUsd, profileId: agent.id })
      if (res.text) return ok({ draft: res.text })
    } catch (e) {
      if (!(e instanceof AiUnavailableError)) {
        // fall through to the deterministic draft
      }
    }
  }

  // Deterministic fallback when AI is off / over budget — a warm acknowledgment skeleton.
  const fallback = `Hi — thanks for reaching out about "${ticket.subject}". A teammate is looking into this and will follow up shortly.\n\n— The Frequency team`
  return ok({ draft: fallback })
}
