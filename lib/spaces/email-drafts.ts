'use server'

// PER-SPACE BLOCK-EMAIL DRAFTS (Email in the Business CRM, P1 · deliverable 2 — the Marketing editor's data
// seam). The space-scoped analog of app/(main)/admin/email-studio/actions.ts: the read + write actions behind
// the Marketing tab's rich, on-canvas WYSIWYG email editor. A block email REUSES the unified entity-block
// model exactly like the admin Email Studio — its body lives in `campaigns.block_json` as an EntityLayout
// (kind 'email'), edited by the SAME arranger (EmailCanvasEditor) and compiled to send-ready HTML by
// lib/email-studio (render + shell). We do NOT fork a second email engine; we point the one engine at a
// Space's own `campaigns` rows and seed its palette from the Space brand (spaceEmailColors).
//
// SEPARATION from the plain-text campaign composer (lib/spaces/campaigns.ts): that surface stores a campaign's
// body as PLAIN TEXT in `campaigns.body`; THIS surface stores a block layout in `campaigns.block_json`. So the
// Marketing list filters to rows WITH a block_json (`block_json is not null`), and every create here stamps
// one. The two never clobber each other's body representation. (Bulk SEND of a block draft is a follow-up —
// the plain composer remains the send path today; here test-send to self works end to end.)
//
// TENANCY + AUTHZ (ADR-246/328/329, mirrors campaigns.ts). Every READ + WRITE filters `space_id = spaceId`, so
// a cross-space id leaks nothing. READS are gated on canEditProfile OR a platform janitor previewing (fail-safe
// to [] / null); WRITES are gated on canEditProfile and re-validate the row belongs to the Space (fail-closed).
// The `campaigns.space_id` column is not in the generated types yet, so this module reaches the table through
// the untyped admin client (ADR-246), the same convention campaigns.ts uses.

import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId, getCallerProfile, getCachedUser } from '@/lib/auth'
import { getSpaceById } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { isJanitor } from '@/lib/core/roles'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import {
  parseEntityLayout,
  sanitizeEntityLayout,
  starterRows,
  type EntityLayout,
} from '@/lib/entity-blocks/layout'
import type { BuilderLayout } from '@/lib/entity-blocks/rows-ops'
import { compileEmailDoc, type EmailBrand } from '@/lib/email-studio/shell'
import { applyMergeTags, sanitizeEmailRichContent } from '@/lib/email-studio/render'
import { MERGE_TAG_VARIABLES, MERGE_TAG_DEFAULT_FALLBACKS } from '@/lib/email-studio/types'
import { sendRawEmail } from '@/lib/email'
import { spaceEmailColors } from '@/lib/spaces/email-colors'
import type { Space } from '@/lib/spaces/types'
import type {
  EmailCampaignCard,
  LoadedEmailCampaign,
} from '@/app/(main)/admin/email-studio/actions'

// ── The untyped `campaigns` seam (space_id/block_json not fully in the generated types) ──────────────────────

const DRAFT_COLS = 'id, subject, preheader, block_json, status, space_id, created_at'

type DraftRow = {
  id: string
  subject: string | null
  preheader: string | null
  block_json: unknown
  status: string | null
  space_id: string | null
  created_at: string
}

type DraftQuery = {
  select: (cols: string) => DraftQuery
  eq: (col: string, val: string) => DraftQuery
  not: (col: string, op: string, val: null) => DraftQuery
  order: (col: string, opts: { ascending: boolean }) => DraftQuery
  limit: (n: number) => DraftQuery
  insert: (rows: Record<string, unknown>[]) => DraftQuery
  update: (patch: Record<string, unknown>) => DraftQuery
  delete: () => DraftQuery
  maybeSingle: () => Promise<{ data: DraftRow | null; error: unknown }>
  then: (resolve: (r: { data: DraftRow[] | null; error: unknown }) => unknown) => Promise<unknown>
}

function campaignsTable(): DraftQuery {
  const db = createAdminClient() as unknown as { from: (t: string) => DraftQuery }
  return db.from('campaigns')
}

/** A fresh EMAIL layout (kind 'email') seeded from the `basic` starter — the shape a new draft is born with. */
function starterEmailLayout(): EntityLayout {
  return { rows: starterRows('email', 'basic') }
}

/** Parse a row's block_json into an EntityLayout, falling back to the basic starter when unusable. */
function layoutFromBlockJson(blockJson: unknown): EntityLayout {
  return parseEntityLayout(blockJson) ?? starterEmailLayout()
}

/** The example merge values used to fill a PREVIEW / TEST send so tokens read naturally. */
function exampleMergeVars(): Record<string, string> {
  return Object.fromEntries(MERGE_TAG_VARIABLES.map((v) => [v.token, v.example]))
}

/** The email BRAND for a Space: its own palette (spaceEmailColors), wordmark, and logo, so a Space's emails
 *  render in the Space's identity, not the platform default. An http(s) logo only (a mail client cannot load a
 *  relative or data URL reliably). */
