// PER-SPACE AUTOMATION (R5, business-accounts Automation). The library + action implementations behind
// the Space automation surface: simple trigger -> action RULES and ordered DRIP SEQUENCES over the
// Space's OWN contacts / segments. The per-Space analog of lib/automations.ts (root rules) and
// lib/nurture/* (persona sequences), following the exact shape of lib/spaces/segments.ts: pure
// validation helpers (no Supabase/Next imports, unit-testable), a thin IO layer of untyped admin-client
// reads/writes over three tables (space_automation_rules / space_drip_sequences / space_drip_steps, not
// in the generated DB types yet, ADR-246), then the action implementations as plain async functions.
// This module has NO 'use server' directive so it can ALSO export the pure helpers + types the surfaces
// import; the thin 'use server' wrappers the CLIENT calls live in lib/spaces/automation-actions.ts.
//
// TENANCY + AUTHZ (ADR-246/328/329). A Space A caller never sees or edits Space B's rules / sequences:
// every READ filters `space_id = spaceId`, and every single-row read ALSO filters space_id so a cross-
// space id leaks nothing. WRITES are gated on canEditProfile (owner / admin / editor) via
// getSpaceCapabilities AND re-validate the row belongs to the Space before mutating (the update/delete
// bind both id AND space_id). Reads FAIL-SAFE (empty / null); writes FAIL-CLOSED on a permission miss.
//
// GATE: the automation SURFACE is gated on the `crm.space.automation` capability (spaceHasEntitlement
// 'automation'); the surface enforces that. These server actions independently gate every write on
// canEditProfile, so the data layer is safe even if a surface forgets.

import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { getSpaceById } from '@/lib/spaces/store'
import { getSpaceCapabilities, spaceHasEntitlement } from '@/lib/spaces/entitlements'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { definitionToFilter, resolveAudience } from '@/lib/spaces/audiences'
import { enrollContactInSequence } from '@/lib/spaces/drip-enroll'
import {
  SPACE_AUTOMATION_TRIGGERS,
  SPACE_AUTOMATION_ACTIONS,
  SPACE_AUTOMATION_TEMPLATES,
  type SpaceAutomationTrigger,
  type SpaceAutomationAction,
  type EmailAudienceConfig,
  type SpaceAutomationRule,
  type SpaceDripStep,
  type SpaceDripSequence,
  type SpaceAutomationTemplate,
} from '@/lib/spaces/automation-types'

// The client-safe types + constants live in ./automation-types (no server-only imports) so a CLIENT
// component can import them without pulling this server-only IO module into the client bundle. This
// module RE-EXPORTS them so server callers keep one import surface.
export {
  SPACE_AUTOMATION_TRIGGERS,
  SPACE_AUTOMATION_ACTIONS,
  SPACE_AUTOMATION_TEMPLATES,
  type SpaceAutomationTrigger,
  type SpaceAutomationAction,
  type EmailAudienceConfig,
  type SpaceAutomationRule,
  type SpaceDripStep,
  type SpaceDripSequence,
  type SpaceAutomationTemplate,
}

const MAX_NAME_LEN = 80
const MAX_SUBJECT_LEN = 200
const MAX_BODY_LEN = 50_000
const MAX_DELAY_HOURS = 24 * 365 // one year — a generous, non-overflowing ceiling.

// ── PURE: validation / normalization (no IO, testable) ──────────────────────────────────────────

/** Trim + length-cap a name; '' if absent/blank (the caller rejects an empty name). Pure. */
export function normalizeName(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().slice(0, MAX_NAME_LEN) : ''
}

/** Trim + length-cap a subject; '' if absent/blank. Pure. */
export function normalizeSubject(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().slice(0, MAX_SUBJECT_LEN) : ''
}

/** Length-cap a body, preserving newlines. Pure. */
export function normalizeBody(raw: unknown): string {
  return typeof raw === 'string' ? raw.slice(0, MAX_BODY_LEN) : ''
}

/** Coerce a delay to a non-negative integer hour count within the ceiling. Pure, fail-safe: a
 *  missing / negative / huge / non-numeric value clamps to a safe default (24h) or the ceiling. */
export function normalizeDelayHours(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n) || n < 0) return 24
  return Math.min(Math.floor(n), MAX_DELAY_HOURS)
}

