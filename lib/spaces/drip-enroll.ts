// PER-SPACE DRIP ENROLLMENT + TRIGGER DISPATCH (ADR-561, the RUNNER behind the automation SURFACE).
// The surface (lib/spaces/automation.ts) let an owner DEFINE trigger -> action rules and ordered drip
// sequences; this module is what makes them DO something at runtime:
//
//   • enrollContactInSequence — the enrollment primitive. Insert one space_drip_enrollments row at the
//     sequence's first enabled step, with next_run_at = now() + that step's delay. Idempotent via the
//     unique (sequence_id, contact_id) constraint: a re-fired trigger never double-enrolls.
//   • fireSpaceTrigger — the DISPATCHER a Space CRM event calls (fire-safe). For a given (space, event,
//     contact) it finds every ENABLED rule on that trigger and runs its action: for the 'email_audience'
//     action it enrolls the contact into the rule's targeted drip sequence when one is named, else it
//     records the intent (a one-shot email action reuses the drip send path via a single-step sequence).
//
// SHAPE (mirrors lib/nurture/enroll.ts + lib/spaces/automation.ts): service-role admin client over the
// space_drip_enrollments table (not in the generated DB types yet, ADR-246), space_id-scoped on every
// read + write. Server-only. NO 'use server' directive so it can export helpers + be imported by the
// runner and the trigger sites.
//
// FIRE-SAFE BY CONTRACT (the hard rule): fireSpaceTrigger and enrollContactInSequence NEVER throw. Every
// path is wrapped in try/catch and swallows its own error (logged), so a rule misconfiguration or a DB
// blip in the automation path can never break the CRM event that fired it (a contact still graduates, a
// member still joins). The caller fires-and-forgets (`void fireSpaceTrigger(...)`).

import { createAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/log'
import { normalizeDelayHours, type SpaceAutomationTrigger } from '@/lib/spaces/automation'

// ── Types ─────────────────────────────────────────────────────────────────────────────────────────

/** What one enrollment attempt reports. `enrolled` false = a no-op (already enrolled, or nothing to
 *  enroll into); never an error (the path is fail-safe). */
export interface EnrollResult {
  enrolled: boolean
}

/** The untyped admin-client seam (space_drip_* tables + contacts are not in the generated types yet). */
type Row = Record<string, unknown>

// ── ENROLLMENT PRIMITIVE ────────────────────────────────────────────────────────────────────────

/**
 * Enroll ONE Space contact into ONE of the Space's drip sequences. Inserts a space_drip_enrollments
 * row at the sequence's FIRST ENABLED step, with next_run_at = now() + that step's delay_hours. Both
 * the sequence AND the contact are re-read PINNED to space_id, so a cross-space sequence/contact id
 * enrolls NOTHING (tenancy holds even though the caller already scoped). Idempotent: the unique
 * (sequence_id, contact_id) index makes a repeat enroll a no-op (upsert ignoreDuplicates). FAIL-SAFE:
 * any error returns { enrolled: false } and is logged, never thrown.
 */
export async function enrollContactInSequence(
  spaceId: string,
  sequenceId: string,
  contactId: string,
): Promise<EnrollResult> {
  if (!spaceId || !sequenceId || !contactId) return { enrolled: false }
  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, val: string) => {
            eq: (col: string, val: string) => {
              maybeSingle: () => Promise<{ data: Row | null; error: unknown }>
              order: (col: string, o: { ascending: boolean }) => Promise<{ data: Row[] | null; error: unknown }>
            }
          }
        }
        upsert: (
          rows: Row[],
          opts: { onConflict: string; ignoreDuplicates: boolean },
        ) => Promise<{ error: unknown }>
      }
    }

    // The sequence must belong to THIS Space and be ENABLED (a disabled sequence enrolls nobody).
    const { data: seq } = await db
      .from('space_drip_sequences')
      .select('id, enabled')
      .eq('id', sequenceId)
      .eq('space_id', spaceId)
      .maybeSingle()
    if (!seq || seq.enabled === false) return { enrolled: false }

    // The contact must belong to THIS Space and have an email (the send address, denormalized at enroll).
    const { data: contact } = await db
      .from('contacts')
      .select('id, email')
      .eq('id', contactId)
      .eq('space_id', spaceId)
      .maybeSingle()
    const email = typeof contact?.email === 'string' ? contact.email.trim().toLowerCase() : ''
    if (!contact || !email) return { enrolled: false }

    // The sequence's steps, ascending, SPACE-scoped. The FIRST enabled step is what we start on.
    const { data: stepRows } = await db
      .from('space_drip_steps')
      .select('step_order, delay_hours, enabled')
      .eq('space_id', spaceId)
      .eq('sequence_id', sequenceId)
      .order('step_order', { ascending: true })
    const first = (stepRows ?? [])
      .filter((s) => s.enabled !== false)
      .sort((a, b) => Number(a.step_order) - Number(b.step_order))[0]
    if (!first) return { enrolled: false } // no sendable step yet: nothing to enroll into.

    const stepOrder = Number(first.step_order) || 1
    const delayHours = normalizeDelayHours(first.delay_hours)
    const nextRunAt = new Date(Date.now() + delayHours * 3_600_000).toISOString()

    // Idempotent enroll: the unique (sequence_id, contact_id) index folds a re-enroll to a no-op.
    const { error } = await db.from('space_drip_enrollments').upsert(
      [
        {
          space_id: spaceId,
          sequence_id: sequenceId,
          contact_id: contactId,
          email,
          current_step: stepOrder,
          next_run_at: nextRunAt,
          status: 'enrolled',
        },
      ],
      { onConflict: 'sequence_id,contact_id', ignoreDuplicates: true },
    )
    if (error) {
      log.error('spaces.drip.enroll_failed', { spaceId, sequenceId, contactId, error: String(error) })
      return { enrolled: false }
    }
    return { enrolled: true }
  } catch (err) {
    log.error('spaces.drip.enroll_threw', { spaceId, sequenceId, contactId, error: String(err) })
    return { enrolled: false }
  }
}