function spaceBrand(space: Space): EmailBrand {
  const logoUrl = typeof space.brandLogoUrl === 'string' && /^https?:\/\//.test(space.brandLogoUrl)
    ? space.brandLogoUrl
    : undefined
  return {
    colors: spaceEmailColors(space),
    wordmark: space.brandName ?? space.name,
    logoUrl,
  }
}

// ── Shared authz ─────────────────────────────────────────────────────────────────────────────────────────

/** Resolve a Space + check the caller may EDIT it (owner / admin / editor). Returns the Space on success or an
 *  ActionResult error. Centralizes the write gate so every mutation fails closed identically. */
async function requireSpaceEditor(
  spaceId: string,
): Promise<{ ok: true; space: Space } | { ok: false; error: string }> {
  const profileId = await getMyProfileId()
  if (!profileId) return { ok: false, error: 'Sign in to manage your emails.' }
  const space = await getSpaceById(spaceId)
  if (!space) return { ok: false, error: 'Space not found.' }
  const caps = await getSpaceCapabilities(space, profileId)
  if (!caps.canEditProfile)
    return { ok: false, error: 'You do not have permission to manage emails for this space.' }
  return { ok: true, space }
}

/** Read one draft pinned to a Space (a cross-space id resolves to null). Service-role; fail-safe to null. */
async function readDraft(id: string, spaceId: string): Promise<DraftRow | null> {
  try {
    const { data, error } = await campaignsTable()
      .select(DRAFT_COLS)
      .eq('id', id)
      .eq('space_id', spaceId)
      .maybeSingle()
    if (error || !data) return null
    return data
  } catch {
    return null
  }
}

// ── PUBLIC SERVER ACTIONS ────────────────────────────────────────────────────────────────────────────────

/**
 * List a Space's block-email drafts for the Marketing editor's left rail, newest first. Gated on canEditProfile
 * OR a platform janitor previewing. Filters `space_id = spaceId` AND `block_json is not null` (so the plain-text
 * campaign composer's rows never appear here). FAIL-SAFE to [].
 */
export async function listSpaceEmailDrafts(spaceId: string): Promise<EmailCampaignCard[]> {
  const caller = await getCallerProfile()
  const space = await getSpaceById(spaceId)
  if (!space) return []
  const caps = await getSpaceCapabilities(space, caller?.id ?? null)
  if (!caps.canEditProfile && !isJanitor(caller?.webRole)) return []
  try {
    return await new Promise<EmailCampaignCard[]>((resolve) => {
      campaignsTable()
        .select(DRAFT_COLS)
        .eq('space_id', spaceId)
        .not('block_json', 'is', null)
        .order('created_at', { ascending: false })
        .limit(50)
        .then(({ data, error }) => {
          if (error || !data) return resolve([])
          resolve(
            data.map((r) => ({
              id: r.id,
              subject: r.subject ?? '',
              status: r.status ?? 'draft',
              updatedAt: r.created_at,
            })),
          )
        })
    })
  } catch {
    return []
  }
}

/**
 * Create a new block-email DRAFT in a Space: a campaigns row seeded with the basic email starter in block_json,
 * an empty subject/preheader, status 'draft', stamped with space_id + created_by. Gated on canEditProfile.
 * Returns the new id (the workspace selects it).
 */
export async function createSpaceEmailDraft(spaceId: string): Promise<ActionResult<{ id: string }>> {
  const gate = await requireSpaceEditor(spaceId)
  if (!gate.ok) return fail(gate.error)

  const profileId = await getMyProfileId()
  const layout = starterEmailLayout()
  try {
    const { data, error } = await campaignsTable()
      .insert([
        {
          space_id: spaceId,
          block_json: layout,
          body: '',
          subject: '',
          preheader: '',
          status: 'draft',
          created_by: profileId,
        },
      ])
      .select(DRAFT_COLS)
      .maybeSingle()
    if (error || !data) return fail('Could not create a new email. Try again.')
    return ok({ id: data.id })
  } catch {
    return fail('Could not create a new email. Try again.')
  }
}

/**
 * Load one Space draft into the Marketing editor: subject + preheader off the row, the block layout parsed from
 * block_json (basic starter when unset), and the editor context (a standalone broadcast to the Space's contacts).
 * Gated on canEditProfile OR a janitor preview; pinned to space_id. Returns null when the row is gone.
 */
export async function loadSpaceEmailDraft(
  spaceId: string,
  id: string,
): Promise<LoadedEmailCampaign | null> {
  const caller = await getCallerProfile()
  const space = await getSpaceById(spaceId)
  if (!space) return null
  const caps = await getSpaceCapabilities(space, caller?.id ?? null)
  if (!caps.canEditProfile && !isJanitor(caller?.webRole)) return null

  const row = await readDraft(id, spaceId)
  if (!row) return null

  const subject = row.subject ?? ''
  const status = row.status ?? 'draft'
  return {
    id: row.id,
    subject,
    preheader: row.preheader ?? '',
    layout: layoutFromBlockJson(row.block_json),
    context: {
      kind: 'broadcast',
      campaignName: subject.trim() || 'Untitled email',
      status,
      approvalStatus: 'draft',
      audience: 'Your contacts',
      schedule: status === 'sent' ? 'Sent' : 'Not scheduled',
      step: null,
    },
  }
}

