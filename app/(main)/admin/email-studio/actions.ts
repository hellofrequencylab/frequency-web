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
import { applyMergeTags, sanitizeEmailRichContent } from '@/lib/email-studio/render'
import { sanitizeFromName, loadCampaignFromName, resolveCampaignFromHeader } from '@/lib/email-studio/send'
import { buildUnsubscribeUrl, buildManageEmailsUrl } from '@/lib/unsubscribe-tokens'
import { SITE_URL } from '@/lib/site'
import { MERGE_TAG_VARIABLES, MERGE_TAG_DEFAULT_FALLBACKS } from '@/lib/email-studio/types'
import { sendRawEmail } from '@/lib/email'
import { BETA_LAUNCH_EMAILS } from '@/lib/beta/launch-emails'
import { BUILTIN_SEGMENTS, TRAIT_SEGMENT_PREFIX } from '@/lib/studio/campaigns'
import { type ActionResult, ok, fail } from '@/lib/action-result'

/** One campaign card for the left rail. `updatedAt` sources `created_at` (the campaigns table carries no
 *  updated_at column); it drives the "created" timestamp shown on each card. */
export interface EmailCampaignCard {
  id: string
  subject: string
  status: string
  updatedAt: string
}

/**
 * One step's place + timing inside a multi-email sequence (the beta broadcast series today; a drip or
 * funnel journey via the seam in `loadEmailCampaign`). `position` is 1-based, `total` the sequence length,
 * and `timing` a plain-language cadence/trigger line for the step.
 */
export interface EmailSequenceStep {
  position: number
  total: number
  /** The name of the sequence this email belongs to, e.g. "Beta launch sequence". */
  sequenceName: string
  /** A plain-language timing/trigger line, e.g. "Target send Aug 3, 2026". Null when unset. */
  timing: string | null
}

/**
 * The orientation an editor's info bar renders above the canvas: which campaign or sequence this email
 * belongs to, its audience, schedule, and status, plus (when it is one step of a sequence) that step. So a
 * writer always knows where they are. `kind` is 'sequence' for a step in a journey, 'broadcast' for a
 * one-off send.
 */
export interface EmailEditorContext {
  kind: 'broadcast' | 'sequence'
  /** The container's display name: the sequence name for a step, else the campaign subject. */
  campaignName: string
  /** The lifecycle status (`campaigns.status`): draft / scheduled / sending / sent / paused / cancelled. */
  status: string
  /** The approval status (`campaigns.approval_status`), surfaced for beta-gated sends. */
  approvalStatus: string
  /** A plain-language audience label resolved from the stored segment. */
  audience: string
  /** A plain-language schedule line (e.g. "Scheduled for August 3, 2026" or "Not scheduled"). */
  schedule: string
  /** The step context when this email is part of a sequence; null for a standalone broadcast. */
  step: EmailSequenceStep | null
}

/** The loaded email a card opens into the editor: the block layout plus subject + preheader + the editor
 *  context (campaign/sequence orientation) the info bar renders. */
export interface LoadedEmailCampaign {
  id: string
  subject: string
  preheader: string
  /** The friendly From display NAME (envelope address is always the verified domain). Empty / omitted =
   *  the platform default. Optional so surfaces that do not offer a per-send name (per-Space, CRM 1:1) can
   *  omit it; the admin Email Studio populates it. */
  fromName?: string
  layout: EntityLayout
  context: EmailEditorContext
}

/** A plain-language audience label from a stored `campaigns.segment` key: a built-in audience keeps its
 *  catalog label, a trait segment (`seg:<slug>`) reads as "Segment: <slug>", an empty key reads as unset. */
function audienceLabel(segment: string | null): string {
  const key = (segment ?? '').trim()
  if (!key) return 'No audience set'
  const builtin = BUILTIN_SEGMENTS.find((b) => b.key === key)
  if (builtin) return builtin.label
  if (key.startsWith(TRAIT_SEGMENT_PREFIX)) return `Segment: ${key.slice(TRAIT_SEGMENT_PREFIX.length)}`
  return key
}

/** A short human date (e.g. "August 3, 2026") for a schedule/timing line, or null when unparseable. */
function longDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

