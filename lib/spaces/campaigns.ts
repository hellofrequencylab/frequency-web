// PER-SPACE CAMPAIGNS (ENTITY-SPACES-BUILD §C Phase 3, "campaign composer + schedule"). The library
// plus server actions behind the Space email composer, the per-Space analog of lib/spaces/memberships.ts.
// CRUD over the existing `campaigns` table (subject + body + status), scoped to a Space. The sibling
// backbone agent's migration adds `campaigns.space_id` + `campaigns.scheduled_for`; until the types
// regenerate, every column is reached through the untyped admin client (ADR-246), the same convention
// lib/spaces/memberships.ts uses for space_membership_tiers.
//
// TENANCY + AUTHZ (ADR-246/328/329). A Space A caller never sees or edits Space B's campaigns: every
// READ filters `space_id = spaceId`, and every read of a single campaign by id ALSO filters space_id
// so a cross-space id leaks nothing. WRITES are gated on canEditProfile (owner / admin / editor) via
// getSpaceCapabilities and re-validate the campaign belongs to the Space before mutating. Reads
// FAIL-SAFE (empty / null); writes FAIL-CLOSED on a permission miss.
//
// SHAPE: pure validation helpers (no Supabase/Next imports) so they are unit-testable, a thin IO layer
// of untyped admin-client reads/writes, and the action implementations as plain async functions. This
// module has NO 'use server' directive (so it can ALSO export the pure helpers + types the surfaces
// import). The thin 'use server' wrappers the CLIENT calls live in lib/spaces/campaigns-actions.ts.
//
// SENDING is wired to the send backbone. sendSpaceCampaign(...) here resolves the audience over this
// Space's contacts and hands them to the send seam (sendSpaceCampaign from @/lib/spaces/email), which
// owns the kill-switch, daily cap, suppression, per-recipient unsubscribe, and the outreach_sends ledger.

import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId, getCallerProfile } from '@/lib/auth'
import { getSpaceById } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { isJanitor } from '@/lib/core/roles'
import { type ActionResult, ok, fail, isError } from '@/lib/action-result'
import { resolveAudience, type AudienceFilter } from '@/lib/spaces/audiences'
import { sendSpaceCampaign as sendViaSeam, SPACE_UNSUBSCRIBE_PLACEHOLDER } from '@/lib/spaces/email'

// Render a plain-text campaign body to a minimal HTML email with a Space-appropriate footer. Inline
// styles + hex are correct here (an email renders in mail clients, OUTSIDE the DAWN shell, where CSS
// tokens are unavailable, exactly like lib/studio/campaigns.ts campaignEmail). The unsubscribe href is
// the SPACE_UNSUBSCRIBE_PLACEHOLDER, which the send seam swaps for each recipient's own one-click URL.
function escapeCampaignHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
function renderCampaignHtml(body: string): string {
  const paras = body
    .split(/\n{2,}/)
    .map(
      (p) =>
        `<p style="font-size:15px;color:#333;line-height:1.6;margin:0 0 16px;">${escapeCampaignHtml(p).replace(/\n/g, '<br/>')}</p>`,
    )
    .join('')
  return `<div style="max-width:560px;margin:0 auto;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;padding:24px;">${paras}<hr style="border:none;border-top:1px solid #eee;margin:24px 0;"/><p style="font-size:12px;color:#999;line-height:1.6;">You're receiving this because you are a contact of this space. <a href="${SPACE_UNSUBSCRIBE_PLACEHOLDER}" style="color:#999;">Unsubscribe</a>.</p></div>`
}

// ── Types ─────────────────────────────────────────────────────────────────────────────────────

/** A campaign's lifecycle as the Space surfaces use it. `draft` = being written; `scheduled` = a
 *  send time is set (scheduled_for) but it has not gone out; `sent` = delivered. Unknown DB values
 *  fall back to 'draft' so a future status never reads as sent. */
export type CampaignStatus = 'draft' | 'scheduled' | 'sent'

/** One Space campaign as the app consumes it (camelCased). `body` is plain text (blank lines become
 *  paragraphs at send, like the global composer). scheduledFor / sentAt are ISO strings or null. */