/** A known trigger, or null. Pure, fail-safe. */
export function normalizeTrigger(raw: unknown): SpaceAutomationTrigger | null {
  return typeof raw === 'string' && (SPACE_AUTOMATION_TRIGGERS as readonly string[]).includes(raw)
    ? (raw as SpaceAutomationTrigger)
    : null
}

/** A known action, or null. Pure, fail-safe. Today only 'email_audience'. */
export function normalizeAction(raw: unknown): SpaceAutomationAction | null {
  return typeof raw === 'string' && (SPACE_AUTOMATION_ACTIONS as readonly string[]).includes(raw)
    ? (raw as SpaceAutomationAction)
    : null
}

/** Normalize a stored/proposed action_config to a safe EmailAudienceConfig. Pure. */
export function normalizeEmailConfig(raw: unknown): EmailAudienceConfig {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    audience: definitionToFilter(obj.audience),
    subject: normalizeSubject(obj.subject),
    body: normalizeBody(obj.body),
  }
}

/** Validate a rule create/update payload. Returns the clean fields or an error string. Pure: the single
 *  place "what makes a valid rule" is decided, so the action + tests agree. */
export function validateRule(
  name: unknown,
  trigger: unknown,
  action: unknown,
  config: unknown,
):
  | { name: string; trigger: SpaceAutomationTrigger; action: SpaceAutomationAction; config: EmailAudienceConfig }
  | { error: string } {
  const cleanName = normalizeName(name)
  if (!cleanName) return { error: 'Give your rule a name.' }
  const trig = normalizeTrigger(trigger)
  if (!trig) return { error: 'Pick a trigger for your rule.' }
  const act = normalizeAction(action)
  if (!act) return { error: 'Pick an action for your rule.' }
  const cfg = normalizeEmailConfig(config)
  if (!cfg.subject) return { error: 'Give the email a subject.' }
  if (!cfg.body.trim()) return { error: 'Write the email your rule sends.' }
  return { name: cleanName, trigger: trig, action: act, config: cfg }
}

/** Validate a drip-step payload. Returns the clean fields or an error string. Pure. */
export function validateStep(
  subject: unknown,
  body: unknown,
  delayHours: unknown,
): { subject: string; body: string; delayHours: number } | { error: string } {
  const s = normalizeSubject(subject)
  if (!s) return { error: 'Give the step a subject.' }
  const b = normalizeBody(body)
  if (!b.trim()) return { error: 'Write the step message.' }
  return { subject: s, body: b, delayHours: normalizeDelayHours(delayHours) }
}

// ── IO: the untyped admin-client seam (the three tables aren't in the generated types yet, ADR-246) ──

type Row = Record<string, unknown>
type Query = {
  select: (cols: string) => Query
  eq: (col: string, val: string) => Query
  in: (col: string, vals: string[]) => Query
  order: (col: string, opts: { ascending: boolean }) => Query
  insert: (rows: Row[]) => Query
  update: (patch: Row) => Query
  delete: () => Query
  maybeSingle: () => Promise<{ data: Row | null; error: unknown }>
  then: (resolve: (r: { data: Row[] | null; error: unknown }) => unknown) => Promise<unknown>
}

function table(name: string): Query {
  const db = createAdminClient() as unknown as { from: (t: string) => Query }
  return db.from(name)
}

const RULE_COLS = 'id, name, trigger_event, action_type, action_config, enabled, created_at, space_id'
const SEQ_COLS = 'id, name, audience, enabled, created_at, space_id'
const STEP_COLS = 'id, sequence_id, space_id, step_order, delay_hours, subject, body, enabled'

function mapRule(r: Row): SpaceAutomationRule {
  return {
    id: String(r.id),
    name: String(r.name ?? ''),
    triggerEvent: normalizeTrigger(r.trigger_event) ?? 'contact.created',
    actionType: normalizeAction(r.action_type) ?? 'email_audience',
    config: normalizeEmailConfig(r.action_config),
    enabled: r.enabled !== false,
    createdAt: (r.created_at as string) ?? null,
  }
}

