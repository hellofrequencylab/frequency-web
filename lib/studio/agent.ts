// The AI operator (Phase 6.6, ADR-028). MVP uses a DETERMINISTIC proposer (a
// stand-in for a live Claude operator): it surfaces lapsed members as proposed
// winback emails into the Action Queue. A human approves; on approval the action
// runs THROUGH the spine (consent + suppression + unsubscribe). The agent can only
// ever act via these bounded actions. Server-only; untyped client view for now.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { enqueueEmail, listUnsubscribeHeaders } from '@/lib/email'
import { shouldSend } from '@/lib/notification-preferences'
import { buildUnsubscribeUrl } from '@/lib/unsubscribe-tokens'
import { SITE_URL } from '@/lib/site'

const DAY = 24 * 60 * 60 * 1000
const LAPSE_DAYS = 14

function db(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient
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
 * Deterministic proposer (LLM stand-in): propose a winback email for members with
 * no verified practice in the last LAPSE_DAYS. Skips contacts that already have a
 * pending winback proposal. Returns how many proposals were created.
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

  let created = 0
  for (const m of members ?? []) {
    if (created >= limit) break
    if (!m.profile_id || !m.email || active.has(m.profile_id)) continue

    const { data: dupe } = await client
      .from('agent_actions')
      .select('id')
      .eq('kind', 'email_contact')
      .eq('status', 'proposed')
      .contains('payload', { profileId: m.profile_id })
      .limit(1)
    if (dupe && dupe.length > 0) continue

    const name = (m.display_name as string) || 'there'
    await client.from('agent_actions').insert({
      kind: 'email_contact',
      payload: {
        profileId: m.profile_id,
        email: m.email,
        subject: 'We miss you at Frequency',
        body: `Hi ${name}, it's been a couple of weeks since your last practice. A short session today is all it takes to pick your streak back up. We'd love to see you.`,
      },
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

  if (action.kind === 'email_contact') {
    const p = (action.payload ?? {}) as { profileId?: string; email?: string; subject?: string; body?: string }
    if (p.profileId && p.email && (await shouldSend(p.profileId, 'email', 'lifecycle'))) {
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
