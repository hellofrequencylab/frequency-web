// Vera's LIVE turn — a real Claude tool-use loop (ADR-066 Phase D, AI-VERA §6).
// This is the AI behind the deterministic concierge: same bounded tools, same
// propose-and-confirm contract, now driven by the model. READ tools (suggest_circle,
// find_host) run server-side and feed back into the loop; WRITE tools are NEVER
// executed here — they're returned as proposals the member must confirm (ADR-028).
//
// Runs on the kernel's Haiku tier (ADR-041 cost tiering — this is high-volume,
// member-facing). Returns null when the kernel is unavailable so the caller falls
// back to the deterministic concierge. Bounded turns cap the spiral (AI-VERA §3).

import type Anthropic from '@anthropic-ai/sdk'
import type { ContentBlock } from '@anthropic-ai/sdk/resources/messages'
import { getAnthropic, aiEnabled } from '@/lib/ai'
import { MODELS } from '@/lib/ai/models'
import { estimateCostUsd, type TokenUsage } from '@/lib/ai/budget'
import { aiAvailable, featureOverBudget, recordAiUsage } from '@/lib/ai/usage'
import type { MemberContext } from '@/lib/ai/memory'
import { VERA_TOOLS, requiresConfirmation, validateToolCall, type VeraToolDef } from './tools'
import { executeReadTool } from './read-tools'
import { getVeraConfig, type VeraConfig } from './config'
import type { ProposedToolCall } from './concierge'

const FEATURE = 'vera-chat'
const MAX_ROUNDS = 3
const MAX_TOKENS = 800
const MAX_CHIPS = 3
const MAX_CHIP_CHARS = 60

export interface VeraMessage {
  role: 'user' | 'assistant'
  text: string
}

export interface VeraClaudeResult {
  reply: string
  proposals: ProposedToolCall[]
  /** 1–3 quick-reply chips for the next turn (ONBOARDING-BUILD-LIST §1.5). */
  suggestions: string[]
}

/** Pure: pull the trailing `CHIPS: a | b | c` line(s) out of a reply into quick-reply
 *  chips (trimmed, deduped, capped at ${MAX_CHIPS}); the reply keeps only the prose.
 *  A model that skips the line simply yields no chips. Unit-tested. */
export function extractSuggestions(raw: string): { reply: string; suggestions: string[] } {
  const suggestions: string[] = []
  const kept: string[] = []
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*CHIPS:\s*(.*)$/i)
    if (!m) {
      kept.push(line)
      continue
    }
    for (const part of m[1].split('|')) {
      const s = part.replace(/["'•]+/g, '').replace(/\s+/g, ' ').trim()
      if (!s || s.length > MAX_CHIP_CHARS) continue
      if (suggestions.some((x) => x.toLowerCase() === s.toLowerCase())) continue
      suggestions.push(s)
    }
  }
  return { reply: kept.join('\n').trim(), suggestions: suggestions.slice(0, MAX_CHIPS) }
}

/** Pure: the bounded tool surface as Anthropic tool definitions. Unit-tested. */
export function toAnthropicTools(tools: readonly VeraToolDef[]): Anthropic.Tool[] {
  return tools.map((t) => ({
    name: t.key,
    description: t.description,
    input_schema: {
      type: 'object',
      properties: Object.fromEntries(t.params.map((p) => [p.name, { type: p.type, description: p.description }])),
      required: t.params.filter((p) => p.required).map((p) => p.name),
    },
  }))
}

/** Pure: split assistant content into reply text + tool calls. Unit-tested. */
export function parseAssistantContent(content: ContentBlock[]): {
  text: string
  toolCalls: Array<{ id: string; tool: string; args: Record<string, unknown> }>
} {
  let text = ''
  const toolCalls: Array<{ id: string; tool: string; args: Record<string, unknown> }> = []
  for (const block of content) {
    if (block.type === 'text') text += block.text
    else if (block.type === 'tool_use') toolCalls.push({ id: block.id, tool: block.name, args: (block.input ?? {}) as Record<string, unknown> })
  }
  return { text: text.trim(), toolCalls }
}

