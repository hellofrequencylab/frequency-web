// Confirmed tool execution (ADR-066 Phase D, ADR-028). Runs a tool ONLY after the
// member has confirmed it. Writes additionally gate on consent (the #147 harness) —
// so there are no autonomous writes, and no writes at all without `ai_memory` consent.
// Server-only.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { validateToolCall, requiresConfirmation } from './tools'
import { hasConsent } from '@/lib/consent/consent'
import { rememberFacts, type MemberFacts } from '@/lib/ai/memory'

/** Profile fields Vera may set (the member's own, low-risk). */
const SETTABLE_FIELDS = new Set(['display_name', 'bio'])

function factField(category: unknown): keyof MemberFacts {
  const c = String(category ?? '')
  return c === 'interests' || c === 'constraints' ? c : 'goals'
}

/** Execute a member-CONFIRMED tool call. Validates against the bounded surface, then
 *  consent-gates writes, then performs the (small, reversible) mutation. */
export async function executeConfirmedTool(
  profileId: string,
  tool: string,
  args: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const v = validateToolCall(tool, args)
  if (!v.ok) return { ok: false, error: v.errors.join(' ') }

  if (requiresConfirmation(tool) && !(await hasConsent(profileId, 'ai_memory'))) {
    return { ok: false, error: 'Vera-memory consent is off — nothing was saved.' }
  }

  switch (tool) {
    case 'remember_fact': {
      const field = factField(args.category)
      await rememberFacts(profileId, { [field]: [String(args.fact)] } as Partial<MemberFacts>)
      return { ok: true }
    }
    case 'set_profile_field': {
      const field = String(args.field)
      if (!SETTABLE_FIELDS.has(field)) return { ok: false, error: `"${field}" can't be set here.` }
      const db = createAdminClient() as unknown as SupabaseClient
      await db.from('profiles').update({ [field]: String(args.value) }).eq('id', profileId)
      return { ok: true }
    }
    case 'draft_intro':
    case 'suggest_circle':
    case 'find_host':
      // Reads/drafts: nothing to persist (the draft text is returned to the member).
      return { ok: true }
    default:
      return { ok: false, error: 'Unknown tool.' }
  }
}