/** A plain-language schedule line for the info bar, framed by lifecycle status. */
function scheduleLabel(scheduledFor: string | null, status: string): string {
  const when = longDate(scheduledFor)
  if (status === 'sent') return when ? `Sent ${when}` : 'Sent'
  if (when) return `Scheduled for ${when}`
  return 'Not scheduled'
}

/** A fresh EMAIL layout (kind 'email'). The `campaign` shape is the full `basic` starter (heading + text +
 *  call-to-action button) a marketing broadcast is born with. The `message` shape is the lean `minimal`
 *  content box (a heading + a paragraph, no CTA) the CRM 1:1 member composer opens with — the branded
 *  Frequency header and the CAN-SPAM footer come from the email shell at compile/preview time, so this
 *  body stays a clean "standard template: simple header, content box, footer" without a stray button. */
function starterEmailLayout(template: EmailDraftTemplate = 'campaign'): EntityLayout {
  return { rows: starterRows('email', template === 'message' ? 'minimal' : 'basic') }
}

/** The row shape the pristine-draft check reads. */
interface DraftPristineRow {
  subject: string | null
  preheader: string | null
  body: string | null
  sent_at: string | null
  test_sent_at: string | null
  scheduled_for: string | null
  phase_id: string | null
  recipient_count: number | null
  block_json: unknown
}

const PRISTINE_COLS = 'subject, preheader, body, sent_at, test_sent_at, scheduled_for, phase_id, recipient_count, block_json'

/** Is this draft still untouched? No subject/preheader/body, no authored block content (the starter
 *  scaffold has row slots but no `content` map), no send / test / schedule / recipients, and not part of
 *  a sequence. Such a row is safe to reuse or silently discard, and should never clutter a list. */
