import 'server-only'

// The Vera conversation AI seams (ADR-812 Phase 5) as ONE shared implementation, called by BOTH the
// platform Resonance CRM and every per-Space tenant CRM. Each caller supplies its own gate + already-
// resolved conversationId + the acting profileId; the logic (prompts, budget guards, model call, parsing)
// lives here so an edit applies to both surfaces at once. Every output lands in a human-editable / reversible
// field — a human still runs the gated Send / triage.

import { getWorkspaceThread } from '@/lib/comms/workspace'
import { updateConversationFields } from '@/lib/comms/conversations'
import { completeText, AiUnavailableError } from '@/lib/ai/complete'
import { withVoice } from '@/lib/ai/voice'
import { aiAvailable, featureOverBudget, recordAiUsage } from '@/lib/ai/usage'
import { CONVERSATION_PRIORITIES, PRIORITY_LABELS, type ConversationPriority } from '@/lib/comms/labels'
import { type ActionResult, ok, fail } from '@/lib/action-result'

const DRAFT_SYSTEM = `You draft a reply to a member on behalf of a Frequency team member.
Write a warm, plain, direct reply of 2 to 5 sentences. Answer what they actually asked.
Do not invent facts, policies, prices, or dates you were not given. Output ONLY the reply body, no subject, no signature.`

const SUMMARY_SYSTEM = `You summarize a support/CRM conversation for a team member skimming their inbox.
One or two plain sentences: what the person wants and where the thread stands. Output ONLY the summary.`

const TRIAGE_SYSTEM = `You classify a conversation's priority. Reply with ONE line: "<priority> — <one short reason>".
Priority is one of: low, normal, high, urgent. Urgent = money, access loss, or an upset member about to churn.`

/** Render the thread as an oldest-first transcript for a prompt (skips internal notes). */
function transcript(messages: { direction: string; authorName: string; body: string; isInternal: boolean }[]): string {
  return messages
    .filter((m) => !m.isInternal)
    .map((m) => `${m.direction === 'inbound' ? 'Them' : 'Us'} (${m.authorName}): ${m.body}`)
    .join('\n')
    .slice(0, 8000)
}

/** Pull a priority word + a short reason out of the model's one-line answer. Picks the priority word that
 *  appears EARLIEST in the text (not first by array order, so "not low priority, this is urgent" reads as
 *  urgent). Fail-safe to 'normal'. */
function parseTriage(text: string): { priority: ConversationPriority; reason: string } {
  const lower = (text ?? '').toLowerCase()
  let priority: ConversationPriority = 'normal'
  let firstAt = Infinity
  for (const p of CONVERSATION_PRIORITIES) {
    const at = lower.indexOf(p)
    if (at >= 0 && at < firstAt) {
      firstAt = at
      priority = p
    }
  }
  const dash = text.indexOf('—') >= 0 ? text.indexOf('—') : text.indexOf('-')
  const reason = (dash >= 0 ? text.slice(dash + 1) : text).trim().slice(0, 160) || PRIORITY_LABELS[priority]
  return { priority, reason }
}

/** Draft a reply with Vera — the text lands in the composer for a human to review, edit, and send. */
export async function veraDraftReply(conversationId: string, profileId: string): Promise<ActionResult<{ draft: string }>> {
  const id = (conversationId ?? '').trim()
  if (!id) return fail('Pick a conversation first.')
  if (!(await aiAvailable()) || (await featureOverBudget('conversation-draft'))) {
    return fail('Vera drafting is unavailable right now. Write your reply and send it.')
  }
  const thread = await getWorkspaceThread(id)
  if (!thread) return fail('That conversation no longer exists.')
  try {
    const res = await completeText({
      system: withVoice(DRAFT_SYSTEM),
      messages: [{ role: 'user', content: `Subject: ${thread.subject}\n\n${transcript(thread.messages)}\n\nDraft the next reply from us.` }],
      tier: 'haiku',
      maxTokens: 320,
    })
    await recordAiUsage({ feature: 'conversation-draft', model: res.tier, usage: res.usage, costUsd: res.costUsd, profileId })
    const draft = res.text.trim()
    if (!draft) return fail('Vera had nothing to add. Write your reply and send it.')
    return ok({ draft })
  } catch (err) {
    if (err instanceof AiUnavailableError) return fail('Vera drafting is unavailable right now.')
    return fail('Could not draft a reply. Try again.')
  }
}

/** One short summary of the thread (a skim aid; never sent). */
export async function veraSummarize(conversationId: string, profileId: string): Promise<ActionResult<{ summary: string }>> {
  const id = (conversationId ?? '').trim()
  if (!id) return fail('Pick a conversation first.')
  if (!(await aiAvailable()) || (await featureOverBudget('conversation-summarize'))) {
    return fail('Summaries are unavailable right now.')
  }
  const thread = await getWorkspaceThread(id)
  if (!thread) return fail('That conversation no longer exists.')
  try {
    const res = await completeText({
      system: withVoice(SUMMARY_SYSTEM),
      messages: [{ role: 'user', content: `Subject: ${thread.subject}\n\n${transcript(thread.messages)}` }],
      tier: 'haiku',
      maxTokens: 120,
    })
    await recordAiUsage({ feature: 'conversation-summarize', model: res.tier, usage: res.usage, costUsd: res.costUsd, profileId })
    const summary = res.text.trim()
    return summary ? ok({ summary }) : fail('Nothing to summarize yet.')
  } catch (err) {
    if (err instanceof AiUnavailableError) return fail('Summaries are unavailable right now.')
    return fail('Could not summarize. Try again.')
  }
}

/** Suggest + apply a priority (persists it, reversibly). The CALLER revalidates its own inbox path after. */
export async function veraSuggestTriage(
  conversationId: string,
  profileId: string,
): Promise<ActionResult<{ priority: ConversationPriority; reason: string }>> {
  const id = (conversationId ?? '').trim()
  if (!id) return fail('Pick a conversation first.')
  if (!(await aiAvailable()) || (await featureOverBudget('conversation-triage'))) {
    return fail('Triage is unavailable right now.')
  }
  const thread = await getWorkspaceThread(id)
  if (!thread) return fail('That conversation no longer exists.')
  try {
    const res = await completeText({
      system: withVoice(TRIAGE_SYSTEM),
      messages: [{ role: 'user', content: `Subject: ${thread.subject}\n\n${transcript(thread.messages)}` }],
      tier: 'haiku',
      maxTokens: 60,
    })
    await recordAiUsage({ feature: 'conversation-triage', model: res.tier, usage: res.usage, costUsd: res.costUsd, profileId })
    const parsed = parseTriage(res.text)
    await updateConversationFields(id, { priority: parsed.priority })
    return ok(parsed)
  } catch (err) {
    if (err instanceof AiUnavailableError) return fail('Triage is unavailable right now.')
    return fail('Could not triage. Try again.')
  }
}