/**
 * Persist a Space draft's block layout and/or subject/preheader. This is the arranger's injected `save` (the
 * debounce lives in the shared store) AND the compose fields' save. Gated on canEditProfile + the row belonging
 * to the Space. The layout is re-sanitized (kind 'email') + rich content allowlisted server-side, never trusted
 * from the wire. When the layout changes it refreshes the cached compiled_html using the Space's OWN brand
 * palette (spaceEmailColors), so a later preview / send has send-ready, branded HTML on hand. Returns
 * `{ error? }` (the shape the store's debounced flush expects).
 */
export async function saveSpaceEmailDraft(
  spaceId: string,
  id: string,
  patch: { layout?: BuilderLayout | EntityLayout; subject?: string; preheader?: string },
): Promise<{ error?: string }> {
  const gate = await requireSpaceEditor(spaceId)
  if (!gate.ok) return { error: gate.error }
  const { space } = gate

  const existing = await readDraft(id, spaceId)
  if (!existing) return { error: 'That email no longer exists.' }

  const update: Record<string, unknown> = {}
  if (typeof patch.subject === 'string') update.subject = patch.subject.slice(0, 300)
  if (typeof patch.preheader === 'string') update.preheader = patch.preheader.slice(0, 300)

  if (patch.layout) {
    const clean = sanitizeEntityLayout(patch.layout as EntityLayout, 'email')
    const layout = clean ? sanitizeEmailRichContent(clean) : starterEmailLayout()
    update.block_json = layout
    try {
      const subject = typeof patch.subject === 'string' ? patch.subject : (existing.subject ?? '')
      const preheader = typeof patch.preheader === 'string' ? patch.preheader : (existing.preheader ?? '')
      const brand = spaceBrand(space)
      const { html } = compileEmailDoc({ layout, subject, preheader }, { colors: brand.colors, brand })
      update.compiled_html = html
    } catch {
      // Compilation is best-effort caching; a failure never blocks the save of block_json.
    }
  }

  if (Object.keys(update).length === 0) return {}

  try {
    const { error } = await campaignsTable().update(update).eq('id', id).eq('space_id', spaceId).maybeSingle()
    if (error) return { error: 'Could not save your email. Try again.' }
  } catch {
    return { error: 'Could not save your email. Try again.' }
  }
  return {}
}

/**
 * TEST send: deliver ONE copy of a Space draft to the signed-in operator's own address. Gated on canEditProfile
 * + the row belonging to the Space. Compiles with the Space's OWN brand palette (spaceEmailColors) and example
 * merge values, then sends a single email through sendRawEmail. Never sends to a list, never touches the Space's
 * contacts or suppression ledger.
 */
export async function sendSpaceTestEmail(
  spaceId: string,
  id: string,
): Promise<ActionResult<{ to: string }>> {
  const gate = await requireSpaceEditor(spaceId)
  if (!gate.ok) return fail(gate.error)
  const { space } = gate

  const to = (await getCachedUser())?.email ?? null
  if (!to) return fail('We could not find an email on your account to send the test to.')

  const row = await readDraft(id, spaceId)
  if (!row) return fail('That email no longer exists.')

  const brand = spaceBrand(space)
  const layout = layoutFromBlockJson(row.block_json)
  const compiled = compileEmailDoc(
    { layout, subject: row.subject ?? '', preheader: row.preheader ?? '' },
    { colors: brand.colors, brand },
  )
  if (!compiled.html.trim()) return fail('Add some content before sending a test.')

  const vars = exampleMergeVars()
  const fallbacks = MERGE_TAG_DEFAULT_FALLBACKS
  const subject = applyMergeTags(compiled.subject || 'Your email', vars, { fallbacks, escape: false })
  const html = applyMergeTags(compiled.html, vars, { fallbacks })
  const text = applyMergeTags(compiled.text, vars, { fallbacks, escape: false })

  try {
    await sendRawEmail({ to, subject: `[Test] ${subject}`, html, text })
  } catch {
    return fail('Could not send the test email. Try again.')
  }
  return ok({ to })
}

/**
 * Delete a Space DRAFT email. Gated on canEditProfile + the row belonging to the Space, and restricted to
 * status 'draft' so a scheduled / sent email can never be removed here.
 */
export async function deleteSpaceEmailDraft(spaceId: string, id: string): Promise<ActionResult> {
  const gate = await requireSpaceEditor(spaceId)
  if (!gate.ok) return fail(gate.error)

  const existing = await readDraft(id, spaceId)
  if (!existing) return fail('That email no longer exists.')
  if ((existing.status ?? 'draft') !== 'draft') return fail('Only a draft can be deleted.')

  try {
    const { error } = await campaignsTable()
      .delete()
      .eq('id', id)
      .eq('space_id', spaceId)
      .eq('status', 'draft')
      .maybeSingle()
    if (error) return fail('Could not delete this draft. Try again.')
  } catch {
    return fail('Could not delete this draft. Try again.')
  }
  return ok()
}
