'use server'

import { createClient } from '@/lib/supabase/server'
import { aiEnabled } from '@/lib/ai'
import { getMemberContext } from '@/lib/ai/memory'
import { runVeraTurn } from '@/lib/ai/vera/loop'
import { runVeraClaudeTurn, type VeraMessage } from '@/lib/ai/vera/agent-claude'
import { executeConfirmedTool } from '@/lib/ai/vera/execute'
import type { ConciergeStage, ProposedToolCall } from '@/lib/ai/vera/concierge'

async function callerProfileId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('profiles').select('id').eq('auth_user_id', user.id).maybeSingle()
  return data?.id ?? null
}

export interface ConciergeTurnResult {
  message: string
  /** 'chat' once the live loop is driving (the deterministic stages no longer apply). */
  stage: ConciergeStage | 'chat'
  proposals: ProposedToolCall[]
  suggestions: string[]
  done: boolean
}

/** One concierge turn. Live Claude when the kernel is on (grounded in memory, with
 *  the bounded tools); the deterministic concierge otherwise. Either way, write
 *  proposals are returned, never executed. */
export async function conciergeTurn(stage: string, memberText: string, history: VeraMessage[] = []): Promise<ConciergeTurnResult> {
  if (aiEnabled()) {
    const profileId = await callerProfileId()
    const memberContext = profileId ? await getMemberContext(profileId) : null
    const live = await runVeraClaudeTurn({ history, memberText, memberContext })
    if (live) return { message: live.reply, stage: 'chat', proposals: live.proposals, suggestions: [], done: false }
  }

  // Deterministic fallback (also the path when AI is off / over budget).
  const turn = await runVeraTurn({ stage: stage === 'chat' ? 'done' : (stage as ConciergeStage), memberText })
  return { message: turn.message, stage: turn.stage, proposals: turn.proposals, suggestions: turn.suggestions, done: turn.done }
}

/** The member confirmed a proposed write — execute it (consent-gated). */
export async function confirmProposal(tool: string, argsJson: string): Promise<{ ok: boolean; error?: string }> {
  const profileId = await callerProfileId()
  if (!profileId) return { ok: false, error: 'Not signed in.' }
  let args: Record<string, unknown>
  try {
    args = JSON.parse(argsJson) as Record<string, unknown>
  } catch {
    return { ok: false, error: 'Bad arguments.' }
  }
  return executeConfirmedTool(profileId, tool, args)
}