function mapStep(r: Row): SpaceDripStep {
  return {
    id: String(r.id),
    order: typeof r.step_order === 'number' ? r.step_order : Number(r.step_order) || 1,
    delayHours: normalizeDelayHours(r.delay_hours),
    subject: String(r.subject ?? ''),
    body: String(r.body ?? ''),
    enabled: r.enabled !== false,
  }
}

// ── Shared authz: resolve the Space + the editor gate in one place ──────────────────────────────

async function requireSpaceEditor(spaceId: string): Promise<{ ok: true } | ActionResult<never>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to manage automation.')
  const space = await getSpaceById(spaceId)
  if (!space) return fail('Space not found.')
  const caps = await getSpaceCapabilities(space, profileId)
  if (!caps.canEditProfile)
    return fail('You do not have permission to manage automation for this space.')
  return { ok: true }
}

/** Editor gate PLUS the `crm.space.automation` entitlement (spaceHasEntitlement 'automation'). Used by
 *  the RUNNER-facing action (starting a sequence), which is the live automation lever — not just a rule
 *  edit — so it must be gated on the plan entitlement as well as the editor role. Fail-closed. */
async function requireAutomationEditor(spaceId: string): Promise<{ ok: true } | ActionResult<never>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to manage automation.')
  const space = await getSpaceById(spaceId)
  if (!space) return fail('Space not found.')
  const caps = await getSpaceCapabilities(space, profileId)
  if (!caps.canEditProfile)
    return fail('You do not have permission to manage automation for this space.')
  if (!spaceHasEntitlement(space, 'automation'))
    return fail('Automation is not available on this space plan.')
  return { ok: true }
}

// ── RULES: list / create / toggle / delete ──────────────────────────────────────────────────────

/** A Space's automation rules, newest first. Filters space_id. Service-role; the CALLER gates
 *  authorization. FAIL-SAFE to []. */
export async function listSpaceRules(spaceId: string): Promise<SpaceAutomationRule[]> {
  if (!spaceId) return []
  try {
    return await new Promise<SpaceAutomationRule[]>((resolve) => {
      table('space_automation_rules')
        .select(RULE_COLS)
        .eq('space_id', spaceId)
        .order('created_at', { ascending: false })
        .then(({ data, error }) => {
          if (error || !data) return resolve([])
          resolve(data.map(mapRule))
        })
    })
  } catch {
    return []
  }
}

/** Create a rule. Gated on canEditProfile. Validated. Stamps space_id + created_by. */
export async function createSpaceRule(
  spaceId: string,
  input: { name: unknown; trigger: unknown; action: unknown; config: unknown },
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireSpaceEditor(spaceId)
  if ('error' in gate) return gate

  const valid = validateRule(input.name, input.trigger, input.action, input.config)
  if ('error' in valid) return fail(valid.error)

  const createdBy = await getMyProfileId()
  try {
    const { data, error } = await table('space_automation_rules')
      .insert([
        {
          space_id: spaceId,
          name: valid.name,
          trigger_event: valid.trigger,
          action_type: valid.action,
          action_config: valid.config,
          created_by: createdBy,
        },
      ])
      .select(RULE_COLS)
      .maybeSingle()
    if (error || !data) return fail('Could not create the rule. Try again.')
    return ok({ id: String(data.id) })
  } catch {
    return fail('Could not create the rule. Try again.')
  }
}

/** Turn a rule on / off. Gated on canEditProfile AND the rule belonging to the Space (write binds both
 *  id AND space_id). Fail-closed. */
export async function setSpaceRuleEnabled(
  spaceId: string,
  id: string,
  enabled: boolean,
): Promise<ActionResult> {
  const gate = await requireSpaceEditor(spaceId)
  if ('error' in gate) return gate
  try {
    const { error } = await table('space_automation_rules')
      .update({ enabled })
      .eq('id', id)
      .eq('space_id', spaceId)
      .maybeSingle()
    if (error) return fail('Could not update the rule. Try again.')
  } catch {
    return fail('Could not update the rule. Try again.')
  }
  return ok()
}

/** Delete a rule. Gated on canEditProfile AND the rule belonging to the Space. Fail-closed. */
export async function deleteSpaceRule(spaceId: string, id: string): Promise<ActionResult> {
  const gate = await requireSpaceEditor(spaceId)
  if ('error' in gate) return gate
  try {
    const { error } = await table('space_automation_rules')
      .delete()
      .eq('id', id)
      .eq('space_id', spaceId)
      .maybeSingle()
    if (error) return fail('Could not delete the rule. Try again.')
  } catch {
    return fail('Could not delete the rule. Try again.')
  }
  return ok()
}

