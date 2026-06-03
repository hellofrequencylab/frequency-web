'use server'

import { createClient } from '@/lib/supabase/server'
import { runVeraTurn } from '@/lib/ai/vera/loop'
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
  stage: ConciergeStage
  proposals: ProposedToolCall[]
  suggestions: string[]
  done: boolean
}

/** One concierge turn. Pure-ish: produces the reply + proposed writes (never executed). */
export async function conciergeTurn(stage: ConciergeStage, memberText: string): Promise<ConciergeTurnResult> {
  const turn = await runVeraTurn({ stage, memberText })
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
