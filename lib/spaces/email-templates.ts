// REUSABLE EMAIL TEMPLATES for Space campaigns (ADR-380). A template is a saved, named subject + body
// a Space owner reuses to PREFILL the composer. This module is the per-Space analog of
// lib/spaces/campaigns.ts: pure validation helpers (no Supabase/Next imports, unit-testable), a thin IO
// layer of untyped admin-client reads/writes over the `space_email_templates` table (not in the
// generated DB types yet, ADR-246), and the action IMPLEMENTATIONS as plain async functions. NO
// 'use server' directive (so it can also export the pure helpers + types); the thin 'use server'
// wrappers live in lib/spaces/email-templates-actions.ts.
//
// TENANCY + AUTHZ (ADR-246/328/329). A Space A caller never sees or edits Space B's templates: every
// READ filters `space_id = spaceId`, and every single-row read ALSO filters space_id so a cross-space id
// leaks nothing. WRITES are gated on canEditProfile (owner / admin / editor) and bind both id AND
// space_id. Reads FAIL-SAFE (empty / null); writes FAIL-CLOSED on a permission miss. The subject/body
// are normalized with the SAME caps as the campaign composer (normalizeSubject / normalizeBody) so a
// template can never carry a value the composer would reject.

import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { getSpaceById } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { normalizeSubject, normalizeBody } from '@/lib/spaces/campaigns'

// ── Types ─────────────────────────────────────────────────────────────────────────────────────

/** One saved template as the app consumes it (camelCased). subject/body are plain text (the composer
 *  prefills from them). */
export interface SpaceEmailTemplate {
  id: string
  name: string
  subject: string
  body: string
  createdAt: string | null
}

const MAX_NAME_LEN = 80

// ── PURE: validation / normalization (no IO, testable) ──────────────────────────────────────────

/** Trim + length-cap a template name; returns '' if absent / blank (the caller rejects an empty name
 *  on create). Pure. */
export function normalizeTemplateName(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().slice(0, MAX_NAME_LEN) : ''
}

/** Validate a create/update payload. Returns the trimmed name + the composer-normalized subject/body,
 *  or an error string if the name is blank. Pure: the single place "what makes a valid template" is
 *  decided, so the action and the tests agree. */
export function validateTemplate(
  name: unknown,
  subject: unknown,
  body: unknown,
): { name: string; subject: string; body: string } | { error: string } {
  const cleanName = normalizeTemplateName(name)
  if (!cleanName) return { error: 'Give your template a name.' }
  return { name: cleanName, subject: normalizeSubject(subject), body: normalizeBody(body) }
}

// ── IO: the untyped admin-client seam (space_email_templates not in generated types yet, ADR-246) ──

type TemplateRow = {
  id: string
  name: string
  subject: string | null
  body: string | null
  created_at: string | null
}

type TemplateQuery = {
  select: (cols: string) => TemplateQuery
  eq: (col: string, val: string) => TemplateQuery
  order: (col: string, opts: { ascending: boolean }) => TemplateQuery
  insert: (rows: Record<string, unknown>[]) => TemplateQuery
  update: (patch: Record<string, unknown>) => TemplateQuery
  delete: () => TemplateQuery
  maybeSingle: () => Promise<{ data: TemplateRow | null; error: unknown }>
  then: (resolve: (r: { data: TemplateRow[] | null; error: unknown }) => unknown) => Promise<unknown>
}

const TEMPLATE_COLS = 'id, name, subject, body, created_at, space_id'

/** The untyped `space_email_templates` query builder (table not in the generated types yet). */
function templatesTable(): TemplateQuery {
  const db = createAdminClient() as unknown as { from: (t: string) => TemplateQuery }
  return db.from('space_email_templates')
}

/** Map a DB row to a typed SpaceEmailTemplate. */
function mapTemplate(r: TemplateRow): SpaceEmailTemplate {
  return {
    id: r.id,
    name: r.name,
    subject: r.subject ?? '',
    body: r.body ?? '',
    createdAt: r.created_at ?? null,
  }
}

/** Read one template by id, PINNED to a Space (so a cross-space id resolves to null). Service-role;
 *  FAIL-SAFE to null. */
