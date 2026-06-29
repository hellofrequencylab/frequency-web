// The AI operator (Phase 6.6, ADR-028). The proposer surfaces lapsed members as
// proposed winback emails into the Action Queue: a live Claude operator drafts the
// copy when `ANTHROPIC_API_KEY` is set, falling back to a deterministic template
// otherwise. A human approves; on approval the action runs THROUGH the spine
// (consent + suppression + unsubscribe). The agent can only ever act via these
// bounded, copilot-gated actions — the model drafts, it never sends. Server-only.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { enqueueEmail, listUnsubscribeHeaders } from '@/lib/email'
import { resolveSendGate } from '@/lib/comms/send-gate'
import { buildUnsubscribeUrl } from '@/lib/unsubscribe-tokens'
import { SITE_URL } from '@/lib/site'
import {
  LAPSE_DAYS,
  deterministicWinback,
  draftWinbackWithClaude,
  filterByConsent,
  type WinbackCandidate,
} from '@/lib/studio/winback'

const DAY = 24 * 60 * 60 * 1000

function db(): SupabaseClient {
  return createAdminClient()
}

export interface AgentActionRow {
  id: string
  kind: string
  payload: Record<string, unknown>
  rationale: string | null
  status: string
  createdAt: string | null
}

export async function listActions(status = 'proposed'): Promise<AgentActionRow[]> {
  const { data } = await db()
    .from('agent_actions')
    .select('id, kind, payload, rationale, status, created_at')
    .eq('status', status)
    .order('created_at', { ascending: false })
    .limit(100)
  return (data ?? []).map((a) => ({
    id: a.id,
    kind: a.kind,
    payload: (a.payload ?? {}) as Record<string, unknown>,
    rationale: a.rationale ?? null,
    status: a.status,
    createdAt: a.created_at ?? null,
  }))
}

/**
 * Propose winback emails for members with no verified practice in the last
 * LAPSE_DAYS. The copy is drafted by the live Claude operator when an API key is
 * configured, else a deterministic template. Gated up front by lifecycle-email
 * consent (`shouldSend`), so we never queue a proposal for someone who has opted
 * out — and skips members who already have a pending winback. Returns how many
 * proposals were created. (Copilot-gated: these are *proposed*, not sent.)
 */
export async function proposeWinbacks(limit = 20): Promise<number> {
  const client = db()
  const since = new Date(Date.now() - LAPSE_DAYS * DAY).toISOString()

  const { data: recent } = await client
    .from('engagement_events')
    .select('actor_profile_id')
    .eq('event_type', 'practice.verified')
    .gte('created_at', since)
  const active = new Set((recent ?? []).map((r) => r.actor_profile_id).filter(Boolean))

  const { data: members } = await client
    .from('contacts')
    .select('email, profile_id, display_name')
    .not('profile_id', 'is', null)
    .neq('consent_state', 'unsubscribed')
    .limit(500)

  // One pre-pass for every pending email_contact proposal, so we don't query per member
  // (site-audit PERF-1: this was an N+1 dupe check inside the loop). Build a Set of the
  // already-proposed profile ids and test membership in memory.
  const { data: pending } = await client
    .from('agent_actions')
    .select('payload')
    .eq('kind', 'email_contact')
    .eq('status', 'proposed')
  const alreadyProposed = new Set(
    ((pending ?? [])
      .map((r) => (r.payload as { profileId?: string } | null)?.profileId)
      .filter(Boolean)) as string[],
  )

  // Lapsed members with an email and no pending proposal → candidates.
  const candidates: WinbackCandidate[] = []
  for (const m of members ?? []) {
    if (!m.profile_id || !m.email || active.has(m.profile_id)) continue
    if (alreadyProposed.has(m.profile_id as string)) continue

    candidates.push({
      profileId: m.profile_id as string,
      email: m.email as string,
      displayName: (m.display_name as string | null) ?? null,
    })
  }

  // Consent gate at proposal time: only members opted in to lifecycle email.
  const eligible = await filterByConsent(candidates, async (id) => {
    const gate = await resolveSendGate(id, 'email', 'lifecycle')
    return gate.allowed
  })

  let created = 0
  for (const c of eligible) {
    if (created >= limit) break
    const name = c.displayName || 'there'
    const draft = (await draftWinbackWithClaude(name)) ?? deterministicWinback(name)
    await client.from('agent_actions').insert({
      kind: 'email_contact',
      payload: { profileId: c.profileId, email: c.email, subject: draft.subject, body: draft.body },
      rationale: `No verified practice in the last ${LAPSE_DAYS} days (lapsed member).`,
      status: 'proposed',
    })
    created++
  }
  return created
}

/** Execute an APPROVED action through the spine. Returns ok/error. */
export async function executeAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const client = db()
  const { data: action } = await client
    .from('agent_actions')
    .select('kind, payload, status')
    .eq('id', id)
    .maybeSingle()
  if (!action) return { ok: false, error: 'Action not found.' }
  if (action.status !== 'approved') return { ok: false, error: 'Action is not approved.' }

  // Content drafts are NEVER auto-published — approval just marks them ready for a
  // human to post (human-approves-anything-public; MARKETING-AI guardrail).
  if (action.kind === 'content_draft') {
    await client.from('agent_actions').update({ status: 'executed' }).eq('id', id)
    return { ok: true }
  }

  if (action.kind === 'email_contact') {
    const p = (action.payload ?? {}) as { profileId?: string; email?: string; subject?: string; body?: string }
    const gate = p.profileId ? await resolveSendGate(p.profileId, 'email', 'lifecycle') : null
    if (p.profileId && p.email && gate?.allowed) {
      const unsubscribeUrl = buildUnsubscribeUrl({ baseUrl: SITE_URL, profileId: p.profileId, category: 'lifecycle' })
      const safe = (p.body || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br/>')
      await enqueueEmail({
        to: p.email,
        subject: p.subject || 'A note from Frequency',
        html: `<div style="max-width:560px;margin:0 auto;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;padding:24px;"><p style="font-size:15px;color:#333;line-height:1.6;">${safe}</p><hr style="border:none;border-top:1px solid #eee;margin:24px 0;"/><p style="font-size:12px;color:#999;">You're receiving this as a Frequency member. <a href="${unsubscribeUrl}" style="color:#999;">Unsubscribe</a>.</p></div>`,
        text: `${p.body || ''}\n\nUnsubscribe: ${unsubscribeUrl}`,
        headers: listUnsubscribeHeaders(unsubscribeUrl),
      })
    }
  }

  await client.from('agent_actions').update({ status: 'executed' }).eq('id', id)
  return { ok: true }
}