// ── DRIP SEQUENCES: list (with steps) / create / addStep / deleteStep / toggle / delete ──────────

/** A Space's drip sequences with their ordered steps, newest sequence first. Both reads filter
 *  space_id. FAIL-SAFE to []. */
export async function listSpaceSequences(spaceId: string): Promise<SpaceDripSequence[]> {
  if (!spaceId) return []
  try {
    const seqRows = await new Promise<Row[]>((resolve) => {
      table('space_drip_sequences')
        .select(SEQ_COLS)
        .eq('space_id', spaceId)
        .order('created_at', { ascending: false })
        .then(({ data, error }) => resolve(error || !data ? [] : data))
    })
    if (seqRows.length === 0) return []

    // Load ALL steps for this Space in one query (space_id-scoped), then group by sequence. Ordered by
    // step_order so each sequence's steps read top to bottom.
    const stepRows = await new Promise<Row[]>((resolve) => {
      table('space_drip_steps')
        .select(STEP_COLS)
        .eq('space_id', spaceId)
        .order('step_order', { ascending: true })
        .then(({ data, error }) => resolve(error || !data ? [] : data))
    })
    const stepsBySeq = new Map<string, SpaceDripStep[]>()
    for (const s of stepRows) {
      const key = String(s.sequence_id)
      const list = stepsBySeq.get(key) ?? []
      list.push(mapStep(s))
      stepsBySeq.set(key, list)
    }

    return seqRows.map((r) => ({
      id: String(r.id),
      name: String(r.name ?? ''),
      audience: definitionToFilter(r.audience),
      enabled: r.enabled !== false,
      steps: stepsBySeq.get(String(r.id)) ?? [],
      createdAt: (r.created_at as string) ?? null,
    }))
  } catch {
    return []
  }
}

/** Read one sequence row PINNED to a Space (cross-space id -> null). FAIL-SAFE. */
async function readSequence(id: string, spaceId: string): Promise<Row | null> {
  try {
    const { data, error } = await table('space_drip_sequences')
      .select(SEQ_COLS)
      .eq('id', id)
      .eq('space_id', spaceId)
      .maybeSingle()
    if (error || !data) return null
    return data
  } catch {
    return null
  }
}

/** Create an (empty) drip sequence. Gated on canEditProfile. Steps are added separately. */
export async function createSpaceSequence(
  spaceId: string,
  input: { name: unknown; audience?: unknown },
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireSpaceEditor(spaceId)
  if ('error' in gate) return gate

  const name = normalizeName(input.name)
  if (!name) return fail('Give your sequence a name.')
  const audience = definitionToFilter(input.audience)

  const createdBy = await getMyProfileId()
  try {
    const { data, error } = await table('space_drip_sequences')
      .insert([{ space_id: spaceId, name, audience, created_by: createdBy }])
      .select(SEQ_COLS)
      .maybeSingle()
    if (error || !data) return fail('Could not create the sequence. Try again.')
    return ok({ id: String(data.id) })
  } catch {
    return fail('Could not create the sequence. Try again.')
  }
}

/** Add a step to a sequence. Gated on canEditProfile AND the sequence belonging to the Space (re-read
 *  pinned to space_id; the step row stamps the sequence's space_id for a direct tenancy binding). The
 *  new step is appended (step_order = current max + 1). Fail-closed. */