export interface SpaceCampaign {
  id: string
  subject: string
  body: string
  status: CampaignStatus
  recipientCount: number
  scheduledFor: string | null
  sentAt: string | null
  createdAt: string | null
}

/** The fields the composer can set on create / update. Both optional on update; subject is required
 *  on create (validated). */
export interface CampaignInput {
  subject: string
  body: string
}

const MAX_SUBJECT_LEN = 200
const MAX_BODY_LEN = 50_000

const STATUSES: readonly CampaignStatus[] = ['draft', 'scheduled', 'sent'] as const

// ── PURE: validation / normalization (no IO, testable) ──────────────────────────────────────────

/** Trim + length-cap a subject; returns '' if absent/blank (the caller rejects an empty subject on
 *  create). Pure. */
export function normalizeSubject(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().slice(0, MAX_SUBJECT_LEN) : ''
}

/** Length-cap a body, preserving internal newlines (blank lines become paragraphs at send). Pure. */
export function normalizeBody(raw: unknown): string {
  return typeof raw === 'string' ? raw.slice(0, MAX_BODY_LEN) : ''
}

/** Coerce a DB status string to a known CampaignStatus; unknown -> 'draft' (never reads as sent). */
export function toCampaignStatus(raw: unknown): CampaignStatus {
  return typeof raw === 'string' && (STATUSES as readonly string[]).includes(raw)
    ? (raw as CampaignStatus)
    : 'draft'
}

/** Parse a schedule time to an ISO string in the FUTURE, or null if it is missing / unparseable /
 *  in the past. Pure (takes `now` for testability). A past or invalid time fails closed to null so a
 *  schedule can never silently send immediately. */
export function parseScheduleTime(raw: unknown, now: Date = new Date()): string | null {
  if (typeof raw !== 'string' && !(raw instanceof Date)) return null
  const d = raw instanceof Date ? raw : new Date(raw)
  const ms = d.getTime()
  if (!Number.isFinite(ms)) return null
  if (ms <= now.getTime()) return null
  return d.toISOString()
}

// ── IO: the untyped admin-client seam (campaigns.space_id/scheduled_for not in types yet, ADR-246) ──

// The `campaigns` columns the Space surfaces read. space_id + scheduled_for are added by the sibling's
// migration and reached via the untyped cast until the types regenerate.
const CAMPAIGN_COLS =
  'id, subject, body, status, recipient_count, scheduled_for, sent_at, created_at, space_id'

type CampaignRow = {
  id: string
  subject: string
  body: string | null
  status: string
  recipient_count: number | null
  scheduled_for: string | null
  sent_at: string | null
  created_at: string | null
  space_id: string | null
}

type CampaignQuery = {
  select: (cols: string) => CampaignQuery
  eq: (col: string, val: string) => CampaignQuery
  order: (col: string, opts: { ascending: boolean }) => CampaignQuery
  limit: (n: number) => CampaignQuery
  insert: (rows: Record<string, unknown>[]) => CampaignQuery
  update: (patch: Record<string, unknown>) => CampaignQuery
  maybeSingle: () => Promise<{ data: CampaignRow | null; error: unknown }>
  then: (
    resolve: (r: { data: CampaignRow[] | null; error: unknown }) => unknown,
  ) => Promise<unknown>
}

/** The untyped `campaigns` query builder (space_id/scheduled_for aren't in the generated types yet). */
function campaignsTable(): CampaignQuery {
  const db = createAdminClient() as unknown as { from: (t: string) => CampaignQuery }
  return db.from('campaigns')
}

/** Map a DB row to a typed SpaceCampaign. */
function mapCampaign(r: CampaignRow): SpaceCampaign {
  return {
    id: r.id,
    subject: r.subject,
    body: r.body ?? '',
    status: toCampaignStatus(r.status),
    recipientCount: typeof r.recipient_count === 'number' ? r.recipient_count : 0,
    scheduledFor: r.scheduled_for ?? null,
    sentAt: r.sent_at ?? null,
    createdAt: r.created_at ?? null,
  }
}

/** Read one campaign by id, PINNED to a Space (so a cross-space id resolves to null). Service-role;
 *  FAIL-SAFE to null. */
