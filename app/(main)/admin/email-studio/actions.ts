'use server'

// EMAIL STUDIO — Phase 2 server actions (the two-pane Campaign Workspace).
//
// These are the read + write seams the client workspace (components/admin/email-studio/*) calls. An email
// REUSES the unified entity-block model: a campaign's body lives in `campaigns.block_json` as an
// `EntityLayout` (kind 'email'), edited by the SAME arranger the Space page builder uses, and compiled to
// send-ready HTML by lib/email-studio (render + shell). Subject + preheader live alongside on the row.
//
// GATES (mirrors the Beta Command Center spine):
//   • READS  — requireAdmin('admin', { staff: 'marketing', staffLevel: 'read' }); a read-only marketer or
//     any staff web_role may browse + preview.
//   • WRITES — writerGate() (a staff web_role OR the marketing capability at WRITE). Create / save / delete /
//     test-send are drafting acts, so they take the writer gate, never the approver gate. A TEST send is not
//     the real send: it delivers ONE copy to the operator's own address and touches no list.
// Never trusts the wire: every layout write is re-sanitized (sanitizeEntityLayout, kind 'email') server-side.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/database.types'
import { getCachedUser } from '@/lib/auth'
import { requireAdmin } from '@/lib/admin/guard'
import { writerGate } from '@/lib/beta/guard'
import {
  parseEntityLayout,
  sanitizeEntityLayout,
  starterRows,
  type EntityLayout,
} from '@/lib/entity-blocks/layout'
import type { BuilderLayout } from '@/lib/entity-blocks/rows-ops'
import { compileEmailDoc } from '@/lib/email-studio/shell'
import { applyMergeTags } from '@/lib/email-studio/render'
import { MERGE_TAG_VARIABLES, MERGE_TAG_DEFAULT_FALLBACKS } from '@/lib/email-studio/types'
import { sendRawEmail } from '@/lib/email'
import { type ActionResult, ok, fail } from '@/lib/action-result'

/** One campaign card for the left rail. `updatedAt` sources `created_at` (the campaigns table carries no
 *  updated_at column); it drives the "created" timestamp shown on each card. */
export interface EmailCampaignCard {
  id: string
  subject: string
  status: string
  updatedAt: string
}

/** The loaded email a card opens into the editor: the block layout plus subject + preheader. */
export interface LoadedEmailCampaign {
  id: string
  subject: string
  preheader: string
  layout: EntityLayout
}

/** A fresh EMAIL layout (kind 'email') seeded from the `basic` starter — the shape a new draft is born with. */
function starterEmailLayout(): EntityLayout {
  return { rows: starterRows('email', 'basic') }
}

/** Read + parse a campaign's stored block_json into an EntityLayout, falling back to the basic starter when
 *  the row has never been arranged (or the blob is unusable). Fail-safe + total. */
function layoutFromBlockJson(blockJson: unknown): EntityLayout {
  const parsed = parseEntityLayout(blockJson)
  return parsed ?? starterEmailLayout()
}

/** The example merge values used to fill a PREVIEW / TEST send so `{{ contact.first_name }}` reads naturally
 *  instead of showing the raw token. */
function exampleMergeVars(): Record<string, string> {
  return Object.fromEntries(MERGE_TAG_VARIABLES.map((v) => [v.token, v.example]))
}

/**
 * List recent campaigns for the workspace left rail (id, subject, status, created time). Read-gated. Newest
 * first, capped so the rail stays light.
 */
export async function listEmailCampaigns(): Promise<EmailCampaignCard[]> {
  await requireAdmin('admin', { staff: 'marketing', staffLevel: 'read' })
  const db = createAdminClient()
  const { data, error } = await db
    .from('campaigns')
    .select('id, subject, status, created_at')
    .order('created_at', { ascending: false })
    .limit(50)
  if (error || !data) return []
  return data.map((row) => ({
    id: row.id,
    subject: row.subject ?? '',
    status: row.status ?? 'draft',
    updatedAt: row.created_at,
  }))
}

/**
 * Create a new email DRAFT: a campaigns row seeded with the basic email starter layout in block_json, an
 * empty subject/body, and status 'draft'. Writer-gated. Returns the new id (the workspace selects it).
 */
export async function createEmailDraft(): Promise<ActionResult<{ id: string }>> {
  const gate = await writerGate()
  if (!gate.ok) return fail(gate.error)

  const layout = starterEmailLayout()
  const db = createAdminClient()
  const { data, error } = await db
    .from('campaigns')
    .insert({
      // block_json is the source of truth for the body; `body` is a NOT NULL legacy column, seeded empty.
      block_json: layout as unknown as never,
      body: '',
      subject: '',
      preheader: '',
      status: 'draft',
      created_by: gate.profileId,
    })
    .select('id')
    .single()
  if (error || !data) return fail('Could not create a new email. Try again.')

  revalidatePath('/admin/beta')
  return ok({ id: data.id })
}

/**
 * Load one campaign into the editor: subject + preheader off the row, and the block layout parsed from
 * block_json (basic starter when unset). Read-gated. Returns null when the row is gone.
 */
export async function loadEmailCampaign(id: string): Promise<LoadedEmailCampaign | null> {
  await requireAdmin('admin', { staff: 'marketing', staffLevel: 'read' })
  const db = createAdminClient()
  const { data, error } = await db
    .from('campaigns')
    .select('id, subject, preheader, block_json')
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return null
  return {
    id: data.id,
    subject: data.subject ?? '',
    preheader: data.preheader ?? '',
    layout: layoutFromBlockJson(data.block_json),
  }
}

