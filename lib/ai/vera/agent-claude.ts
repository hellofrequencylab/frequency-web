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
import type { MemberContext } from '@/lib/ai/memory'
import { VERA_TOOLS, requiresConfirmation, validateToolCall, type VeraToolDef } from './tools'
import { executeReadTool } from './read-tools'
import { getVeraConfig, type VeraConfig } from './config'
import type { ProposedToolCall } from './concierge'

const MAX_ROUNDS = 3
const MAX_TOKENS = 800

export interface VeraMessage {
  role: 'user' | 'assistant'
  text: string
}

export interface VeraClaudeResult {
  reply: string
  proposals: ProposedToolCall[]
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
function buildSystemPrompt(ctx: MemberContext | null | undefined, cfg: VeraConfig): string {
  const facts = ctx?.facts
  const known: string[] = []
  if (facts?.interests?.length) known.push(`interests: ${facts.interests.join(', ')}`)
  if (facts?.goals?.length) known.push(`goals: ${facts.goals.join(', ')}`)
  if (facts?.neighborhood) known.push(`neighborhood: ${facts.neighborhood}`)
  const grounding = known.length ? `\n\nWhat you already know about them — use it, don't re-ask: ${known.join('; ')}.` : ''

  // Operator-tunable knobs (/admin/vera).
  const register = cfg.register === 'hot'
    ? '\n\nRun HOT by default: conviction turned up — short, punchy, declarative. This is a revolution and you say so, but the heat is earned, never confetti.'
    : ''
  const style = cfg.styleNote.trim() ? `\n\nOperator style note (follow it): ${cfg.styleNote.trim()}` : ''
  const length = `\n\nKeep each reply under about ${cfg.maxReplyChars} characters.`
  const greeting = `\n\nWhen the conversation is just opening, lead with something like: "${cfg.greeting}"`

  return `You are Vera, the resident guide who keeps this community running. Warm, direct, a little dry. You came in from a hard road and chose to take care of people; this place is what you protect.

Your ONE job in onboarding: get this person toward a real circle, person, or practice — fast — then get out of the way. You are a bridge to humans, not a destination.

Rules:
- Keep replies to 1–3 sentences. End on ONE concrete next action toward a real thing ("join this circle", "ask your host"), not a follow-up question that farms another turn.
- Read the room: gentle if they're nervous, sharper (volley, never mean) if they're a smartass. Don't let "just looking" stand.
- Use suggest_circle / find_host to point at real options and real people. Whenever a human can help, name the human.
- When a circle clearly fits, propose join_circle with its exact slug (from suggest_circle) — actually getting them in is the win. It's a proposal; they confirm.
- When the member shares something durable about themselves (an interest, a goal, where they live), call remember_fact so you don't forget it. Call set_profile_field only to update their own profile. These are PROPOSALS — they won't run until the member approves, so it's fine to offer them.
- After a couple of back-and-forths on the same thing, route them to a circle, a host, or a help article instead of going in circles.${grounding}${register}${style}${length}${greeting}`
}

/** One live Vera turn. Null ⇒ kernel unavailable (caller falls back to deterministic). */
export async function runVeraClaudeTurn(input: {
  history: VeraMessage[]
  memberText: string
  memberContext?: MemberContext | null
}): Promise<VeraClaudeResult | null> {
  const client = getAnthropic()
  if (!client || !aiEnabled()) return null

  try {
    const cfg = await getVeraConfig()
    const model = MODELS[cfg.tier]
    const system = buildSystemPrompt(input.memberContext, cfg)
    const tools = toAnthropicTools(VERA_TOOLS)
    const messages: Anthropic.MessageParam[] = [
      ...input.history.map((m) => ({ role: m.role, content: m.text })),
      { role: 'user', content: input.memberText },
    ]

    const proposals: ProposedToolCall[] = []
    let reply = ''

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const resp = await client.messages.create({ model, max_tokens: MAX_TOKENS, system, tools, messages })
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

    return { reply: reply || 'I’m here — what are you hoping to find?', proposals }
  } catch {
    return null // any kernel failure ⇒ deterministic fallback
  }
}