async function readTemplate(id: string, spaceId: string): Promise<TemplateRow | null> {
  try {
    const { data, error } = await templatesTable()
      .select(TEMPLATE_COLS)
      .eq('id', id)
      .eq('space_id', spaceId)
      .maybeSingle()
    if (error || !data) return null
    return data
  } catch {
    return null
  }
}

/**
 * A Space's saved templates, newest first. Filters space_id, so it only ever returns THIS Space's
 * templates. Service-role; the CALLER gates authorization. FAIL-SAFE to [].
 */
export async function listSpaceEmailTemplates(spaceId: string): Promise<SpaceEmailTemplate[]> {
  if (!spaceId) return []
  try {
    return await new Promise<SpaceEmailTemplate[]>((resolve) => {
      templatesTable()
        .select(TEMPLATE_COLS)
        .eq('space_id', spaceId)
        .order('created_at', { ascending: false })
        .then(({ data, error }) => {
          if (error || !data) return resolve([])
          resolve(data.map(mapTemplate))
        })
    })
  } catch {
    return []
  }
}

// ── Shared authz: resolve the Space + the editor gate in one place ──────────────────────────────

/** Resolve a Space and check the caller may EDIT it (owner / admin / editor). */
async function requireSpaceEditor(spaceId: string): Promise<{ ok: true } | ActionResult<never>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to manage your templates.')
  const space = await getSpaceById(spaceId)
  if (!space) return fail('Space not found.')
  const caps = await getSpaceCapabilities(space, profileId)
  if (!caps.canEditProfile)
    return fail('You do not have permission to manage templates for this space.')
  return { ok: true }
}

// ── ACTION IMPLEMENTATIONS (gated + validated server-side; wrapped by email-templates-actions.ts) ──

/**
 * Save a named template in a Space. Gated on canEditProfile. Requires a non-empty name; subject/body
 * may be empty. Stamps space_id. Returns the new template id. Fail-closed on permission / validation.
 */
export async function createSpaceEmailTemplate(
  spaceId: string,
  name: unknown,
  subject: unknown,
  body: unknown,
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireSpaceEditor(spaceId)
  if ('error' in gate) return gate

  const valid = validateTemplate(name, subject, body)
  if ('error' in valid) return fail(valid.error)

  try {
    const { data, error } = await templatesTable()
      .insert([{ space_id: spaceId, name: valid.name, subject: valid.subject, body: valid.body }])
      .select(TEMPLATE_COLS)
      .maybeSingle()
    if (error || !data) return fail('Could not save the template. Try again.')
    return ok({ id: data.id })
  } catch {
    return fail('Could not save the template. Try again.')
  }
}

/**
 * Rename / re-save a template's subject + body. Gated on canEditProfile AND the template belonging to
 * the Space (re-read pinned to space_id; the write binds both id AND space_id). Fail-closed.
 */
export async function updateSpaceEmailTemplate(
  spaceId: string,
  id: string,
  name: unknown,
  subject: unknown,
  body: unknown,
): Promise<ActionResult> {
  const gate = await requireSpaceEditor(spaceId)
  if ('error' in gate) return gate

  const existing = await readTemplate(id, spaceId)
  if (!existing) return fail('Template not found.')

  const valid = validateTemplate(name, subject, body)
  if ('error' in valid) return fail(valid.error)

  try {
    const { error } = await templatesTable()
      .update({
        name: valid.name,
        subject: valid.subject,
        body: valid.body,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('space_id', spaceId)
      .maybeSingle()
    if (error) return fail('Could not save the template. Try again.')
  } catch {
    return fail('Could not save the template. Try again.')
  }
  return ok()
}

/**
 * Delete a template. Gated on canEditProfile AND the template belonging to the Space (the write binds
 * both id AND space_id, so a cross-space id is a no-op). Fail-closed.
 */
export async function deleteSpaceEmailTemplate(spaceId: string, id: string): Promise<ActionResult> {
  const gate = await requireSpaceEditor(spaceId)
  if ('error' in gate) return gate

  const existing = await readTemplate(id, spaceId)
  if (!existing) return fail('Template not found.')

  try {
    const { error } = await templatesTable()
      .delete()
      .eq('id', id)
      .eq('space_id', spaceId)
      .maybeSingle()
    if (error) return fail('Could not delete the template. Try again.')
  } catch {
    return fail('Could not delete the template. Try again.')
  }
  return ok()
}
