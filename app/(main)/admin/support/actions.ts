'use server'

// Support console actions (ADR-159) — staff triage. Gated to host+ (the Studio
// default for this area; a janitor can retune it from the permission grid). Writes
// go through the service-role store behind this authz.

import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { atLeastRole } from '@/lib/core/roles'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import { updateTicketFields, addStaffMessage, getTicketAdmin, type TicketUpdate } from '@/lib/support/store'
import { TICKET_PRIORITIES, type TicketPriority } from '@/lib/support/types'
import { aiAvailable, featureOverBudget, recordAiUsage } from '@/lib/ai/usage'
import { completeText, AiUnavailableError } from '@/lib/ai/complete'
import { retrieveHelpChunks } from '@/lib/ai/help-rag'

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

const DRAFT_SYSTEM = `You are a member of the Frequency community team drafting a reply to a support ticket, for a human teammate to review and send. Be warm, concise, and specific to what the member asked. GROUND your answer in the HELP CONTEXT excerpts when they're relevant (use their facts; don't quote or link them). If the excerpts don't cover it and you don't actually know a platform specific (a price, a setting, an exact step), do NOT invent it — say the team will look into it and follow up. Plain text, 2–5 sentences, a friendly sign-off. Output ONLY the reply.`

// Draft a suggested reply to a ticket with Claude (the "virtual staff" seam, ADR-167).
// Host+ only. Grounded in the ticket thread + retrieved help articles (via the non-logging
// retrieval, so it doesn't pollute the help-gap signal); returns the text for the agent to
// edit and SEND (never auto-sends). Budget-gated with a deterministic fallback.
export async function draftReply(id: string): Promise<ActionResult<{ draft: string }>> {
  const agent = await requireAgent()
  if (typeof agent === 'string') return fail(agent)

  const ticket = await getTicketAdmin(id)
  if (!ticket) return fail('Ticket not found.')

  // The member-visible conversation (drop internal notes), oldest first.
  const memberMsgs = ticket.messages.filter((m) => !m.isInternal)
  const convo = memberMsgs
    .map((m) => `${m.authorKind === 'member' ? 'Member' : m.authorKind === 'staff' ? 'Team' : m.authorKind}: ${m.body}`)
    .join('\n')

  if ((await aiAvailable()) && !(await featureOverBudget('support-draft'))) {
    try {
      // Ground in the help center: retrieve on the subject + the latest member message.
      const lastMember = [...memberMsgs].reverse().find((m) => m.authorKind === 'member')?.body ?? ''
      const chunks = await retrieveHelpChunks(`${ticket.subject}\n${lastMember}`, { matchCount: 5, minSimilarity: 0.3 })
      const helpContext = chunks.length
        ? `HELP CONTEXT (grounded excerpts):\n${chunks.map((c, i) => `[${i + 1}] ${c.category}/${c.slug}${c.heading ? ` — ${c.heading}` : ''}\n${c.content}`).join('\n\n')}`
        : 'HELP CONTEXT: (no relevant help article found — don\'t guess platform specifics)'

      const res = await completeText({
        system: DRAFT_SYSTEM,
        messages: [{ role: 'user', content: `TICKET (${ticket.type}): ${ticket.subject}\n\n${convo}\n\n${helpContext}` }],
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

const TRIAGE_SYSTEM = `You triage support tickets for a community platform. Read the ticket and respond with EXACTLY one priority word — low, normal, high, or urgent — then " — " then a brief reason (one short clause). Examples of urgent: can't sign in, lost data, payment broken, safety. High: a blocking bug for one member. Normal: most questions/requests. Low: ideas/feedback. Output only that one line.`

/** Pull a priority word + short reason from a free-text classification. */
function parseTriage(text: string): { priority: TicketPriority; reason: string } {
  const lower = text.toLowerCase()
  const priority = (TICKET_PRIORITIES.find((p) => new RegExp(`\\b${p}\\b`).test(lower)) ?? 'normal') as TicketPriority
  const reason = text.replace(/^[^—:-]*[—:-]\s*/, '').trim().slice(0, 160) || 'AI triage'
  return { priority, reason }
}

// AI triage (the "virtual staff" seam, ADR-167): Claude classifies a ticket's priority,
// then SETS it (host+ already gate the console). Returns the chosen priority + a one-line
// reason. Budget-gated; a keyword heuristic backs it up when AI is off.
export async function suggestTriage(id: string): Promise<ActionResult<{ priority: TicketPriority; reason: string }>> {
  const agent = await requireAgent()
  if (typeof agent === 'string') return fail(agent)
  const ticket = await getTicketAdmin(id)
  if (!ticket) return fail('Ticket not found.')

  const firstMsg = ticket.messages.find((m) => !m.isInternal && m.authorKind === 'member')?.body ?? ''
  let triage: { priority: TicketPriority; reason: string } | null = null

  if ((await aiAvailable()) && !(await featureOverBudget('support-draft'))) {
    try {
      const res = await completeText({
        system: TRIAGE_SYSTEM,
        messages: [{ role: 'user', content: `TYPE: ${ticket.type}\nSUBJECT: ${ticket.subject}\n${firstMsg}` }],
        tier: 'haiku',
        maxTokens: 60,
      })
      await recordAiUsage({ feature: 'support-draft', model: res.tier, usage: res.usage, costUsd: res.costUsd, profileId: agent.id })
      if (res.text) triage = parseTriage(res.text)
    } catch (e) {
      if (!(e instanceof AiUnavailableError)) { /* fall through */ }
    }
  }

  // Heuristic fallback — scan for urgency signals.
  if (!triage) {
    const t = `${ticket.subject} ${firstMsg}`.toLowerCase()
    const priority: TicketPriority = /\b(can.?t (sign|log) in|locked out|lost|broken|payment|charged|refund|urgent|asap|safety|harass)\b/.test(t)
      ? 'high'
      : ticket.type === 'idea' || ticket.type === 'feedback'
        ? 'low'
        : 'normal'
    triage = { priority, reason: 'Heuristic triage (AI off)' }
  }

  await updateTicketFields(id, { priority: triage.priority })
  revalidatePath(`/admin/support/${id}`)
  revalidatePath('/admin/support')
  return ok(triage)
}
