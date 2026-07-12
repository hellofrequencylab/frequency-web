// Nurture runner (ADR-131). Drains due enrollments: for each active enrollment whose
// next_run_at has passed, send the next step (consent-gated, lead-unsubscribe stamped,
// queued via the durable email outbox) and advance — or complete/cancel. Called from
// /api/cron/nurture. Server-only; never sends inline (enqueueEmail).

import { createAdminClient } from '@/lib/supabase/admin'
import { enqueueEmail, listUnsubscribeHeaders } from '@/lib/email'
import { resolveSendGate } from '@/lib/comms/send-gate'
import { buildLeadUnsubUrl } from '@/lib/connections/lead-unsub'
import { nextStepAfter, runAtFrom, type NurtureStep } from '@/lib/nurture/schedule'
import { parseEntityLayout, type EntityLayout } from '@/lib/entity-blocks/layout'
import { compileEmailDoc } from '@/lib/email-studio/shell'
import { applyMergeTags } from '@/lib/email-studio/render'
import { MERGE_TAG_DEFAULT_FALLBACKS } from '@/lib/email-studio/types'

interface EnrRow {
  id: string
  sequence_id: string
  contact_id: string
  email: string
  persona: string
  next_step_order: number
}
interface StepRow {
  id: string; sequence_id: string; step_order: number; delay_hours: number
  subject: string; body: string; enabled: boolean; block_json: unknown
}

export interface NurtureRunResult {
  processed: number
  sent: number
  completed: number
  cancelled: number
}

// Same lightweight template as the automations email, with a lead-flavoured footer.
function renderEmail(body: string, unsubscribeUrl: string): string {
  const safe = body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br/>')
  return `<div style="max-width:560px;margin:0 auto;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;padding:24px;"><p style="font-size:15px;color:#333;line-height:1.6;">${safe}</p><hr style="border:none;border-top:1px solid #eee;margin:24px 0;"/><p style="font-size:12px;color:#999;">You're receiving this because you signed up at Frequency. <a href="${unsubscribeUrl}" style="color:#999;">Unsubscribe</a>.</p></div>`
}

function toStep(r: StepRow): NurtureStep {
  return { id: r.id, sequenceId: r.sequence_id, order: r.step_order, delayHours: r.delay_hours, subject: r.subject, body: r.body, enabled: r.enabled }
}