export async function addSequenceStep(
  spaceId: string,
  sequenceId: string,
  input: { subject: unknown; body: unknown; delayHours: unknown },
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireSpaceEditor(spaceId)
  if ('error' in gate) return gate

  const seq = await readSequence(sequenceId, spaceId)
  if (!seq) return fail('Sequence not found.')

  const valid = validateStep(input.subject, input.body, input.delayHours)
  if ('error' in valid) return fail(valid.error)

  // Compute the next step_order over THIS sequence's steps (space_id + sequence_id scoped).
  const existing = await new Promise<Row[]>((resolve) => {
    table('space_drip_steps')
      .select('step_order')
      .eq('space_id', spaceId)
      .eq('sequence_id', sequenceId)
      .order('step_order', { ascending: false })
      .then(({ data, error }) => resolve(error || !data ? [] : data))
  })
  const nextOrder =
    existing.length > 0 ? (Number(existing[0].step_order) || 0) + 1 : 1

  try {
    const { data, error } = await table('space_drip_steps')
      .insert([
        {
          sequence_id: sequenceId,
          space_id: spaceId,
          step_order: nextOrder,
          delay_hours: valid.delayHours,
          subject: valid.subject,
          body: valid.body,
        },
      ])
      .select(STEP_COLS)
      .maybeSingle()
    if (error || !data) return fail('Could not add the step. Try again.')
    return ok({ id: String(data.id) })
  } catch {
    return fail('Could not add the step. Try again.')
  }
}

/** Delete a step. Gated on canEditProfile AND the step belonging to the Space (write binds both id AND
 *  space_id). Fail-closed. */
export async function deleteSequenceStep(spaceId: string, stepId: string): Promise<ActionResult> {
  const gate = await requireSpaceEditor(spaceId)
  if ('error' in gate) return gate
  try {
    const { error } = await table('space_drip_steps')
      .delete()
      .eq('id', stepId)
      .eq('space_id', spaceId)
      .maybeSingle()
    if (error) return fail('Could not delete the step. Try again.')
  } catch {
    return fail('Could not delete the step. Try again.')
  }
  return ok()
}

/** Turn a sequence on / off. Gated on canEditProfile AND the sequence belonging to the Space. */
export async function setSpaceSequenceEnabled(
  spaceId: string,
  id: string,
  enabled: boolean,
): Promise<ActionResult> {
  const gate = await requireSpaceEditor(spaceId)
  if ('error' in gate) return gate
  try {
    const { error } = await table('space_drip_sequences')
      .update({ enabled })
      .eq('id', id)
      .eq('space_id', spaceId)
      .maybeSingle()
    if (error) return fail('Could not update the sequence. Try again.')
  } catch {
    return fail('Could not update the sequence. Try again.')
  }
  return ok()
}

/**
 * START a drip sequence over its saved audience: enroll every contact the sequence's audience resolves
 * to into the sequence, at its first step. This is the operator's manual RUNNER lever (the trigger path
 * enrolls on a CRM event; this enrolls the standing audience on demand). Gated on canEditProfile AND the
 * `crm.space.automation` entitlement (requireAutomationEditor). The sequence must belong to THIS Space
 * and be ENABLED. Each enroll is idempotent (a contact already enrolled is a no-op) and space-scoped, so
 * re-running only adds newly-matching contacts. Returns how many were newly enrolled. Fail-closed.
 */
export async function startSequenceForAudience(
  spaceId: string,
  sequenceId: string,
): Promise<ActionResult<{ enrolled: number }>> {
  const gate = await requireAutomationEditor(spaceId)
  if ('error' in gate) return gate

  const seq = await readSequence(sequenceId, spaceId)
  if (!seq) return fail('Sequence not found.')
  if (seq.enabled === false) return fail('Turn the sequence on before starting it.')

  const audience = definitionToFilter(seq.audience)
  let recipients: { contactId: string; email: string }[]
  try {
    recipients = await resolveAudience(spaceId, audience)
  } catch {
    return fail('Could not resolve the audience. Try again.')
  }
  if (recipients.length === 0) return ok({ enrolled: 0 })

  let enrolled = 0
  for (const r of recipients) {
    const res = await enrollContactInSequence(spaceId, sequenceId, r.contactId)
    if (res.enrolled) enrolled++
  }
  return ok({ enrolled })
}

// ── TEMPLATES: one-tap pre-built sequences (ADR-796) ─────────────────────────────────────────────

/** The template with this id, or null. Pure. */
export function automationTemplateById(id: string): SpaceAutomationTemplate | null {
  return SPACE_AUTOMATION_TEMPLATES.find((t) => t.id === id) ?? null
}

