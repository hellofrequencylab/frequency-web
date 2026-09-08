import 'server-only'

// One concierge turn, shared by the two doors that run it (ADR-1287, PROG-E8):
//   • app/onboarding/vera-actions.ts `conciergeTurn` — the server action, whole reply at once.
//   • app/api/vera/turn/route.ts — the streaming door, the same turn with `onText` wired to an
//     NDJSON response so the member watches Vera's reply arrive.
// Both doors resolve the same identity, the same memory and support context, and fall back to
// the same deterministic concierge, because a member must get an answer whether or not the
// kernel is on (AI-VERA §4). Write proposals are RETURNED, never executed here (ADR-028).
//
// Deliberately PUBLIC: the concierge serves signed-out visitors. `callerIdentity` is optional
// personalization (null for anonymous, and the turn proceeds either way), not a gate.

import { createClient } from '@/lib/supabase/server'
import { aiEnabled } from '@/lib/ai'
import { isStaff, type WebRole } from '@/lib/core/roles'
import { getMemberContext } from '@/lib/ai/memory'
import { supportSummaryForVera } from '@/lib/support/store'
import { runVeraTurn } from './loop'
import { runVeraClaudeTurn, type VeraMessage } from './agent-claude'
import type { EntitlementTier } from '@/lib/core/entitlement'
import type { ConciergeStage, ProposedToolCall } from './concierge'

export interface ConciergeTurnResult {
  message: string
  /** 'chat' once the live loop is driving (the deterministic stages no longer apply). */
  stage: ConciergeStage | 'chat'
  proposals: ProposedToolCall[]
  suggestions: string[]
  done: boolean
}

/** The caller's id + both role axes (ADR-208), so Vera can answer to the depth their
 *  permissions allow — operator-to-operator for staff, companion scope for members. */
async function callerIdentity(): Promise<{ id: string; communityRole: string; webRole: WebRole; tier: EntitlementTier } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('profiles')
    .select('id, community_role, web_role, membership_tier')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!data?.id) return null
  return {
    id: data.id,
    communityRole: (data.community_role as string) ?? 'member',
    webRole: ((data.web_role as WebRole | null) ?? 'none'),
    // The billing tier feeds the vera_unlimited daily-cap gate (ADR-370). INERT while billing is OFF.
    tier: ((data.membership_tier as EntitlementTier | null) ?? 'free'),
  }
}

/** Run one concierge turn. Live loop when the kernel is on (grounded in memory, with the bounded
 *  tools, streamed through `onText` when given); the deterministic concierge otherwise. */
export async function runConciergeTurn(
  stage: string,
  memberText: string,
  history: VeraMessage[] = [],
  opts: { onText?: (delta: string, round: number) => void } = {},
): Promise<ConciergeTurnResult> {
  if (aiEnabled()) {
    const ident = await callerIdentity()
    const profileId = ident?.id ?? null
    const [memberContext, supportSummary] = profileId
      ? await Promise.all([getMemberContext(profileId), supportSummaryForVera(profileId).catch(() => '')])
      : [null, '']
    const viewer = ident
      ? { isOperator: isStaff(ident.webRole), roleLabel: isStaff(ident.webRole) ? ident.webRole : ident.communityRole }
      : null
    const live = await runVeraClaudeTurn({
      history,
      memberText,
      memberContext,
      supportSummary,
      profileId,
      tier: ident?.tier ?? null,
      viewer,
      onText: opts.onText,
    })
    if (live) return { message: live.reply, stage: 'chat', proposals: live.proposals, suggestions: live.suggestions, done: false }
  }

  // Deterministic fallback (also the path when AI is off / over budget).
  const turn = await runVeraTurn({ stage: stage === 'chat' ? 'done' : (stage as ConciergeStage), memberText })
  return { message: turn.message, stage: turn.stage, proposals: turn.proposals, suggestions: turn.suggestions, done: turn.done }
}
