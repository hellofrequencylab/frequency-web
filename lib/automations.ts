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

// ── The condition layer (trigger → CONDITION → action, GE6-2) ──────────────────
// A rule may carry zero or more conditions that gate whether its action fires. They
// match against the event's `context` jsonb (the per-source detail recordEngagementEvent
// stores on the ledger row). Conditions live INSIDE action_config (`action_config.conditions`)
// so the engine stays migration-free: action_config is a free-form jsonb column. An empty
// or absent condition set means "always fire" (back-compatible with every existing rule).

export const AUTOMATION_CONDITION_OPS = ['eq', 'neq', 'exists', 'absent', 'gt', 'lt'] as const
export type AutomationConditionOp = (typeof AUTOMATION_CONDITION_OPS)[number]

export function isAutomationConditionOp(value: unknown): value is AutomationConditionOp {
  return typeof value === 'string' && (AUTOMATION_CONDITION_OPS as readonly string[]).includes(value)
}

/** One predicate over an event-context field. `value` is unused for exists/absent. */
export interface AutomationCondition {
  /** Dot-path into the event context, e.g. 'source' or 'space.slug'. */
  field: string
  op: AutomationConditionOp
  value?: string | number
}

/** Read a dot-path out of an arbitrary object, returning undefined for any miss. */
function readPath(obj: Record<string, unknown>, path: string): unknown {
  let cur: unknown = obj
  for (const key of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[key]
  }
  return cur
}

/** Parse + validate a raw conditions blob into typed predicates (drops malformed entries). */
export function parseConditions(raw: unknown): AutomationCondition[] {
  if (!Array.isArray(raw)) return []
  const out: AutomationCondition[] = []
  for (const c of raw) {
    if (!c || typeof c !== 'object') continue
    const { field, op, value } = c as Record<string, unknown>
    if (typeof field !== 'string' || !field.trim() || !isAutomationConditionOp(op)) continue
    const entry: AutomationCondition = { field: field.trim(), op }
    if (typeof value === 'string' || typeof value === 'number') entry.value = value
    out.push(entry)
  }
  return out
}

/**
 * Pure: do ALL of a rule's conditions hold for an event context? No conditions = true.
 * Numeric ops (gt/lt) coerce both sides to Number and fail closed on NaN. Equality is
 * compared as strings so '5' and 5 match (context is loosely typed jsonb). Exhaustively
 * unit-tested: this is the gate an automation cannot route around.
 */
export function evaluateConditions(
  conditions: AutomationCondition[],
  context: Record<string, unknown>,
): boolean {
  for (const c of conditions) {
    const actual = readPath(context, c.field)
    switch (c.op) {
      case 'exists':
        if (actual === undefined || actual === null) return false
        break
      case 'absent':
        if (actual !== undefined && actual !== null) return false
        break
      case 'eq':
        if (String(actual) !== String(c.value)) return false
        break
      case 'neq':
        if (String(actual) === String(c.value)) return false
        break
      case 'gt': {
        const a = Number(actual)
        const b = Number(c.value)
        if (Number.isNaN(a) || Number.isNaN(b) || !(a > b)) return false
        break
      }
      case 'lt': {
        const a = Number(actual)
        const b = Number(c.value)
        if (Number.isNaN(a) || Number.isNaN(b) || !(a < b)) return false
        break
      }
    }
  }
  return true
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
  /** Parsed condition predicates (from action_config.conditions). Empty = always fire. */
  conditions: AutomationCondition[]
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
  return (data ?? []).map((r) => {
    const cfg = (r.action_config ?? {}) as Record<string, unknown>
    return {
      id: r.id,
      name: r.name,
      triggerEvent: r.trigger_event,
      actionType: r.action_type,
      actionConfig: cfg,
      conditions: parseConditions(cfg.conditions),
      enabled: r.enabled,
      createdAt: r.created_at ?? null,
    }
  })
}

function actorEmailHtml(body: string, unsubscribeUrl: string): string {
  const safe = body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br/>')
  return `<div style="max-width:560px;margin:0 auto;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;padding:24px;"><p style="font-size:15px;color:#333;line-height:1.6;">${safe}</p><hr style="border:none;border-top:1px solid #eee;margin:24px 0;"/><p style="font-size:12px;color:#999;">You're receiving this as a Frequency member. <a href="${unsubscribeUrl}" style="color:#999;">Unsubscribe</a>.</p></div>`
}

/**
 * Run enabled rules for an event. Called fire-safe from recordEngagementEvent;
 * wraps nothing that can throw out. `actorProfileId` is the event's actor;
 * `context` is the event's ledger context, matched against each rule's conditions
 * (trigger → CONDITION → action). A rule with no conditions always fires.
 */
export async function runAutomationsForEvent(
  eventType: string,
  actorProfileId: string | null,
  context: Record<string, unknown> = {},
): Promise<void> {
  if (!actorProfileId) return
  const client = db()

  const { data: rules } = await client
    .from('automation_rules')
    .select('action_type, action_config')
    .eq('trigger_event', eventType)
    .eq('enabled', true)
  if (!rules || rules.length === 0) return

  // The action only fires when every condition holds for this event's context.
  const matched = rules.filter((r) => {
    const cfg = (r.action_config ?? {}) as Record<string, unknown>
    return evaluateConditions(parseConditions(cfg.conditions), context)
  })
  if (matched.length === 0) return

  // Resolve the actor's email once (from the CRM contact).
  const { data: contact } = await client
    .from('contacts')
    .select('email')
    .eq('profile_id', actorProfileId)
    .maybeSingle()
  const actorEmail: string | null = contact?.email ?? null

  for (const rule of matched) {
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