// Split a lead's display name into first / rest, mirroring the campaign send (lib/email-studio/send.ts).
function splitName(displayName: string | null): { firstName: string; lastName: string } {
  const trimmed = (displayName ?? '').trim()
  if (!trimmed) return { firstName: '', lastName: '' }
  const parts = trimmed.split(/\s+/)
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

// The per-recipient {{contact.*}} bag; applyMergeTags HTML-escapes values so a name cannot inject.
function mergeVarsFor(displayName: string | null, email: string): Record<string, string> {
  const { firstName, lastName } = splitName(displayName)
  return { 'contact.first_name': firstName, 'contact.last_name': lastName, 'contact.email': email }
}

/** Render a block-editor step body (EntityLayout, kind 'email') to send-ready html/text/subject the SAME way
 *  the Phase-4 campaign send does: compileEmailDoc for the themed shell + footer unsubscribe, then per-recipient
 *  merge tags (HTML escaped in the body, raw in text + subject). */
function renderBlockStep(
  layout: EntityLayout,
  subject: string,
  vars: Record<string, string>,
  unsubscribeUrl: string,
): { html: string; text: string; subject: string } {
  const compiled = compileEmailDoc({ layout, subject, preheader: '' }, { unsubscribeUrl })
  return {
    html: applyMergeTags(compiled.html, vars, { fallbacks: MERGE_TAG_DEFAULT_FALLBACKS }),
    text: applyMergeTags(compiled.text, vars, { fallbacks: MERGE_TAG_DEFAULT_FALLBACKS, escape: false }),
    subject: applyMergeTags(subject, vars, { fallbacks: MERGE_TAG_DEFAULT_FALLBACKS, escape: false }),
  }
}

export async function runDueNurture(limit = 200): Promise<NurtureRunResult> {
  const db = createAdminClient()
  const nowIso = new Date().toISOString()

  const { data: dueRows } = await db
    .from('nurture_enrollments')
    .select('id, sequence_id, contact_id, email, persona, next_step_order')
    .eq('status', 'active')
    .lte('next_run_at', nowIso)
    .order('next_run_at', { ascending: true })
    .limit(limit)
  const due = (dueRows as EnrRow[] | null) ?? []
  if (due.length === 0) return { processed: 0, sent: 0, completed: 0, cancelled: 0 }

  const seqIds = [...new Set(due.map((d) => d.sequence_id))]
  const contactIds = [...new Set(due.map((d) => d.contact_id))]
  const [{ data: seqRows }, { data: stepRows }, { data: contactRows }] = await Promise.all([
    db.from('nurture_sequences').select('id, enabled').in('id', seqIds),
    db.from('nurture_steps').select('id, sequence_id, step_order, delay_hours, subject, body, enabled, block_json').in('sequence_id', seqIds),
    db.from('contacts').select('id, consent_state, profile_id, display_name').in('id', contactIds),
  ])

  const seqEnabled = new Map((seqRows as { id: string; enabled: boolean }[] | null ?? []).map((s) => [s.id, s.enabled]))
  const stepsBySeq = new Map<string, NurtureStep[]>()
  // Parsed block-editor body per step id (null → the step uses its legacy plain `body`).
  const blockByStepId = new Map<string, EntityLayout | null>()
  for (const r of (stepRows as StepRow[] | null) ?? []) {
    const list = stepsBySeq.get(r.sequence_id) ?? []
    list.push(toStep(r))
    stepsBySeq.set(r.sequence_id, list)
    blockByStepId.set(r.id, r.block_json == null ? null : parseEntityLayout(r.block_json))
  }
  const contactById = new Map(
    (contactRows as { id: string; consent_state: string | null; profile_id: string | null; display_name: string | null }[] | null ?? []).map((c) => [c.id, c]),
  )

  let sent = 0
  let completed = 0
  let cancelled = 0

  const complete = (id: string) =>
    db.from('nurture_enrollments').update({ status: 'completed', last_sent_at: new Date().toISOString() }).eq('id', id)
  const cancel = (id: string) =>
    db.from('nurture_enrollments').update({ status: 'cancelled' }).eq('id', id)

  for (const e of due) {
    // A disabled sequence is paused: leave the enrollment due for when it's re-enabled.
    if (!seqEnabled.get(e.sequence_id)) continue

    const steps = stepsBySeq.get(e.sequence_id) ?? []
    // The step to run is the first enabled step at-or-after the cursor (skips a
    // since-disabled/deleted step instead of stalling).
    const step = nextStepAfter(steps, e.next_step_order - 1)
    if (!step) { await complete(e.id); completed++; continue }

    const contact = contactById.get(e.contact_id)
    if (!contact || contact.consent_state === 'unsubscribed') { await cancel(e.id); cancelled++; continue }
    if (contact.profile_id) {
      // Route the autonomous send through the unified gate (ADR-169): preference +
      // lifecycle consent + suppression in one verified decision, not an ad-hoc check.
      const gate = await resolveSendGate(contact.profile_id, 'email', 'lifecycle', { email: e.email })
      if (!gate.allowed) { await cancel(e.id); cancelled++; continue }
    }

    const unsubscribeUrl = buildLeadUnsubUrl(e.contact_id)
    // A step with a block-editor body renders through Email Studio (themed shell + per-recipient merge tags),
    // exactly like the Phase-4 campaign send; a legacy plain-body step keeps the existing lightweight render.
    const block = blockByStepId.get(step.id) ?? null
    const message = block
      ? renderBlockStep(block, step.subject, mergeVarsFor(contact.display_name, e.email), unsubscribeUrl)
      : {
          subject: step.subject,
          html: renderEmail(step.body, unsubscribeUrl),
          text: `${step.body}\n\nUnsubscribe: ${unsubscribeUrl}`,
        }
    await enqueueEmail({
      to: e.email,
      subject: message.subject,
      html: message.html,
      text: message.text,
      headers: listUnsubscribeHeaders(unsubscribeUrl),
    })
    sent++

    const next = nextStepAfter(steps, step.order)
    if (next) {
      await db
        .from('nurture_enrollments')
        .update({ next_step_order: next.order, next_run_at: runAtFrom(Date.now(), next.delayHours), last_sent_at: new Date().toISOString() })
        .eq('id', e.id)
    } else {
      await complete(e.id)
      completed++
    }
  }

  return { processed: due.length, sent, completed, cancelled }
}