function isPristineDraft(row: DraftPristineRow): boolean {
  const empty = !(row.subject ?? '').trim() && !(row.preheader ?? '').trim() && !(row.body ?? '').trim()
  const content =
    row.block_json && typeof row.block_json === 'object'
      ? (row.block_json as { content?: Record<string, unknown> }).content
      : undefined
  const hasAuthoredContent = !!content && Object.keys(content).length > 0
  return (
    empty &&
    !hasAuthoredContent &&
    !row.sent_at &&
    !row.test_sent_at &&
    !row.scheduled_for &&
    !row.phase_id &&
    !(row.recipient_count && row.recipient_count > 0)
  )
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

/** Which starter body a new draft is born with. `campaign` (default) = the full marketing starter; `message`
 *  = the lean content box the CRM 1:1 member composer uses (header + footer come from the shell). */
export type EmailDraftTemplate = 'campaign' | 'message'

/**
 * Create a new email DRAFT: a campaigns row seeded with the chosen email starter layout in block_json, an
 * empty subject/body, and status 'draft'. Writer-gated. Returns the new id (the workspace selects it).
 */
export async function createEmailDraft(
  template: EmailDraftTemplate = 'campaign',
): Promise<ActionResult<{ id: string }>> {
  const gate = await writerGate()
  if (!gate.ok) return fail(gate.error)

  const layout = starterEmailLayout(template)
  const db = createAdminClient()

  // Reuse the caller's own pristine empty draft instead of minting another. Opening a composer (or
  // clicking New) repeatedly must never litter the list with blank drafts, so at most ONE untouched
  // draft ever exists per operator. We reset its starter layout to the requested template and return it.
  const { data: candidates } = await db
    .from('campaigns')
    .select(`id, ${PRISTINE_COLS}`)
    .eq('created_by', gate.profileId)
    .eq('status', 'draft')
    .order('created_at', { ascending: false })
    .limit(10)
  const reusable = ((candidates ?? []) as ({ id: string } & DraftPristineRow)[]).find(isPristineDraft)
  if (reusable) {
    await db
      .from('campaigns')
      .update({ block_json: layout as unknown as never })
      .eq('id', reusable.id)
      .eq('status', 'draft')
      .eq('created_by', gate.profileId)
    revalidatePath('/admin/beta')
    return ok({ id: reusable.id })
  }

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
 * block_json (basic starter when unset). Read-gated, and owner-scoped for DRAFTS (created_by = the caller)
 * so an operator only ever opens their own draft — matching discardDraftIfEmpty. A non-draft (sent /
 * scheduled) campaign stays shared: any marketer can still load it. Returns null when the row is gone.
 */
export async function loadEmailCampaign(id: string): Promise<LoadedEmailCampaign | null> {
  const { profileId } = await requireAdmin('admin', { staff: 'marketing', staffLevel: 'read' })
  const db = createAdminClient()
  const { data, error } = await db
    .from('campaigns')
    .select('id, subject, preheader, block_json, status, approval_status, segment, scheduled_for, phase_id')
    .eq('id', id)
    // Owner-scope drafts, but leave shared sent/scheduled campaigns loadable by anyone.
    .or(`created_by.eq.${profileId},status.neq.draft`)
    .maybeSingle()
  if (error || !data) return null

  const subject = data.subject ?? ''
  const status = data.status ?? 'draft'

  // STEP CONTEXT. Populated today when the email belongs to the beta broadcast sequence (a non-null
  // phase_id), computed from the SAME send-order the Campaign tab lists. A generic Studio draft (null
  // phase_id) is a standalone broadcast, so it carries no step.
  //
  // SEAM — drip / funnel steps: a multi-email drip (`nurture_*` root, `space_drip_*` Space) or a funnel
  // (`funnel_stages`) also has a `step_order` + `delay_hours` cadence, but a `campaigns` row is not yet
  // linked to a drip/funnel step by a foreign key (the P2 plan calls out the `campaigns`<->`funnel_stages`
  // link as the wiring to add). When that link lands, resolve the step here and return an EmailSequenceStep
  // with `timing` built from `delay_hours` (e.g. "sends 2 days after the previous email"); the info bar
  // already renders any EmailSequenceStep, so no UI change is needed then.
  const step = data.phase_id ? await betaSequenceStep(db, id, scheduleLabel(data.scheduled_for, status)) : null

  // The friendly From name lives on its own additive column, read fail-safe (null pre-migration → default).
  const fromName = (await loadCampaignFromName(id)) ?? ''

  return {
    id: data.id,
    subject,
    preheader: data.preheader ?? '',
    fromName,
    layout: layoutFromBlockJson(data.block_json),
    context: {
      kind: step ? 'sequence' : 'broadcast',
      campaignName: step ? step.sequenceName : subject.trim() || 'Untitled campaign',
      status,
      approvalStatus: data.approval_status ?? 'draft',
      audience: audienceLabel(data.segment),
      schedule: scheduleLabel(data.scheduled_for, status),
      step,
    },
  }
}

/**
 * Persist a campaign's block layout and/or subject/preheader. This is the arranger's injected `save` (the
 * debounce lives in the shared store) AND the compose fields' save. Writer-gated; the layout is re-sanitized
 * (kind 'email') server-side, never trusted from the wire. When the layout changes it also refreshes the
 * cached compiled_html so a later send / preview has send-ready HTML on hand. Returns `{ error? }` (the shape
 * the store's debounced flush expects).
 *
 * NO revalidation here (deliberate): this is the DEBOUNCED autosave, fired on every keystroke burst while the
 * composer is open. A revalidatePath / refresh in a Server Action makes Next re-render the CURRENT route and
 * commit it as a seeded navigation (see next/dist/docs server-actions: "A single response carries data and
 * UI"). Under the CRM Marketing popup that seeded navigation re-rendered the composing route mid-typing, which
 * tore focus out of the subject/body field and could close the popup. The card lists that show a subject /
 * status keep themselves in sync optimistically (the workspaces' onSubjectChange) and reload fresh on the next
 * navigation, so autosave never needs to revalidate a path. Lifecycle acts that DO change the list (create /
 * delete / test / send) still revalidate in their own actions.
 */
export async function saveEmailCampaign(
  id: string,
  patch: { layout?: BuilderLayout | EntityLayout; subject?: string; preheader?: string; fromName?: string },
): Promise<{ error?: string }> {
  const gate = await writerGate()
  if (!gate.ok) return { error: gate.error }

  const db = createAdminClient()
  const update: Database['public']['Tables']['campaigns']['Update'] = {}

  if (typeof patch.subject === 'string') update.subject = patch.subject.slice(0, 300)
  if (typeof patch.preheader === 'string') update.preheader = patch.preheader.slice(0, 300)

  // The friendly From NAME persists on its own additive column via a BEST-EFFORT write: the column is new and
  // may not exist pre-migration, so failing here must never block the subject / preheader / layout save (nor
  // the fromName-only autosave). Sanitized so a stored name can never break the From header; blank clears it.
  if (typeof patch.fromName === 'string') {
    const clean = sanitizeFromName(patch.fromName)
    await db
      .from('campaigns')
      .update({ from_name: clean || null } as unknown as Database['public']['Tables']['campaigns']['Update'])
      .eq('id', id)
  }

  if (patch.layout) {
    // Sanitize the wire layout (kind 'email'), THEN rewrite every rich `textarea` field to allowlist inline
    // HTML (Email Studio canvas, Slice A) so a stored bold/italic/link is safe and the renderer emits exactly
    // what was stored. Plain `text` fields are untouched (escaped at render). Never trusts the wire.
    const clean = sanitizeEntityLayout(patch.layout as EntityLayout, 'email')
    const layout = clean ? sanitizeEmailRichContent(clean) : starterEmailLayout()
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

  // Intentionally no revalidatePath — see the note above: revalidating from this per-keystroke autosave would
  // force a seeded navigation that remounts / refocuses the open composer.
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
  // A TEST is delivered to the operator's OWN address, so build REAL footer links for them (their own
  // (profileId, lifecycle) token). This makes the footer's "Unsubscribe" + "Manage emails" links live in the
  // exact surface the operator clicks from, instead of the tokenless preview fallback. They can resubscribe on
  // the manage page, so a test click is never a dead end.
  const unsubscribeUrl = buildUnsubscribeUrl({ baseUrl: SITE_URL, profileId: gate.profileId, category: 'lifecycle' })
  const manageUrl = buildManageEmailsUrl({ baseUrl: SITE_URL, profileId: gate.profileId, category: 'lifecycle' })
  const compiled = compileEmailDoc(doc, { unsubscribeUrl, manageUrl })
  if (!compiled.html.trim()) return fail('Add some content before sending a test.')

  const vars = exampleMergeVars()
  const fallbacks = MERGE_TAG_DEFAULT_FALLBACKS
  const subject = applyMergeTags(compiled.subject || 'Your email', vars, { fallbacks, escape: false })
  const html = applyMergeTags(compiled.html, vars, { fallbacks })
  const text = applyMergeTags(compiled.text, vars, { fallbacks, escape: false })

  // Send the test from the SAME resolved From header the real send uses (per-campaign from_address →
  // EMAIL_BROADCAST_FROM → default, with from_name on top), so the test shows EXACTLY what recipients see —
  // including a custom sender address like Daniel Tyack <danieltyack@send.frequencylocal.com>, not the noreply.
  const from = await resolveCampaignFromHeader(id)

  await sendRawEmail({ to, from, subject: `[Test] ${subject}`, html, text })
  await db.from('campaigns').update({ test_sent_at: new Date().toISOString() }).eq('id', id)

  revalidatePath('/admin/beta')
  return ok({ to })
}

/**
 * Delete a DRAFT email. Writer-gated, restricted to status 'draft' so a scheduled / sent campaign can never
 * be removed here, AND owner-scoped (created_by = the caller) so an operator can only ever delete their own
 * draft — matching discardDraftIfEmpty. A shared sent campaign is untouched (delete never reaches it).
 */
export async function deleteEmailDraft(id: string): Promise<ActionResult> {
  const gate = await writerGate()
  if (!gate.ok) return fail(gate.error)

  const db = createAdminClient()
  const { error } = await db
    .from('campaigns')
    .delete()
    .eq('id', id)
    .eq('status', 'draft')
    .eq('created_by', gate.profileId)
  if (error) return fail('Could not delete this draft. Try again.')

  revalidatePath('/admin/beta')
  return ok()
}

/**
 * Discard a draft ONLY if it is still pristine — the abandoned-draft cleanup for the CRM member composer,
 * which mints a draft the instant its popup opens. Called when the popup closes: a draft that has a
 * subject/preheader/body, any authored block content, a send, a test send, a schedule, a recipient count,
 * or a sequence phase is KEPT (the operator may resume it, per "pick up where you left off"); a pristine
 * empty one is removed so it never clutters the Email Studio list. Writer-gated + owner-scoped +
 * status-guarded, so it can only ever remove the caller's own untouched draft. Best-effort: a miss is
 * harmless (opening then closing without editing just leaves nothing behind).
 */
export async function discardDraftIfEmpty(id: string): Promise<ActionResult> {
  const gate = await writerGate()
  if (!gate.ok) return fail(gate.error)

  const db = createAdminClient()
  const { data } = await db
    .from('campaigns')
    .select(PRISTINE_COLS)
    .eq('id', id)
    .eq('status', 'draft')
    .maybeSingle()
  const row = data as DraftPristineRow | null
  if (!row) return ok()
  if (!isPristineDraft(row)) return ok()

  await db.from('campaigns').delete().eq('id', id).eq('status', 'draft').eq('created_by', gate.profileId)
  revalidatePath('/admin/beta')
  return ok()
}

// ── Beta broadcast sequence (the Campaign tab) ─────────────────────────────────────────────────────────────
//
// The Campaign tab is JUST the beta broadcast sequence: the six launch emails in send order, plus any email
// the operator adds. The seeded launch emails live in `campaigns` (one row per BETA_LAUNCH_EMAILS entry, keyed
// (phase_id, subject) by seedBetaLaunchEmails). A beta campaign is any campaigns row with a non-null phase_id;
// a generic Studio draft has phase_id null and never shows here. The P0 waitlist double opt-in confirm is a
// transactional automation, not a broadcast, so it is excluded from this list.

/** One row of the beta broadcast sequence for the Campaign tab's left rail. */
export interface BetaSequenceEmail {
  id: string
  /** 1-based position in the send order (the numbered sequence). */
  seq: number
  subject: string
  /** The operator-set TARGET send date (campaigns.scheduled_for), ISO, or null when unset. */
  scheduledFor: string | null
  status: string
  approvalStatus: string
}

/** Subject → launch-order index for the six BROADCAST launch emails (P0 confirm excluded). Drives the 1..N
 *  numbering: a known launch email sorts to its authored position; an operator-added email sorts after. */
const BETA_BROADCAST_ORDER: Map<string, number> = new Map(
  BETA_LAUNCH_EMAILS.filter((e) => e.phaseKey !== 'P0').map((e, i) => [e.subject, i]),
)

/** The name shown for the beta broadcast sequence in the editor's info bar. */
const BETA_SEQUENCE_NAME = 'Beta launch sequence'

/** Send-order comparator for beta broadcast rows: a known launch email sorts to its authored position, an
 *  operator-added email sorts after by creation time. Shared by the sequence list and the step lookup. */
function compareBetaBroadcast(
  a: { subject: string; created_at: string },
  b: { subject: string; created_at: string },
): number {
  const UNKNOWN = Number.MAX_SAFE_INTEGER
  const ia = BETA_BROADCAST_ORDER.get(a.subject) ?? UNKNOWN
  const ib = BETA_BROADCAST_ORDER.get(b.subject) ?? UNKNOWN
  if (ia !== ib) return ia - ib
  return a.created_at.localeCompare(b.created_at)
}

/**
 * Resolve one beta campaign's step within the broadcast sequence: its 1-based position and the sequence
 * length, ordered exactly like `listBetaSequenceEmails` (launch emails first in authored order, then any
 * operator-added beta email by creation time, P0 transactional confirm excluded). Returns null when the
 * campaign is not in the sequence. `timing` is the step's plain-language cadence (its target-date line).
 */
async function betaSequenceStep(
  db: ReturnType<typeof createAdminClient>,
  campaignId: string,
  timing: string,
): Promise<EmailSequenceStep | null> {
  const { data: phases } = await db.from('beta_phases').select('id, key')
  const p0PhaseIds = new Set((phases ?? []).filter((p) => p.key === 'P0').map((p) => p.id))

  const { data } = await db
    .from('campaigns')
    .select('id, subject, phase_id, created_at')
    .not('phase_id', 'is', null)
    .order('created_at', { ascending: true })
    .limit(200)
  if (!data) return null

  const rows = data
    .filter((r) => r.phase_id && !p0PhaseIds.has(r.phase_id))
    .map((r) => ({ id: r.id, subject: r.subject ?? '', created_at: r.created_at }))
    .sort(compareBetaBroadcast)

  const index = rows.findIndex((r) => r.id === campaignId)
  if (index < 0) return null
  return {
    position: index + 1,
    total: rows.length,
    sequenceName: BETA_SEQUENCE_NAME,
    timing: timing === 'Not scheduled' ? null : timing,
  }
}

/**
 * List the beta broadcast sequence in send order (read-gated). Every campaigns row with a non-null phase_id,
 * minus the P0 transactional confirm, ordered: the six launch emails first (their authored order), then any
 * operator-added beta email by creation time. Numbered 1..N.
 */
export async function listBetaSequenceEmails(): Promise<BetaSequenceEmail[]> {
  await requireAdmin('admin', { staff: 'marketing', staffLevel: 'read' })
  const db = createAdminClient()

  // Which phase ids are P0 (the transactional confirm to exclude).
  const { data: phases } = await db.from('beta_phases').select('id, key')
  const p0PhaseIds = new Set((phases ?? []).filter((p) => p.key === 'P0').map((p) => p.id))

  const { data, error } = await db
    .from('campaigns')
    .select('id, subject, scheduled_for, status, approval_status, phase_id, created_at')
    .not('phase_id', 'is', null)
    .order('created_at', { ascending: true })
    .limit(200)
  if (error || !data) return []

  const rows = data.filter((r) => r.phase_id && !p0PhaseIds.has(r.phase_id))
  rows.sort((a, b) => compareBetaBroadcast({ subject: a.subject ?? '', created_at: a.created_at }, { subject: b.subject ?? '', created_at: b.created_at }))

  return rows.map((r, i) => ({
    id: r.id,
    seq: i + 1,
    subject: r.subject ?? '',
    scheduledFor: r.scheduled_for,
    status: r.status ?? 'draft',
    approvalStatus: r.approval_status ?? 'draft',
  }))
}

/**
 * Set ONLY a campaign's target send date (campaigns.scheduled_for). Writer-gated. This is the operator's own
 * per-email target for the sequence, NOT an arm/schedule of a real send (that stays in scheduleCampaignAction,
 * which needs a segment + audience and is approver-gated). Pass null to clear the date back to "unset".
 */
export async function setCampaignSendDateAction(
  campaignId: string,
  dateIso: string | null,
): Promise<ActionResult<{ scheduledFor: string | null }>> {
  const gate = await writerGate()
  if (!gate.ok) return fail(gate.error)

  let value: string | null = null
  if (dateIso) {
    const d = new Date(dateIso)
    if (Number.isNaN(d.getTime())) return fail('That is not a valid date.')
    value = d.toISOString()
  }

  const db = createAdminClient()
  const { error } = await db.from('campaigns').update({ scheduled_for: value }).eq('id', campaignId)
  if (error) return fail('Could not save the target date. Try again.')

  revalidatePath('/admin/beta')
  return ok({ scheduledFor: value })
}

/**
 * Create a new email in the beta broadcast sequence (writer-gated). Same basic-starter draft as
 * createEmailDraft, but stamped with a beta phase so it JOINS the sequence (a null phase_id would file it as a
 * generic Studio campaign, invisible to this tab). It is stamped with the first launch phase (P1) and sorts
 * after the seeded six by creation time. Returns the new id (the workspace selects it).
 */
export async function createBetaEmailDraft(): Promise<ActionResult<{ id: string }>> {
  const gate = await writerGate()
  if (!gate.ok) return fail(gate.error)

  const db = createAdminClient()
  const { data: phase } = await db.from('beta_phases').select('id').eq('key', 'P1').maybeSingle()

  const layout = starterEmailLayout()
  const { data, error } = await db
    .from('campaigns')
    .insert({
      block_json: layout as unknown as never,
      body: '',
      subject: '',
      preheader: '',
      status: 'draft',
      phase_id: phase?.id ?? null,
      created_by: gate.profileId,
    })
    .select('id')
    .single()
  if (error || !data) return fail('Could not create a new email. Try again.')

  revalidatePath('/admin/beta')
  return ok({ id: data.id })
}