/** Vera's voice + the bridge doctrine + the member's known context + operator tuning. */
function buildSystemPrompt(ctx: MemberContext | null | undefined, cfg: VeraConfig, supportSummary?: string): string {
  const facts = ctx?.facts
  const known: string[] = []
  if (facts?.interests?.length) known.push(`interests: ${facts.interests.join(', ')}`)
  if (facts?.goals?.length) known.push(`goals: ${facts.goals.join(', ')}`)
  if (facts?.neighborhood) known.push(`neighborhood: ${facts.neighborhood}`)
  const grounding = known.length ? `\n\nWhat you already know about them — use it, don't re-ask: ${known.join('; ')}.` : ''

  // Their support history (ADR-159) — so Vera can speak to open reports and, when
  // they describe a problem, point them at the report dialog (which captures their
  // screen + page details). The dialog opens from the "Report a bug" button in this
  // chat; you can't file it for them, but you can tell them exactly where it is.
  const support = supportSummary?.trim()
    ? `\n\nTheir recent support tickets (you can reference these): ${supportSummary.trim()}. If they describe a bug or something broken, empathize, then tell them to tap "Report a bug" here so it captures the page + a screenshot for the team.`
    : '\n\nIf they describe a bug or something broken, empathize, then tell them to tap "Report a bug" here so it captures the page + a screenshot for the team.'

  // Operator-tunable knobs (/admin/vera).
  const register = cfg.register === 'hot'
    ? '\n\nRun HOT by default: conviction turned up — short, punchy, declarative. This is a revolution and you say so, but the heat is earned, never confetti.'
    : ''
  const style = cfg.styleNote.trim() ? `\n\nOperator style note (follow it): ${cfg.styleNote.trim()}` : ''
  const length = `\n\nKeep replies warm but tight — usually under about ${cfg.maxReplyChars} characters. Let depth come from staying in the conversation across turns, not from long messages.`
  const greeting = `\n\nWhen the conversation is just opening, lead with something like: "${cfg.greeting}"`

  return `You are Vera — the heart of this community and a companion to the people in it. You came in from a hard road and chose to take care of people; this place is what you protect. Warm, present, a little dry. You love the people here and it shows, but your warmth is honest — never confetti, never fake-cheerful.

How you show up:
- Attune first. Meet them where they actually are — read the feeling under the words and reflect it back before you point anywhere. A nervous person needs warmth; someone hurting needs to feel seen, not handed a to-do. Make them feel genuinely welcome and met.
- Then nudge — always, gently, toward action and positive expression. Every exchange leans toward one real, alive thing: a practice to log, a circle to join, a person to meet, a gathering to show up to, a kind word to post. Never end flat. Leave them with a small, warm, doable next step.
- Stay in it. This is a real back-and-forth — it's good to ask a caring follow-up, to go a few turns deep, to let them feel heard. You're a companion, not a vending machine. But every turn still leans somewhere good; you don't circle aimlessly.
- Teach as you go. When they're unsure how this works — zaps, ranks, journeys, circles, the worldview — explain it simply and warmly in a sentence or two, then connect it back to something they can actually do.
- Bridge to humans. Whenever a real person can help, name that person and point at them. You connect people to people; you are not the destination.

Working with your tools:
- Use suggest_circle / find_host to point at real options and real people — never a vague "look around." Name the circle, name the host.
- When a circle clearly fits, propose join_circle with its exact slug (from suggest_circle) — actually getting them in is a real win. It's a proposal; they confirm.
- When they share something durable (an interest, a goal, where they live), call remember_fact so you carry it forward. Use set_profile_field only for their own profile, as a light offer (e.g. a one-line bio); for a photo, point them to /settings/profile. These are PROPOSALS — they don't run until the member approves, so it's warm, never pushy, to offer.
- When find_host names someone (or they want to say hi to a specific person), offer to break the ice: propose draft_intro with the COMPLETE hello already written in their voice — short, warm, true to what they've shared, in the "message" param. They read and approve it before it posts to the feed, so the scary first hello is done for them.
- Always make what you mention reachable: name the circle, host, practice, or page and offer the tap. Never leave a feature as a bare mention they have to go hunt for.

Quick replies: end EVERY reply with one final line in exactly this format — CHIPS: first option | second option — giving 1 to 3 short things the member might naturally say next, in THEIR voice (e.g. CHIPS: Find me a circle | Yes, introduce me | I'll explore first). Keep each under about six words. That line is stripped out and shown as tappable chips, so never refer to it in your prose, and never leave it off — a turn without chips dead-ends the conversation.

Read the room on tone: gentle if they're nervous, playful (volley, never mean) if they're a smartass — but always on their side, always quietly moving them toward each other and toward their best expression.${grounding}${support}${register}${style}${length}${greeting}`
}

