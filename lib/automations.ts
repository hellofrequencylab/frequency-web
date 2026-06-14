// Automations: a subscriber on the one event backbone (ADR-025). When an
// engagement event is recorded, recordEngagementEvent calls runAutomationsForEvent,
// which runs enabled rules whose trigger matches. MVP action: email the actor
// (consent-checked, queued, unsubscribe-stamped). Server-only; untyped client view
// until types regenerate. Must never throw into the event path.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { enqueueEmail, listUnsubscribeHeaders } from '@/lib/email'
import { resolveSendGate } from '@/lib/comms/send-gate'
import { enqueue } from '@/lib/queue/outbox'
import { buildUnsubscribeUrl } from '@/lib/unsubscribe-tokens'
import { SITE_URL } from '@/lib/site'

// Event types operators can trigger on (matches engagement_events.event_type +
// the gamification events that flow through the ledger).
export const AUTOMATION_TRIGGERS = [
  'practice.verified',
  'node_capture',
  'circle_join',
  'post_create',
  'event_attend',
] as const

// Actions a rule can fire. `email_actor` emails the event's actor (consent-checked,
// queued, unsubscribe-stamped). `push_actor` sends a web push to the actor (gated
// inside sendPushToProfile; fails dark without VAPID keys). action_type is a free-text
// column in the DB (no enum/CHECK), so adding a value needs no migration.
export const AUTOMATION_ACTION_TYPES = ['email_actor', 'push_actor'] as const
export type AutomationActionType = (typeof AUTOMATION_ACTION_TYPES)[number]

export function isAutomationActionType(value: unknown): value is AutomationActionType {
  return typeof value === 'string' && (AUTOMATION_ACTION_TYPES as readonly string[]).includes(value)
}

/** Shape of action_config for the push_actor action. `url` is an optional deep-link path. */
export interface PushActionConfig {
  title: string
  body: string
  url?: string
}

export interface AutomationRule {
  id: string
  name: string
  triggerEvent: string
  actionType: string
  actionConfig: Record<string, unknown>
  enabled: boolean
  createdAt: string | null
}

function db(): SupabaseClient {
  return createAdminClient()
}

export async function listRules(): Promise<AutomationRule[]> {
  const { data } = await db()
    .from('automation_rules')
    .select('id, name, trigger_event, action_type, action_config, enabled, created_at')
    .order('created_at', { ascending: false })
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    triggerEvent: r.trigger_event,
    actionType: r.action_type,
    actionConfig: (r.action_config ?? {}) as Record<string, unknown>,
    enabled: r.enabled,
    createdAt: r.created_at ?? null,
  }))
}

function actorEmailHtml(body: string, unsubscribeUrl: string): string {
  const safe = body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br/>')
  return `<div style="max-width:560px;margin:0 auto;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;padding:24px;"><p style="font-size:15px;color:#333;line-height:1.6;">${safe}</p><hr style="border:none;border-top:1px solid #eee;margin:24px 0;"/><p style="font-size:12px;color:#999;">You're receiving this as a Frequency member. <a href="${unsubscribeUrl}" style="color:#999;">Unsubscribe</a>.</p></div>`
}

/**
 * Run enabled rules for an event. Called fire-safe from recordEngagementEvent;
 * wraps nothing that can throw out. `actorProfileId` is the event's actor.
 */
export async function runAutomationsForEvent(
  eventType: string,
  actorProfileId: string | null,
): Promise<void> {
  if (!actorProfileId) return
  const client = db()

  const { data: rules } = await client
    .from('automation_rules')
    .select('action_type, action_config')
    .eq('trigger_event', eventType)
    .eq('enabled', true)
  if (!rules || rules.length === 0) return

  // Resolve the actor's email once (from the CRM contact).
  const { data: contact } = await client
    .from('contacts')
    .select('email')
    .eq('profile_id', actorProfileId)
    .maybeSingle()
  const actorEmail: string | null = contact?.email ?? null

  for (const rule of rules) {
    if (rule.action_type === 'email_actor' && actorEmail) {
      const gate = await resolveSendGate(actorProfileId, 'email', 'lifecycle')
      if (!gate.allowed) continue
      const cfg = (rule.action_config ?? {}) as { subject?: string; body?: string }
      const unsubscribeUrl = buildUnsubscribeUrl({ baseUrl: SITE_URL, profileId: actorProfileId, category: 'lifecycle' })
      await enqueueEmail({
        to: actorEmail,
        subject: cfg.subject || 'A note from Frequency',
        html: actorEmailHtml(cfg.body || '', unsubscribeUrl),
        text: `${cfg.body || ''}\n\nUnsubscribe: ${unsubscribeUrl}`,
        headers: listUnsubscribeHeaders(unsubscribeUrl),
      })
    } else if (rule.action_type === 'push_actor') {
      // Push to the same actor via the durable outbox (kind 'push'), mirroring how
      // the email branch enqueues rather than sends inline. This is deliberate, not
      // just for durability: automations.ts is client-reachable (capture-launcher →
      // analytics → engagement/events → here), and lib/push pulls in web-push, a
      // node-only dep (net/tls/dns) that breaks `next build` if it lands in a client
      // bundle. Enqueue is a plain DB write; the queue handler sends server-side and
      // runs the full send-gate (push preference + consent, fails dark without VAPID).
      const cfg = (rule.action_config ?? {}) as Partial<PushActionConfig>
      if (!cfg.title || !cfg.body) continue
      await enqueue('push', {
        profileId: actorProfileId,
        payload: { title: cfg.title, body: cfg.body, url: cfg.url || '/' },
        category: 'lifecycle',
      }).catch(() => {})
    }
  }
}
