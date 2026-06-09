// Confirmed tool execution (ADR-066 Phase D, ADR-028). Runs a tool ONLY after the
// member has confirmed it. Writes additionally gate on consent (the #147 harness) —
// so there are no autonomous writes, and no writes at all without `ai_memory` consent.
// Server-only.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { validateToolCall } from './tools'
import { hasConsent } from '@/lib/consent/consent'
import { rememberFacts, type MemberFacts } from '@/lib/ai/memory'
import { processGamificationEvent, recordStreakActivity } from '@/lib/achievements'
import { awardGems } from '@/lib/gems'

/** Profile fields Vera may set (the member's own, low-risk). */
const SETTABLE_FIELDS = new Set(['display_name', 'bio'])

function factField(category: unknown): keyof MemberFacts {
  const c = String(category ?? '')
  return c === 'interests' || c === 'constraints' ? c : 'goals'
}

/** Tools that write to the member's record/memory — these gate on ai_memory consent.
 *  Direct member-confirmed actions (e.g. join_circle, handled in the app action) don't. */
const MEMORY_TOOLS = new Set(['remember_fact', 'set_profile_field'])

/** Execute a member-CONFIRMED tool call. Validates against the bounded surface, then
 *  consent-gates memory writes, then performs the (small, reversible) mutation. */
export async function executeConfirmedTool(
  profileId: string,
  tool: string,
  args: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const v = validateToolCall(tool, args)
  if (!v.ok) return { ok: false, error: v.errors.join(' ') }

  if (MEMORY_TOOLS.has(tool) && !(await hasConsent(profileId, 'ai_memory'))) {
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
      // The member approved the drafted hello — post it (the "intro-post path",
      // ONBOARDING-BUILD-LIST §2.2). A direct member-confirmed action like
      // join_circle, so no ai_memory gate.
      return postIntro(profileId, args)
    case 'suggest_circle':
    case 'find_host':
      // Reads: nothing to persist.
      return { ok: true }
    default:
      return { ok: false, error: 'Unknown tool.' }
  }
}

/** Post the member's CONFIRMED introduction to the public feed, mentioning the
 *  person it's for (mirrors the welcome-post / createPost path: same posts row,
 *  same mention notification, same post rewards). The member approved exactly
 *  this text — Vera drafted it, the human sends it (AI-VERA §6, ADR-028). */
async function postIntro(
  profileId: string,
  args: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  // Sanitize both member/model-controlled strings before they touch the DB.
  const handle = String(args.toHandle ?? '').trim().replace(/^@+/, '').toLowerCase()
  if (!/^[a-z0-9_]{1,30}$/.test(handle)) return { ok: false, error: 'That handle doesn’t look right.' }
  const message = String(args.message ?? '')
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '')
    .trim()
    .slice(0, 1000)
  if (!message) return { ok: false, error: 'There’s no introduction text to post.' }

  const admin = createAdminClient()
  const { data: target } = await admin
    .from('profiles')
    .select('id, handle')
    .eq('handle', handle)
    .maybeSingle()
  if (!target) return { ok: false, error: `Couldn't find anyone with the handle @${handle}.` }
  if (target.id === profileId) return { ok: false, error: 'That’s you — pick someone to be introduced to.' }

  // Make sure the hello actually reaches them: mention them if the draft didn't.
  const body = new RegExp(`@${handle}\\b`, 'i').test(message) ? message : `@${target.handle} ${message}`

  const { data: post, error } = await admin
    .from('posts')
    .insert({
      author_id: profileId,
      scope_id: profileId, // a member's public feed post is self-scoped (cf. feed page composer)
      visibility: 'public',
      post_type: 'feed',
      body,
    })
    .select('id')
    .single()
  if (error || !post) return { ok: false, error: 'The post didn’t go through — try again in a moment.' }

  // Mention bookkeeping + in-app notification (best-effort, mirrors fanOutMentions).
  try {
    await admin.from('post_mentions').insert({ post_id: post.id, profile_id: target.id })
  } catch {
    /* non-critical */
  }
  try {
    await admin.from('notifications').insert({
      recipient_id: target.id,
      actor_id: profileId,
      type: 'mention',
      reference_type: 'post',
      reference_id: post.id,
      body: 'mentioned you in an introduction',
    })
  } catch {
    /* non-critical */
  }

  // Same rewards as any other post (non-blocking) — an intro IS their first post
  // for the founder tasks / activation funnel.
  processGamificationEvent({ type: 'post_create', profileId }).catch(() => {})
  recordStreakActivity(profileId, 'posting').catch(() => {})
  awardGems(profileId, 'post_create').catch(() => {})

  return { ok: true }
}