async function readCampaign(id: string, spaceId: string): Promise<CampaignRow | null> {
  try {
    const { data, error } = await campaignsTable()
      .select(CAMPAIGN_COLS)
      .eq('id', id)
      .eq('space_id', spaceId)
      .maybeSingle()
    if (error || !data) return null
    return data
  } catch {
    return null
  }
}

// ── Shared authz: resolve the Space + the editor gate in one place ──────────────────────────────

/** Resolve a Space and check the caller may EDIT it (owner / admin / editor). Returns the spaceId on
 *  success or an ActionResult error to return. Centralizes the write gate so every mutation fails
 *  closed identically. */
async function requireSpaceEditor(spaceId: string): Promise<{ ok: true } | ActionResult<never>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to manage your campaigns.')
  const space = await getSpaceById(spaceId)
  if (!space) return fail('Space not found.')
  const caps = await getSpaceCapabilities(space, profileId)
  if (!caps.canEditProfile) return fail('You do not have permission to manage campaigns for this space.')
  return { ok: true }
}

// ── PUBLIC SERVER ACTIONS (all gated / validated server-side) ──────────────────────────────────

/**
 * A Space's campaigns, newest first. Gated on canEditProfile (owner / admin / editor) OR a platform
 * janitor previewing as staff (so the staff preview reads the real list). FAIL-SAFE to [] for an
 * anonymous / unauthorized caller or any error. Filters space_id, so it only ever returns THIS
 * Space's campaigns.
 */
export async function listSpaceCampaigns(spaceId: string): Promise<SpaceCampaign[]> {
  const caller = await getCallerProfile()
  const space = await getSpaceById(spaceId)
  if (!space) return []
  const caps = await getSpaceCapabilities(space, caller?.id ?? null)
  if (!caps.canEditProfile && !isJanitor(caller?.webRole)) return []
  try {
    return await new Promise<SpaceCampaign[]>((resolve) => {
      campaignsTable()
        .select(CAMPAIGN_COLS)
        .eq('space_id', spaceId)
        .order('created_at', { ascending: false })
        .then(({ data, error }) => {
          if (error || !data) return resolve([])
          resolve(data.map(mapCampaign))
        })
    })
  } catch {
    return []
  }
}

/**
 * Create a draft campaign in a Space. Gated on canEditProfile. Requires a non-empty subject; the body
 * may be empty (the owner can fill it in the editor). Stamps space_id + created_by + status 'draft'.
 * Returns the new campaign id. Fail-closed on permission / validation.
 */
export async function createSpaceCampaign(
  spaceId: string,
  input: CampaignInput,
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireSpaceEditor(spaceId)
  if ('error' in gate) return gate

  const subject = normalizeSubject(input.subject)
  if (!subject) return fail('Give your campaign a subject.')
  const body = normalizeBody(input.body)

  const profileId = await getMyProfileId()
  try {
    const { data, error } = await campaignsTable()
      .insert([
        {
          space_id: spaceId,
          subject,
          body,
          status: 'draft',
          created_by: profileId,
        },
      ])
      .select(CAMPAIGN_COLS)
      .maybeSingle()
    if (error || !data) return fail('Could not create the campaign. Try again.')
    return ok({ id: data.id })
  } catch {
    return fail('Could not create the campaign. Try again.')
  }
}

/**
 * Update a draft campaign's subject / body. Gated on canEditProfile AND the campaign belonging to the
 * Space (re-read pinned to space_id). A SENT campaign is immutable (you can't edit something already
 * delivered). Fail-closed.
 */
export async function updateSpaceCampaign(
  spaceId: string,
  id: string,
  input: Partial<CampaignInput>,
): Promise<ActionResult> {
  const gate = await requireSpaceEditor(spaceId)
  if ('error' in gate) return gate

  const existing = await readCampaign(id, spaceId)
  if (!existing) return fail('Campaign not found.')
  if (toCampaignStatus(existing.status) === 'sent')
    return fail('This campaign has already gone out, so it cannot be edited.')

  const patch: Record<string, unknown> = {}
  if (input.subject !== undefined) {
    const subject = normalizeSubject(input.subject)
    if (!subject) return fail('Give your campaign a subject.')
    patch.subject = subject
  }
  if (input.body !== undefined) patch.body = normalizeBody(input.body)
  if (Object.keys(patch).length === 0) return ok()

  try {
    const { error } = await campaignsTable()
      .update(patch)
      .eq('id', id)
      .eq('space_id', spaceId)
      .maybeSingle()
    if (error) return fail('Could not save the campaign. Try again.')
  } catch {
    return fail('Could not save the campaign. Try again.')
  }
  return ok()
}