/**
 * INSTANTIATE a pre-built template into this Space: create its drip sequence (OFF, so the operator
 * reviews the steps before anything sends), seed the steps in order, and — for a TRIGGERED template
 * (e.g. welcome, onboarding) — wire an enabled rule that auto-enrolls the matching member when the
 * event fires. Gated on canEditProfile.
 *
 * WHY A DIRECT RULE INSERT (not createSpaceRule): a trigger->sequence rule carries only a sequenceId
 * pointer, but createSpaceRule -> validateRule REQUIRES an email subject + body (it validates a one-shot
 * 'email_audience' rule) and would reject the pointer rule. The dispatcher (fireSpaceTrigger) reads
 * action_config.sequenceId, so the rule is written straight to the table with that config.
 *
 * The SEQUENCE's enabled flag is the real on/off switch: the runner's enrollContactInSequence no-ops on
 * a disabled sequence, so even with the rule enabled, nothing enrolls until the operator turns the
 * sequence ON. That matters because the Rules panel was retired (ADR-796) — the operator never sees or
 * toggles the rule; the sequence toggle is their single, visible control.
 *
 * Idempotent by NAME: a template already added (a sequence with its name exists) is not added twice.
 * Returns the new sequence id. Fail-closed on permission; step / rule inserts are best-effort (the
 * sequence is the anchor and always lands first).
 */
export async function instantiateAutomationTemplate(
  spaceId: string,
  templateId: string,
): Promise<ActionResult<{ sequenceId: string }>> {
  const gate = await requireSpaceEditor(spaceId)
  if ('error' in gate) return gate

  const template = automationTemplateById(templateId)
  if (!template) return fail('That template is not available.')

  // Dedupe: adding the same template twice would create duplicate sequences. Match on the sequence name.
  const existing = await listSpaceSequences(spaceId)
  if (existing.some((s) => s.name === template.name)) {
    return fail('You already added this one. Find it in your sequences below.')
  }

  const createdBy = await getMyProfileId()

  // 1) The sequence, created OFF (audience defaults to everyone; the operator narrows it for a manual
  //    start, and it is irrelevant to a trigger enroll, which enrolls the specific member directly).
  let sequenceId: string
  try {
    const { data, error } = await table('space_drip_sequences')
      .insert([{ space_id: spaceId, name: template.name, audience: {}, enabled: false, created_by: createdBy }])
      .select(SEQ_COLS)
      .maybeSingle()
    if (error || !data) return fail('Could not add the sequence. Try again.')
    sequenceId = String(data.id)
  } catch {
    return fail('Could not add the sequence. Try again.')
  }

  // 2) The steps, in order (best-effort: the sequence already stands; the operator can add steps by hand
  //    if a step insert fails).
  const stepRows = template.steps.map((s, i) => ({
    sequence_id: sequenceId,
    space_id: spaceId,
    step_order: i + 1,
    delay_hours: normalizeDelayHours(s.delayHours),
    subject: normalizeSubject(s.subject),
    body: normalizeBody(s.body),
  }))
  if (stepRows.length > 0) {
    try {
      await table('space_drip_steps').insert(stepRows).then(() => undefined)
    } catch {
      /* best-effort */
    }
  }

  // 3) For a triggered template, the auto-enroll rule (ENABLED, pointing at this sequence). Written
  //    directly because validateRule would reject a sequence-pointer rule (no subject/body). Best-effort:
  //    without it the sequence still works as a manual-start sequence.
  if (template.triggerEvent) {
    try {
      await table('space_automation_rules')
        .insert([
          {
            space_id: spaceId,
            name: template.name,
            trigger_event: template.triggerEvent,
            action_type: 'email_audience',
            action_config: { sequenceId },
            enabled: true,
            created_by: createdBy,
          },
        ])
        .then(() => undefined)
    } catch {
      /* best-effort */
    }
  }

  return ok({ sequenceId })
}

/** Delete a sequence (its steps cascade via the FK). Gated on canEditProfile AND the sequence belonging
 *  to the Space. Fail-closed. */
export async function deleteSpaceSequence(spaceId: string, id: string): Promise<ActionResult> {
  const gate = await requireSpaceEditor(spaceId)
  if ('error' in gate) return gate
  try {
    const { error } = await table('space_drip_sequences')
      .delete()
      .eq('id', id)
      .eq('space_id', spaceId)
      .maybeSingle()
    if (error) return fail('Could not delete the sequence. Try again.')
  } catch {
    return fail('Could not delete the sequence. Try again.')
  }
  return ok()
}