/**
 * Persist a campaign's block layout and/or subject/preheader. This is the arranger's injected `save` (the
 * debounce lives in the shared store) AND the compose fields' save. Writer-gated; the layout is re-sanitized
 * (kind 'email') server-side, never trusted from the wire. When the layout changes it also refreshes the
 * cached compiled_html so a later send / preview has send-ready HTML on hand. Returns `{ error? }` (the shape
 * the store's debounced flush expects).
 */
export async function saveEmailCampaign(
  id: string,
  patch: { layout?: BuilderLayout | EntityLayout; subject?: string; preheader?: string },
): Promise<{ error?: string }> {
  const gate = await writerGate()
  if (!gate.ok) return { error: gate.error }

  const db = createAdminClient()
  const update: Database['public']['Tables']['campaigns']['Update'] = {}

  if (typeof patch.subject === 'string') update.subject = patch.subject.slice(0, 300)
  if (typeof patch.preheader === 'string') update.preheader = patch.preheader.slice(0, 300)

  if (patch.layout) {
    const clean = sanitizeEntityLayout(patch.layout as EntityLayout, 'email')
    const layout = clean ?? starterEmailLayout()
    update.block_json = layout as unknown as never
    // Refresh the cached send-ready HTML from the freshest subject/preheader (this patch, else the row).
    try {
      const { data: row } = await db
        .from('campaigns')
        .select('subject, preheader')
        .eq('id', id)
        .maybeSingle()
      const subject = typeof patch.subject === 'string' ? patch.subject : (row?.subject ?? '')
      const preheader = typeof patch.preheader === 'string' ? patch.preheader : (row?.preheader ?? '')
      const { html } = compileEmailDoc({ layout, subject, preheader })
      update.compiled_html = html
    } catch {
      // Compilation is best-effort caching; a failure never blocks the save of block_json.
    }
  }

  if (Object.keys(update).length === 0) return {}

  const { error } = await db.from('campaigns').update(update).eq('id', id)
  if (error) return { error: 'Could not save your email. Try again.' }

  revalidatePath('/admin/beta')
  return {}
}

/**
 * Compile a layout + subject + preheader to send-ready HTML for the preview iframe, with example merge
 * values filled in (so tokens read naturally). Read-gated. Pure compile — writes nothing. The client
 * preview compiles live in-browser; this is the server fallback / on-demand render.
 */
export async function renderEmailPreview(
  layout: EntityLayout,
  subject: string,
  preheader: string,
): Promise<{ html: string }> {
  await requireAdmin('admin', { staff: 'marketing', staffLevel: 'read' })
  // Sanitize the wire layout (kind 'email') before compiling, so the preview shows exactly what would send.
  const clean = sanitizeEntityLayout(layout, 'email') ?? starterEmailLayout()
  const { html } = compileEmailDoc({ layout: clean, subject, preheader })
  const filled = applyMergeTags(html, exampleMergeVars(), { fallbacks: MERGE_TAG_DEFAULT_FALLBACKS })
  return { html: filled }
}

/**
 * TEST send: deliver ONE copy of the campaign to the signed-in operator's own address. Writer-gated. Compiles
 * via compileEmailDoc, applies merge tags with EXAMPLE values, and sends a single email through sendRawEmail.
 * Never sends to a list, never clears the approval gate; records test_sent_at so the lifecycle UI can show
 * "tested".
 */
export async function sendTestEmail(id: string): Promise<ActionResult<{ to: string }>> {
  const gate = await writerGate()
  if (!gate.ok) return fail(gate.error)

  const to = (await getCachedUser())?.email ?? null
  if (!to) return fail('We could not find an email on your account to send the test to.')

  const db = createAdminClient()
  const { data, error } = await db
    .from('campaigns')
    .select('subject, preheader, block_json')
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return fail('That email no longer exists.')

  const layout = layoutFromBlockJson(data.block_json)
  const doc = { layout, subject: data.subject ?? '', preheader: data.preheader ?? '' }
  const compiled = compileEmailDoc(doc)
  if (!compiled.html.trim()) return fail('Add some content before sending a test.')

  const vars = exampleMergeVars()
  const fallbacks = MERGE_TAG_DEFAULT_FALLBACKS
  const subject = applyMergeTags(compiled.subject || 'Your email', vars, { fallbacks, escape: false })
  const html = applyMergeTags(compiled.html, vars, { fallbacks })
  const text = applyMergeTags(compiled.text, vars, { fallbacks, escape: false })

  await sendRawEmail({ to, subject: `[Test] ${subject}`, html, text })
  await db.from('campaigns').update({ test_sent_at: new Date().toISOString() }).eq('id', id)

  revalidatePath('/admin/beta')
  return ok({ to })
}

/**
 * Delete a DRAFT email. Writer-gated, and restricted to status 'draft' so a scheduled / sent campaign can
 * never be removed here.
 */
export async function deleteEmailDraft(id: string): Promise<ActionResult> {
  const gate = await writerGate()
  if (!gate.ok) return fail(gate.error)

  const db = createAdminClient()
  const { error } = await db.from('campaigns').delete().eq('id', id).eq('status', 'draft')
  if (error) return fail('Could not delete this draft. Try again.')

  revalidatePath('/admin/beta')
  return ok()
}