/**
 * Schedule a campaign to send at `when` (an ISO string or Date, must be in the future). Gated on
 * canEditProfile AND the campaign belonging to the Space. Sets scheduled_for + status 'scheduled'. A
 * past / unparseable time is rejected (fail-closed) so a schedule never silently sends now. A sent
 * campaign cannot be re-scheduled.
 *
 * NOTE: the backbone agent's send pipeline picks up scheduled campaigns (scheduled_for in the past,
 * status 'scheduled') and delivers them. This action only records the intent; it never sends.
 */
export async function scheduleSpaceCampaign(
  spaceId: string,
  id: string,
  when: string | Date,
): Promise<ActionResult> {
  const gate = await requireSpaceEditor(spaceId)
  if ('error' in gate) return gate

  const existing = await readCampaign(id, spaceId)
  if (!existing) return fail('Campaign not found.')
  if (toCampaignStatus(existing.status) === 'sent')
    return fail('This campaign has already gone out, so it cannot be scheduled.')

  const iso = parseScheduleTime(when)
  if (!iso) return fail('Pick a send time in the future.')

  try {
    const { error } = await campaignsTable()
      .update({ scheduled_for: iso, status: 'scheduled' })
      .eq('id', id)
      .eq('space_id', spaceId)
      .maybeSingle()
    if (error) return fail('Could not schedule the campaign. Try again.')
  } catch {
    return fail('Could not schedule the campaign. Try again.')
  }
  return ok()
}

/**
 * Send a campaign now to a resolved audience. Gated on canEditProfile AND the campaign belonging to
 * the Space. Resolves the recipients over the Space's own contacts (resolveAudience), then hands them
 * to the send seam (sendSpaceCampaign from @/lib/spaces/email).
 *
 * The send seam owns suppression, per-recipient unsubscribe, the kill-switch (isSpaceEmailEnabled),
 * and the per-Space daily cap; on a successful send this action stamps the campaign status='sent' +
 * sent_at (best-effort, since the emails already went out). Fail-closed on any gate / validation miss.
 */
export async function sendSpaceCampaign(
  spaceId: string,
  id: string,
  filter: AudienceFilter = {},
): Promise<ActionResult<{ recipientCount: number }>> {
  const gate = await requireSpaceEditor(spaceId)
  if ('error' in gate) return gate

  const existing = await readCampaign(id, spaceId)
  if (!existing) return fail('Campaign not found.')
  if (toCampaignStatus(existing.status) === 'sent')
    return fail('This campaign has already gone out.')
  if (!normalizeSubject(existing.subject)) return fail('Give your campaign a subject before sending.')
  if (!normalizeBody(existing.body).trim()) return fail('Write your campaign before sending.')

  // Resolve the recipients over THIS Space's contacts (the exact shape the send seam consumes).
  const recipients = await resolveAudience(spaceId, filter)
  if (recipients.length === 0)
    return fail('No one matched that audience yet. Add contacts or pick a different filter.')

  // Hand the resolved recipients to the send seam: it owns the kill-switch (fail-closed if email is
  // off), the per-Space daily cap, suppression filtering, the per-recipient RFC 8058 one-click
  // unsubscribe, and the outreach_sends ledger. The body's SPACE_UNSUBSCRIBE_PLACEHOLDER is swapped
  // for each recipient's own unsubscribe URL inside the seam.
  const res = await sendViaSeam(spaceId, {
    campaignId: id,
    subject: existing.subject,
    html: renderCampaignHtml(existing.body ?? ''),
    recipients,
  })
  if (isError(res)) return res

  // Stamp the campaign as sent (best-effort: the emails already went out, so a failed status write
  // must not surface as a send failure).
  try {
    await campaignsTable()
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', id)
      .eq('space_id', spaceId)
  } catch {
    // ignore: the send succeeded; the status stamp is non-critical.
  }

  return ok({ recipientCount: res.data.sent })
}
