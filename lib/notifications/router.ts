// The notification ROUTER (ADR-627). ONE entry point every notification flows through:
//
//     routeNotification(event, recipient, ctx)
//
// It resolves the event's type from the registry, renders the declared channels, runs the
// unified send-gate (ADR-169 `resolveSendGate`) per channel, and enqueues the allowed ones
// on the existing durable outbox (lib/queue/outbox). It REPLACES the scattered "look up a
// category string → call the gate → enqueue by hand" that each send site open-coded.
//
// Design notes:
//   • Behaviour-preserving swap. The gate + outbox are unchanged; the router just makes the
//     mapping declarative and the decision uniform. Gating at route time (not only at drain
//     time) means a doomed job is never enqueued in the first place — strictly safer.
//   • Injected seams. `resolveGate` + `enqueueJob` default to the real implementations but
//     can be supplied, so the pure routing DECISION (which channels, which reasons, what got
//     enqueued) is unit-testable with no database.
//   • Transport only. It imports lib/push / lib/email as TYPES only and enqueues email via
//     the raw 'email' outbox kind, so it never pulls web-push (node-only) into a client graph.

import { enqueue } from '@/lib/queue/outbox'
import { resolveSendGate, type SendGateDecision, type SendGateReason } from '@/lib/comms/send-gate'
import type { NotificationChannel } from '@/lib/notification-preferences'
import {
  resolveNotificationType,
  type NotificationEvent,
  type NotificationContexts,
  type NotificationRecipient,
} from './registry'

/** Injected dependencies, so the routing decision is testable without IO. Both default to
 *  the real send-gate + outbox in production. */
export interface RouterDeps {
  /** The unified send-gate (ADR-169). Defaults to `resolveSendGate`. */
  resolveGate?: typeof resolveSendGate
  /** The durable outbox enqueue. Defaults to `enqueue`. */
  enqueueJob?: (kind: string, payload: Record<string, unknown>) => Promise<void>
}

/** Per-send options (frequency cap seed). Passed through to the gate; omit for an uncapped send. */
export interface RouteOptions {
  /** Sends already made in the window + the hard cap, for a frequency-capped type. */
  frequency?: { sentInWindow: number; cap: number }
}

/** What happened on one channel. `enqueued` is true only when the gate allowed AND a job was
 *  written; `reason` is the gate's verdict (or 'skipped' when the type rendered no payload for
 *  this channel, so no gate was even run). */
export interface ChannelOutcome {
  channel: NotificationChannel
  reason: SendGateReason | 'skipped'
  enqueued: boolean
}

export interface RouteResult {
  event: NotificationEvent
  outcomes: ChannelOutcome[]
  /** How many channels were actually enqueued (the fan-out count a caller reports). */
  enqueuedCount: number
}

/**
 * Route ONE notification to ONE recipient: registry lookup → render → gate per channel →
 * enqueue the allowed channels on the outbox. Returns a per-channel decision trail (for
 * logging, tests, and fan-out counting). Never throws for a gate denial or a channel with no
 * payload — those are recorded as outcomes; it throws only for an unknown event (a catalogue
 * bug) or if the caller-injected enqueue rejects (surfaced so the outbox's durability contract
 * holds — a real send site wraps the call best-effort exactly as it did before).
 */
export async function routeNotification<E extends NotificationEvent>(
  event: E,
  recipient: NotificationRecipient,
  ctx: NotificationContexts[E],
  options: RouteOptions = {},
  deps: RouterDeps = {},
): Promise<RouteResult> {
  const resolveGate = deps.resolveGate ?? resolveSendGate
  const enqueueJob = deps.enqueueJob ?? enqueue

  const type = resolveNotificationType(event)
  const rendered = type.render(ctx)

  const outcomes: ChannelOutcome[] = []
  let enqueuedCount = 0

  for (const channel of type.channels) {
    // Only route a channel the type actually rendered a payload for. A declared-but-unrendered
    // channel (e.g. a conditional email) is a clean skip, never a half-formed job.
    const hasPayload =
      (channel === 'email' && rendered.email) ||
      (channel === 'push' && rendered.push) ||
      (channel === 'inapp' && rendered.inapp)
    if (!hasPayload) {
      outcomes.push({ channel, reason: 'skipped', enqueued: false })
      continue
    }

    const decision: SendGateDecision = await resolveGate(recipient.profileId, channel, type.category, {
      email: recipient.email ?? undefined,
      subject: recipient.subject,
      frequency: options.frequency,
    })

    if (!decision.allowed) {
      outcomes.push({ channel, reason: decision.reason, enqueued: false })
      continue
    }

    // Allowed: enqueue on the existing outbox in the SAME job shape the handlers already drain
    // (lib/queue/handlers.ts). Email goes on as the raw 'email' kind (what enqueueEmail writes)
    // so the router needs no runtime import of lib/email.
    if (channel === 'email' && rendered.email) {
      await enqueueJob('email', rendered.email as unknown as Record<string, unknown>)
    } else if (channel === 'push' && rendered.push) {
      await enqueueJob('push', {
        profileId: recipient.profileId,
        payload: rendered.push,
        category: type.category,
      })
    } else if (channel === 'inapp' && rendered.inapp) {
      // No in-app outbox handler yet (see the migration checklist below); a type that declares
      // 'inapp' would need one first. Recorded as skipped so a premature declaration is inert.
      outcomes.push({ channel, reason: 'skipped', enqueued: false })
      continue
    }

    outcomes.push({ channel, reason: 'ok', enqueued: true })
    enqueuedCount++
  }

  return { event, outcomes, enqueuedCount }
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// MIGRATION CHECKLIST — the remaining send sites to route through the registry (ADR-627).
//
// PROVEN (migrated, this change):
//   ✅ event.dispatch  — lib/events/dispatch.ts `fanOutEventPush` (push, community)
//   ✅ booking.reminder — lib/spaces/booking-notify.ts `runBookingReminder` (email, transactional)
//
// TO MIGRATE (each is a registry row + a call-site swap; do NOT rip out in one pass):
//   ⏳ automations `email_actor` / `push_actor` — lib/automations.ts (email + push). Note: its
//       test asserts the exact enqueue shape; migrate the test alongside.
//   ⏳ nurture runner            — lib/nurture/runner.ts (lifecycle email, frequency-capped)
//   ⏳ winback                   — lib/studio/winback.ts (lifecycle email)
//   ⏳ Vera owner brief          — lib/ai/vera/owner-brief.ts (lifecycle email; owned by AI agent)
//   ⏳ event dispatch SMS        — lib/events/dispatch.ts `fanOutEventSms` (SMS channel)
//   ⏳ booking confirm / cancel  — lib/spaces/booking-notify.ts (transactional email)
//   ⏳ email-studio broadcast    — lib/email-studio/send.ts (marketing; owned by email-studio)
//   ⏳ mentions / comments in-app — needs an 'inapp' outbox handler first (channel groundwork)
//
// PATTERN for each: add the event to `NotificationEvent` + `NotificationContexts` + a
// `NOTIFICATION_REGISTRY` row (category/channels/render), then replace the site's hand-rolled
// gate+enqueue with a `routeNotification(event, recipient, ctx)` call. The gate + outbox do not
// change; only the mapping moves into the catalog.
// ─────────────────────────────────────────────────────────────────────────────────────────
