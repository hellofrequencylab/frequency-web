'use server'

// Email Studio (2026) Phase 3 — the TEMPLATE server actions. Thin, gated entrypoints over the templates CRUD
// lib (lib/email-studio/templates.ts) plus the "start a draft from a template" bridge into `campaigns`. Every
// action self-gates through the Beta CONTENT-WRITER gate (lib/beta/guard.ts writerGate): a staff web_role or
// the marketing capability at write. These are DRAFT / prepare operations, nothing is armed or sent here.
// Each returns an ActionResult the client can surface.

import type { ActionResult } from '@/lib/action-result'
import { ok, fail } from '@/lib/action-result'
import { writerGate } from '@/lib/beta/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { sanitizeEntityLayout, type EntityLayout } from '@/lib/entity-blocks/layout'
import { renderEmailLayout } from '@/lib/email-studio/render'
import type { EmailTemplate } from '@/lib/email-studio/types'
import type { Json } from '@/lib/database.types'
import {
  listEmailTemplates,
  createEmailTemplate,
  deleteEmailTemplate,
  seedEmailPresets,
  getEmailTemplate,
  type SeedPresetsResult,
} from '@/lib/email-studio/templates'

// ── Read ─────────────────────────────────────────────────────────────────────────────────────────────────

/** List every saved template (newest first). Gated: an operator surface. */
export async function listTemplatesAction(): Promise<ActionResult<EmailTemplate[]>> {
  const gate = await writerGate()
  if (!gate.ok) return fail(gate.error)
  return ok(await listEmailTemplates())
}

// ── Save as template ─────────────────────────────────────────────────────────────────────────────────────

/** Save a template FROM a raw authored layout (the composer's current doc). */
export interface SaveLayoutAsTemplateInput {
  layout: EntityLayout
  name: string
  subject?: string | null
  preheader?: string | null
  category?: string | null
  description?: string | null
}

/**
 * Save the current email as a reusable template. Two modes:
 *   • pass a CAMPAIGN ID (string) — copies that campaign's block_json / subject / preheader into a template;
 *   • pass a `{ layout, subject, preheader, name, ... }` object — saves an arbitrary authored layout.
 * The body is sanitized (kind `'email'`) inside the lib before storage. Returns the created template.
 */
export async function saveAsTemplateAction(
  input: string | SaveLayoutAsTemplateInput,
): Promise<ActionResult<EmailTemplate>> {
  const gate = await writerGate()
  if (!gate.ok) return fail(gate.error)

  if (typeof input === 'string') {
    const db = createAdminClient()
    const { data: campaign, error } = await db
      .from('campaigns')
      .select('subject, preheader, block_json')
      .eq('id', input)
      .maybeSingle()
    if (error || !campaign) return fail('That campaign no longer exists.')
    const layout = sanitizeEntityLayout(campaign.block_json, 'email')
    if (!layout) return fail('That campaign has no email layout to save yet.')
    const created = await createEmailTemplate({
      name: campaign.subject?.trim() || 'Untitled template',
      subject: campaign.subject ?? null,
      preheader: campaign.preheader ?? null,
      category: 'Saved',
      blockJson: layout,
      createdBy: gate.profileId,
    })
    if (!created) return fail('Could not save the template. Try again.')
    return ok(created)
  }

  if (!input.name?.trim()) return fail('Give the template a name.')
  const layout = sanitizeEntityLayout(input.layout, 'email')
  if (!layout) return fail('There is nothing to save yet. Add a block or two first.')
  const created = await createEmailTemplate({
    name: input.name,
    subject: input.subject ?? null,
    preheader: input.preheader ?? null,
    category: input.category ?? 'Saved',
    description: input.description ?? null,
    blockJson: layout,
    createdBy: gate.profileId,
  })
  if (!created) return fail('Could not save the template. Try again.')
  return ok(created)
}

// ── Seed the pre-written presets ─────────────────────────────────────────────────────────────────────────

/** Idempotently load the pre-written presets (skips any already saved by name). Gated. */
export async function seedPresetsAction(): Promise<ActionResult<SeedPresetsResult>> {
  const gate = await writerGate()
  if (!gate.ok) return fail(gate.error)
  return ok(await seedEmailPresets(gate.profileId))
}

// ── Delete ───────────────────────────────────────────────────────────────────────────────────────────────

/** Delete a saved template by id. Gated. */
export async function deleteTemplateAction(id: string): Promise<ActionResult> {
  const gate = await writerGate()
  if (!gate.ok) return fail(gate.error)
  const okDelete = await deleteEmailTemplate(id)
  if (!okDelete) return fail('Could not delete that template.')
  return ok()
}

// ── Start a draft from a template ────────────────────────────────────────────────────────────────────────

/**
 * Create a `campaigns` DRAFT seeded from a template: copy the template's block_json (the email body), its
 * subject + preheader, and a rendered plain-text `body` fallback. The new campaign starts as an unsent,
 * unapproved draft owned by the operator. Returns the new campaign id for the workspace to open / select.
 */
export async function startDraftFromTemplateAction(
  templateId: string,
): Promise<ActionResult<{ campaignId: string }>> {
  const gate = await writerGate()
  if (!gate.ok) return fail(gate.error)

  const template = await getEmailTemplate(templateId)
  if (!template) return fail('That template no longer exists.')

  const layout = sanitizeEntityLayout(template.blockJson, 'email') ?? {}
  const { text } = renderEmailLayout(layout)
  const subject = template.subject?.trim() || template.name

  const db = createAdminClient()
  const { data, error } = await db
    .from('campaigns')
    .insert({
      subject,
      preheader: template.preheader,
      body: text || subject,
      block_json: layout as unknown as Json,
      status: 'draft',
      approval_status: 'draft',
      created_by: gate.profileId,
    })
    .select('id')
    .maybeSingle()
  if (error || !data) return fail('Could not start a draft from that template.')
  return ok({ campaignId: String(data.id) })
}