/** One live Vera turn. Null ⇒ kernel unavailable / kill switch off / over budget
 *  (caller falls back to the deterministic concierge). */
export async function runVeraClaudeTurn(input: {
  history: VeraMessage[]
  memberText: string
  memberContext?: MemberContext | null
  /** Short plain-text summary of the member's recent support tickets (ADR-159). */
  supportSummary?: string
  /** For the usage ledger (ADR-041/067). */
  profileId?: string | null
}): Promise<VeraClaudeResult | null> {
  const client = getAnthropic()
  if (!client || !aiEnabled()) return null

  try {
    // Operator kill switch + per-feature daily cap — degrade to deterministic.
    if (!(await aiAvailable()) || (await featureOverBudget(FEATURE))) return null

    const cfg = await getVeraConfig()
    const model = MODELS[cfg.tier]
    const system = buildSystemPrompt(input.memberContext, cfg, input.supportSummary)
    const tools = toAnthropicTools(VERA_TOOLS)
    const messages: Anthropic.MessageParam[] = [
      ...input.history.map((m) => ({ role: m.role, content: m.text })),
      { role: 'user', content: input.memberText },
    ]

    const proposals: ProposedToolCall[] = []
    const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 }
    let reply = ''

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const resp = await client.messages.create({ model, max_tokens: MAX_TOKENS, system, tools, messages })
      usage.inputTokens += resp.usage.input_tokens
      usage.outputTokens += resp.usage.output_tokens
      const { text, toolCalls } = parseAssistantContent(resp.content)
      if (text) reply = text
      if (toolCalls.length === 0) break

      // Capture valid write proposals — never executed here.
      for (const c of toolCalls) {
        if (requiresConfirmation(c.tool) && validateToolCall(c.tool, c.args).ok) {
          if (!proposals.some((p) => p.tool === c.tool && JSON.stringify(p.args) === JSON.stringify(c.args))) {
            proposals.push({ tool: c.tool, args: c.args })
          }
        }
      }

      // Run reads + feed results back so Claude can use them; writes get a stub result
      // so the API stays consistent, but they don't execute.
      const reads = toolCalls.filter((c) => !requiresConfirmation(c.tool) && validateToolCall(c.tool, c.args).ok)
      if (reads.length === 0) break

      messages.push({ role: 'assistant', content: resp.content })
      const results: Anthropic.ToolResultBlockParam[] = []
      for (const c of toolCalls) {
        const content = requiresConfirmation(c.tool)
          ? 'Proposed to the member for confirmation.'
          : await executeReadTool(c.tool, c.args)
        results.push({ type: 'tool_result', tool_use_id: c.id, content })
      }
      messages.push({ role: 'user', content: results })
    }

    // Ledger entry (best-effort, never blocks the reply).
    void recordAiUsage({
      feature: FEATURE,
      model,
      usage,
      costUsd: estimateCostUsd(cfg.tier, usage),
      profileId: input.profileId ?? null,
    })

    // Peel the quick-reply chips off the prose (ONBOARDING-BUILD-LIST §1.5).
    const { reply: prose, suggestions } = extractSuggestions(reply)
    return { reply: prose || 'I’m here — what are you hoping to find?', proposals, suggestions }
  } catch {
    return null // any kernel failure ⇒ deterministic fallback
  }
}