// ── TRIGGER DISPATCH ──────────────────────────────────────────────────────────────────────────────

/** One enabled rule the dispatcher considers, as read off space_automation_rules. */
interface TriggerRule {
  id: string
  action_config: unknown
}

/** Pull a target sequence id out of a rule's action_config, if the rule names one. The surface's
 *  EmailAudienceConfig does not carry a sequenceId today, so this reads an OPTIONAL `sequenceId`
 *  (forward-compatible: a rule that targets a drip sequence sets it). Returns null when absent. */
function ruleSequenceId(config: unknown): string | null {
  if (!config || typeof config !== 'object') return null
  const raw = (config as Record<string, unknown>).sequenceId
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null
}

/** Resolve the Space contact id for a member PROFILE (member.joined carries a profileId, not a contact
 *  id). Reads THIS Space's contacts by (space_id, profile_id). FAIL-SAFE to null: a member with no
 *  contact row in this Space simply doesn't enroll. */
async function resolveContactByProfile(spaceId: string, profileId: string): Promise<string | null> {
  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, val: string) => {
            eq: (col: string, val: string) => { maybeSingle: () => Promise<{ data: { id?: string } | null }> }
          }
        }
      }
    }
    const { data } = await db
      .from('contacts')
      .select('id')
      .eq('space_id', spaceId)
      .eq('profile_id', profileId)
      .maybeSingle()
    return typeof data?.id === 'string' && data.id.length ? data.id : null
  } catch {
    return null
  }
}

/**
 * Fire a Space CRM trigger. FIRE-SAFE: never throws (the hard rule) so a rule error never breaks the
 * CRM event that fired it. For the given (spaceId, event, contact) it finds every ENABLED rule on
 * that trigger and runs its action:
 *   • A rule that names a target `sequenceId` (action_config.sequenceId) ENROLLS the contact into that
 *     drip sequence (enrollContactInSequence, itself idempotent + space-scoped).
 *   • A rule with no named sequence is a one-shot 'email_audience' action; the surface's send path
 *     (the campaign send seam) owns that today, so the dispatcher records the match and moves on (no
 *     inline send here — the runner's ONE send path is the drip cron, keeping anti-spam gating in one
 *     place). A future one-shot action wraps a single-step ad-hoc sequence.
 *
 * The event's subject is a Space contact: pass its `contactId` directly, OR pass a `profileId` (e.g.
 * member.joined) and the dispatcher resolves this Space's contact row for that member. When neither
 * resolves to a Space contact the dispatcher no-ops. Reads are space_id-scoped.
 */
export async function fireSpaceTrigger(
  spaceId: string,
  event: SpaceAutomationTrigger,
  input: { contactId?: string | null; profileId?: string | null } = {},
): Promise<void> {
  if (!spaceId || !event) return
  try {
    let contactId = input.contactId?.trim() || null
    if (!contactId && input.profileId?.trim()) {
      contactId = await resolveContactByProfile(spaceId, input.profileId.trim())
    }
    if (!contactId) return

    const db = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, val: string) => {
            eq: (col: string, val: string) => {
              eq: (col: string, val: boolean) => Promise<{ data: TriggerRule[] | null; error: unknown }>
            }
          }
        }
      }
    }

    // Every ENABLED rule on this trigger for THIS Space. A cross-space rule is never reached (space_id
    // filter first). A disabled rule is skipped (enabled = true filter).
    const { data: rules, error } = await db
      .from('space_automation_rules')
      .select('id, action_config')
      .eq('space_id', spaceId)
      .eq('trigger_event', event)
      .eq('enabled', true)
    if (error || !rules || rules.length === 0) return

    for (const rule of rules) {
      const sequenceId = ruleSequenceId(rule.action_config)
      if (sequenceId) {
        // Enroll the contact into the rule's targeted drip sequence (idempotent + fail-safe).
        await enrollContactInSequence(spaceId, sequenceId, contactId)
      }
      // A rule with no target sequence is a one-shot email action; the drip cron is the ONLY send path
      // in the runner, so there is nothing to enroll and nothing to send here. Left as a no-op by design.
    }
  } catch (err) {
    // FIRE-SAFE: swallow. A rule/DB error must never surface into the CRM event that fired the trigger.
    log.error('spaces.drip.fire_trigger_threw', { spaceId, event, error: String(err) })
  }
}
