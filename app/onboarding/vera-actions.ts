'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { aiEnabled } from '@/lib/ai'
import { isStaff, type WebRole } from '@/lib/core/roles'
import { getMemberContext } from '@/lib/ai/memory'
import { supportSummaryForVera } from '@/lib/support/store'
import { runVeraTurn } from '@/lib/ai/vera/loop'
import { runVeraClaudeTurn, type VeraMessage } from '@/lib/ai/vera/agent-claude'
import { executeConfirmedTool } from '@/lib/ai/vera/execute'
import { createAdminClient } from '@/lib/supabase/admin'
import { joinCircle } from '@/app/(main)/circles/actions'
import type { EntitlementTier } from '@/lib/core/entitlement'
import type { ConciergeStage, ProposedToolCall } from '@/lib/ai/vera/concierge'

async function callerProfileId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('profiles').select('id').eq('auth_user_id', user.id).maybeSingle()
  return data?.id ?? null
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
    const ident = await callerIdentity()
    const profileId = ident?.id ?? null
    const [memberContext, supportSummary] = profileId
      ? await Promise.all([getMemberContext(profileId), supportSummaryForVera(profileId).catch(() => '')])
      : [null, '']
    const viewer = ident
      ? { isOperator: isStaff(ident.webRole), roleLabel: isStaff(ident.webRole) ? ident.webRole : ident.communityRole }
      : null
    const live = await runVeraClaudeTurn({ history, memberText, memberContext, supportSummary, profileId, tier: ident?.tier ?? null, viewer })
    if (live) return { message: live.reply, stage: 'chat', proposals: live.proposals, suggestions: live.suggestions, done: false }
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

  // join_circle is an app-level action (capacity checks + rewards + redirect), so it's
  // handled here rather than in the lib executor.
  if (tool === 'join_circle') return joinCircleForMember(String(args.circle ?? ''))

  const result = await executeConfirmedTool(profileId, tool, args)
  // A confirmed intro lands as a real feed post — show it on the next feed paint.
  if (tool === 'draft_intro' && result.ok) revalidatePath('/feed')
  return result
}

/** Resolve a circle (by slug, then name) and join the member via the canonical
 *  joinCircle — which enforces capacity, awards, and redirects to the circle on success. */
async function joinCircleForMember(ref: string): Promise<{ ok: boolean; error?: string }> {
  const term = ref.trim()
  if (!term) return { ok: false, error: 'No circle specified.' }
  const admin = createAdminClient()
  const bySlug = await admin.from('circles').select('id, slug').eq('slug', term).eq('is_demo', false).maybeSingle()
  let circle = bySlug.data
  if (!circle) {
    const byName = await admin.from('circles').select('id, slug').ilike('name', `%${term}%`).eq('is_demo', false).limit(1)
    circle = (byName.data ?? [])[0] ?? null
  }
  if (!circle) return { ok: false, error: `Couldn't find a circle matching "${term}".` }
  await joinCircle(circle.id, circle.slug) // redirects to /circles/<slug> on success
  return { ok: true }
}
