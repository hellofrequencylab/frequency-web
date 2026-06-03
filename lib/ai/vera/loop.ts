// Vera's turn loop (ADR-066 Phase D). Orchestrates one conversational turn: produce a
// reply + any proposed tool calls, classified into auto-run reads vs confirm-required
// writes against the bounded surface (ADR-028). Writes NEVER auto-execute here — the
// member confirms, then lib/ai/vera/execute runs them (consent-gated).
//
// AI seam: when the kernel is live (ANTHROPIC_API_KEY + ai_enabled), a Claude tool-use
// loop grounded in memory + the bounded tools would drive the reply. Until then —
// and as the permanent fallback — the deterministic concierge drives it.

import { aiEnabled } from '@/lib/ai'
import { conciergeReply, type ConciergeReply, type ConciergeStage, type ProposedToolCall } from './concierge'
import { requiresConfirmation, validateToolCall } from './tools'
import type { MemberContext } from '@/lib/ai/memory'

export interface VeraTurnInput {
  stage: ConciergeStage
  memberText: string
  memberContext?: MemberContext | null
}

export interface VeraTurn extends ConciergeReply {
  source: 'deterministic' | 'ai'
}

/** Split proposed tool calls into auto-runnable reads and confirm-required writes;
 *  drop any that don't validate against the bounded surface. Pure + unit-tested. */
export function classifyProposals(calls: ProposedToolCall[]): {
  reads: ProposedToolCall[]
  writes: ProposedToolCall[]
} {
  const reads: ProposedToolCall[] = []
  const writes: ProposedToolCall[] = []
  for (const c of calls) {
    if (!validateToolCall(c.tool, c.args).ok) continue
    if (requiresConfirmation(c.tool)) writes.push(c)
    else reads.push(c)
  }
  return { reads, writes }
}

/** Run one Vera turn. Deterministic today; the AI path slots in behind this same
 *  signature without changing callers. Write proposals are returned, never executed. */
export async function runVeraTurn(input: VeraTurnInput): Promise<VeraTurn> {
  const reply = conciergeReply(input.stage, input.memberText)
  // Only surface valid write proposals (reads, if any, would be run + folded in here).
  const { writes } = classifyProposals(reply.proposals)
  return { ...reply, proposals: writes, source: aiEnabled() ? 'ai' : 'deterministic' }
}
