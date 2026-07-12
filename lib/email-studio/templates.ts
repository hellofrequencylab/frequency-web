import 'server-only'

// Email Studio (2026) Phase 3 — the TEMPLATE CRUD data layer. Reads / writes the `email_templates` table
// (id, name, description, category, block_json, subject, preheader, created_by, created_at, updated_at).
// RLS is deny-all on that table, so every call goes through the typed SERVICE-ROLE admin client and is only
// ever invoked BEHIND the admin guard (see app/(main)/admin/email-studio/template-actions.ts). Pure data
// access: no auth checks here (the server actions gate), no React. Rows map to the shared `EmailTemplate`
// contract (lib/email-studio/types.ts).

import { createAdminClient } from '@/lib/supabase/admin'
import { sanitizeEntityLayout, type EntityLayout } from '@/lib/entity-blocks/layout'
import type { Database, Json } from '@/lib/database.types'
import type { EmailTemplate } from './types'
import { EMAIL_PRESETS } from './presets'

type Row = Database['public']['Tables']['email_templates']['Row']

/** Map a DB row to the camelCase `EmailTemplate` contract. `block_json` is re-sanitized for kind `'email'`
 *  on read, so a stored blob can never render a wrong-kind or retired block. */
function toTemplate(row: Row): EmailTemplate {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    blockJson: sanitizeEntityLayout(row.block_json, 'email') ?? {},
    subject: row.subject,
    preheader: row.preheader,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** Trim a string, or null when blank / absent (keeps optional text columns sparse). */
function orNull(v: string | null | undefined): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length ? t : null
}

// ── Reads ────────────────────────────────────────────────────────────────────────────────────────────────

/** Every saved template, newest first. */
export async function listEmailTemplates(): Promise<EmailTemplate[]> {
  const db = createAdminClient()
  const { data, error } = await db
    .from('email_templates')
    .select('*')
    .order('created_at', { ascending: false })
  if (error || !data) return []
  return data.map(toTemplate)
}

/** One template by id, or null when it does not exist. */
export async function getEmailTemplate(id: string): Promise<EmailTemplate | null> {
  const db = createAdminClient()
  const { data, error } = await db.from('email_templates').select('*').eq('id', id).maybeSingle()
  if (error || !data) return null
  return toTemplate(data)
}

// ── Writes ───────────────────────────────────────────────────────────────────────────────────────────────

export interface CreateEmailTemplateInput {
  name: string
  description?: string | null
  category?: string | null
  /** The template body. Sanitized to a valid email layout before it is stored. */
  blockJson: EntityLayout
  subject?: string | null
  preheader?: string | null
  createdBy?: string | null
}

/** Create a template. The body is sanitized (kind `'email'`) before storage so only valid, email-safe blocks
 *  persist. Returns the created `EmailTemplate`, or null on a write error. */
export async function createEmailTemplate(input: CreateEmailTemplateInput): Promise<EmailTemplate | null> {
  const db = createAdminClient()
  const block = (sanitizeEntityLayout(input.blockJson, 'email') ?? {}) as unknown as Json
  const { data, error } = await db
    .from('email_templates')
    .insert({
      name: input.name.trim(),
      description: orNull(input.description),
      category: orNull(input.category),
      block_json: block,
      subject: orNull(input.subject),
      preheader: orNull(input.preheader),
      created_by: input.createdBy ?? null,
    })
    .select('*')
    .maybeSingle()
  if (error || !data) return null
  return toTemplate(data)
}

export interface UpdateEmailTemplateInput {
  name?: string
  description?: string | null
  category?: string | null
  blockJson?: EntityLayout
  subject?: string | null
  preheader?: string | null
}

/** Patch a template. Only the provided fields change; `updated_at` is bumped. A patched body is re-sanitized.
 *  Returns the updated `EmailTemplate`, or null on error / unknown id. */
export async function updateEmailTemplate(
  id: string,
  patch: UpdateEmailTemplateInput,
): Promise<EmailTemplate | null> {
  const db = createAdminClient()
  const update: Database['public']['Tables']['email_templates']['Update'] = {
    updated_at: new Date().toISOString(),
  }
  if (patch.name !== undefined) update.name = patch.name.trim()
  if (patch.description !== undefined) update.description = orNull(patch.description)
  if (patch.category !== undefined) update.category = orNull(patch.category)
  if (patch.subject !== undefined) update.subject = orNull(patch.subject)
  if (patch.preheader !== undefined) update.preheader = orNull(patch.preheader)
  if (patch.blockJson !== undefined) {
    update.block_json = (sanitizeEntityLayout(patch.blockJson, 'email') ?? {}) as unknown as Json
  }
  const { data, error } = await db
    .from('email_templates')
    .update(update)
    .eq('id', id)
    .select('*')
    .maybeSingle()
  if (error || !data) return null
  return toTemplate(data)
}

/** Delete a template by id. Returns whether the delete succeeded. */
export async function deleteEmailTemplate(id: string): Promise<boolean> {
  const db = createAdminClient()
  const { error } = await db.from('email_templates').delete().eq('id', id)
  return !error
}

// ── Seeding the pre-written presets ─────────────────────────────────────────────────────────────────────

export interface SeedPresetsResult {
  created: number
  skipped: number
  /** The names that were newly inserted this run. */
  createdNames: string[]
}

/**
 * Idempotently seed the pre-written presets (lib/email-studio/presets.ts): insert any preset whose NAME is
 * not already a saved template, skip the rest. Re-running never duplicates. Each preset body is sanitized on
 * insert (via createEmailTemplate). `createdBy` stamps the seeding operator when supplied.
 */
export async function seedEmailPresets(createdBy?: string | null): Promise<SeedPresetsResult> {
  const existing = await listEmailTemplates()
  const existingNames = new Set(existing.map((t) => t.name))
  let created = 0
  let skipped = 0
  const createdNames: string[] = []
  for (const preset of EMAIL_PRESETS) {
    if (existingNames.has(preset.name)) {
      skipped++
      continue
    }
    const row = await createEmailTemplate({
      name: preset.name,
      description: preset.description,
      category: preset.category,
      blockJson: preset.blockJson,
      subject: preset.subject,
      preheader: preset.preheader,
      createdBy: createdBy ?? null,
    })
    if (row) {
      created++
      createdNames.push(preset.name)
    } else {
      skipped++
    }
  }
  return { created, skipped, createdNames }
}
