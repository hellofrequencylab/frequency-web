// Confirmed tool execution (ADR-066 Phase D, ADR-028). Runs a tool ONLY after the
// member has confirmed it. Writes additionally gate on consent (the #147 harness) —
// so there are no autonomous writes, and no writes at all without `ai_memory` consent.
// Server-only.

import type { Database } from '@/lib/database.types'
import { createAdminClient } from '@/lib/supabase/admin'
import { validateToolCall } from './tools'
import { hasConsent } from '@/lib/consent/consent'
import { rememberFacts, type MemberFacts } from '@/lib/ai/memory'
import { processGamificationEvent, recordStreakActivity } from '@/lib/achievements'
import { awardGems } from '@/lib/gems'
import { recordContactInteraction } from '@/lib/crm/interactions'
import { resolveSendGate, type SendCategory } from '@/lib/comms/send-gate'
import { saveStreakWithFreeze } from '@/lib/practice-streak'
import { bothPartiesOptedIn } from '@/lib/resonance/matches'
import { enqueueEmail, listUnsubscribeHeaders } from '@/lib/email'
import { buildUnsubscribeUrl } from '@/lib/unsubscribe-tokens'

/** Profile fields Vera may set (the member's own, low-risk). Must stay in sync with the
 *  `set_profile_field` tool advertisement in tools.ts (display_name | bio | neighborhood);
 *  `neighborhood` was advertised but not allowed here, so a member confirm hard-failed. */
const SETTABLE_FIELDS = new Set(['display_name', 'bio', 'neighborhood'])

function factField(category: unknown): keyof MemberFacts {
  const c = String(category ?? '')
  return c === 'interests' || c === 'constraints' ? c : 'goals'
}

/** Tools that write to the member's record/memory — these gate on ai_memory consent.
 *  Direct member-confirmed actions (e.g. join_circle, handled in the app action) don't. */
const MEMORY_TOOLS = new Set(['remember_fact', 'set_profile_field'])

/** Options that govern HOW a confirmed tool runs. `approvedSend` is the human-approval flag
 *  for the two OUTBOUND email tools (send_playbook_email / send_intro_email): it graduates them
 *  from draft-only to a real, gated send. It DEFAULTS OFF, and it is NOT a tool arg (the bounded
 *  tool surface stays draft-by-contract) — it is a separate, out-of-band approval the operator's
 *  UI passes only when a human explicitly taps "approve and send". There is no autonomous send:
 *  no code path sets this without a human in the loop, and every send still passes the send-gate
 *  (consent + suppression) and, for intros, the double-opt-in check. */
export interface ExecuteOptions {
  approvedSend?: boolean
}

/** Execute a member-CONFIRMED tool call. Validates against the bounded surface, then
 *  consent-gates memory writes, then performs the (small, reversible) mutation. */
export async function executeConfirmedTool(
  profileId: string,
  tool: string,
  args: Record<string, unknown>,
  opts: ExecuteOptions = {},
): Promise<{ ok: boolean; error?: string }> {
  const v = validateToolCall(tool, args)
  if (!v.ok) return { ok: false, error: v.errors.join(' ') }

  if (MEMORY_TOOLS.has(tool) && !(await hasConsent(profileId, 'ai_memory'))) {
    return { ok: false, error: 'Vera-memory consent is off, so nothing was saved.' }
  }

  switch (tool) {
    case 'remember_fact': {
      const field = factField(args.category)
      await rememberFacts(profileId, { [field]: [String(args.fact)] } as Partial<MemberFacts>)
      return { ok: true }
    }
    case 'set_profile_field': {
      const field = String(args.field)
      if (!SETTABLE_FIELDS.has(field)) return { ok: false, error: `"${field}" can't be set here.` }
      const db = createAdminClient()
      await db.from('profiles').update({ [field]: String(args.value) } as Database['public']['Tables']['profiles']['Update']).eq('id', profileId)
      return { ok: true }
    }
    case 'draft_intro':
      // The member approved the drafted hello — post it (the "intro-post path",
      // ONBOARDING-BUILD-LIST §2.2). A direct member-confirmed action like
      // join_circle, so no ai_memory gate.
      return postIntro(profileId, args)
    // ── Resonance Engine playbook actions (ADR-382). `profileId` is the OPERATOR who
    // confirmed (authorized at the call site); each writes a touch on the CRM timeline.
    case 'save_streak':
      return saveStreak(profileId, args)
    case 'tag_contact':
      return tagContact(profileId, args)
    case 'move_contact_stage':
      return moveContactStage(profileId, args)
    case 'give_gem_gift':
      return giveGemGift(profileId, args)
    case 'send_playbook_email':
      return sendPlaybookEmail(profileId, args, opts.approvedSend === true)
    // ── Resonance Graph (ADR-385). `profileId` is the OPERATOR who confirmed (authorized at the call
    // site). send_intro_email is OUTBOUND + suggest-only + double-opt-in gated; the suggest tool is a read.
    case 'send_intro_email':
      return sendIntroEmail(profileId, args, opts.approvedSend === true)
    case 'suggest_circle':
    case 'find_host':
    case 'suggest_resonance_match':
      // Reads: nothing to persist (the proposal is rendered by the surface; the consenting graph is
      // read through lib/resonance/candidates.ts at the call site, not mutated here).
      return { ok: true }
    default:
      return { ok: false, error: 'Unknown tool.' }
  }
}

// ── Playbook action dispatch (ADR-382) ──────────────────────────────────────────
// Each records the touch through the one CRM front door (lib/crm/interactions.ts) with
// source:'playbook' + metadata.playbook_id, idempotent on idempotency_key so a replay
// is a no-op. The three in-product tools are reversible and never touch a member; the
// email tool DRAFTS only and gates on the SUBJECT's consent (it never sends here).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A stable idempotency key for a playbook touch, so re-confirming the same action on
 *  the same subject for the same playbook folds into one row. */
function playbookIdemKey(tool: string, playbookId: string, subjectId: string): string | undefined {
  if (!playbookId) return undefined
  return `playbook:${playbookId}:${tool}:${subjectId}`
}

function playbookIdArg(args: Record<string, unknown>): string {
  const id = String(args.playbookId ?? '').trim()
  return /^[a-z][a-z0-9_]*$/.test(id) ? id : ''
}

// ── Outbound send helpers (Phase 7 graduation) ───────────────────────────────────
// Shared by the two OUTBOUND email tools once a human has approved the send. The address is read
// from the CRM contact so the send-gate can check suppression and the outbox has a real `to`.

const OUTBOUND_BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'

/** Read a CRM contact's email (for suppression + delivery). Returns null when missing/malformed,
 *  which fails a real send closed (no `to` -> draft only). */
async function contactEmail(contactId: string): Promise<string | null> {
  try {
    const admin = createAdminClient()
    const { data } = await admin.from('contacts').select('email').eq('id', contactId).maybeSingle()
    const email = (data as { email?: string | null } | null)?.email ?? null
    return email && email.includes('@') ? email : null
  } catch {
    return null
  }
}

/** A minimal, self-contained outbound email body (inline styles for mail-client compatibility, like
 *  the rest of lib/email). The human-approved subject/body carry the copy; this is just the shell +
 *  a working unsubscribe. Escaped, newlines preserved. */
function outboundEmailHtml(body: string, unsubscribeUrl: string): string {
  const safe = body
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>')
  return `<div style="max-width:560px;margin:0 auto;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;padding:24px;"><p style="font-size:15px;color:#3D352A;line-height:1.65;">${safe}</p><hr style="border:none;border-top:1px solid #E9E1D4;margin:24px 0;"/><p style="font-size:12px;color:#8F8675;">You're receiving this as a Frequency member. <a href="${unsubscribeUrl}" style="color:#8F8675;">Unsubscribe or manage emails</a>.</p></div>`
}

/** In-product, reversible: save a member's streak by actually SPENDING a banked freeze
 *  (Resonance Engine Phase 5 · ADR-386 — Phase 1 only recorded the touch). Auto-eligible,
 *  no member touch, fully undoable (revertStreakSave). Idempotent + fail-closed: if there is
 *  nothing to save (not at risk, no freeze, already covered) it is a clean no-op (ok:false
 *  with a plain reason) and no freeze is consumed. The bridged day rides the timeline metadata
 *  so the card's Undo can reverse exactly it. The Phase 3 autonomy slider is honored upstream
 *  (an auto run only reaches here when the Space allows it; otherwise an operator confirmed). */
async function saveStreak(operatorId: string, args: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const subjectProfileId = String(args.subjectProfileId ?? '').trim()
  if (!UUID_RE.test(subjectProfileId)) return { ok: false, error: 'That member id does not look right.' }
  const playbookId = playbookIdArg(args)

  // Actually spend the freeze (the in-product, reversible save).
  const res = await saveStreakWithFreeze(subjectProfileId)
  if (!res.saved) {
    const why =
      res.reason === 'no_freeze'
        ? 'They have no freeze banked to spend.'
        : res.reason === 'already_covered'
          ? 'Their streak is already safe today.'
          : res.reason === 'broken'
            ? 'Their streak has already reset, so a freeze cannot bridge it.'
            : 'Their streak is not at risk right now.'
    return { ok: false, error: why }
  }

  // Record the real save on the timeline (idempotent), with the bridged day for the Undo.
  await recordContactInteraction({
    ownerProfileId: operatorId,
    subjectKind: 'profile',
    subjectId: subjectProfileId,
    channel: 'system',
    direction: 'internal',
    summary: 'Saved their streak with a freeze',
    metadata: { playbook_id: playbookId, action: 'save_streak', bridged_day: res.bridgedDay },
    source: 'playbook',
    idempotencyKey: playbookIdemKey('save_streak', playbookId, subjectProfileId),
  })
  return { ok: true }
}

/** In-product, reversible: tag a CRM contact. Writes the tag onto contacts.meta.tags
 *  (the contact has no tag table; meta is the staff-editable bag, ADR-379) and logs it. */
async function tagContact(operatorId: string, args: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const contactId = String(args.contactId ?? '').trim()
  if (!UUID_RE.test(contactId)) return { ok: false, error: 'That contact id does not look right.' }
  const tag = String(args.tag ?? '').replace(/[ -]/g, '').trim().slice(0, 60)
  if (!tag) return { ok: false, error: 'There is no tag to add.' }
  const playbookId = playbookIdArg(args)

  const admin = createAdminClient() as unknown as {
    from: (t: string) => {
      select: (c: string) => { eq: (col: string, val: string) => { maybeSingle: () => Promise<{ data: { meta: unknown } | null; error: unknown }> } }
      update: (patch: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<{ error: unknown }> }
    }
  }
  const { data, error } = await admin.from('contacts').select('meta').eq('id', contactId).maybeSingle()
  if (error || !data) return { ok: false, error: 'Could not find that contact.' }
  const meta = (data.meta && typeof data.meta === 'object' && !Array.isArray(data.meta) ? (data.meta as Record<string, unknown>) : {})
  const existing = Array.isArray(meta.tags) ? (meta.tags as unknown[]).map(String) : []
  const tags = [...new Set([...existing, tag])]
  const up = await admin.from('contacts').update({ meta: { ...meta, tags } }).eq('id', contactId)
  if (up.error) return { ok: false, error: 'Could not tag that contact.' }

  await recordContactInteraction({
    ownerProfileId: operatorId,
    subjectKind: 'contact',
    subjectId: contactId,
    channel: 'system',
    direction: 'internal',
    summary: `Tagged ${tag}`,
    metadata: { playbook_id: playbookId, action: 'tag_contact', tag },
    source: 'playbook',
    idempotencyKey: playbookIdemKey('tag_contact', playbookId, `${contactId}:${tag}`),
  })
  return { ok: true }
}

/** In-product, reversible: set a contact's lifecycle stage label on contacts.meta.stage. */
async function moveContactStage(operatorId: string, args: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const contactId = String(args.contactId ?? '').trim()
  if (!UUID_RE.test(contactId)) return { ok: false, error: 'That contact id does not look right.' }
  const stage = String(args.stage ?? '').replace(/[ -]/g, '').trim().slice(0, 40)
  if (!stage) return { ok: false, error: 'There is no stage to move to.' }
  const playbookId = playbookIdArg(args)

  const admin = createAdminClient() as unknown as {
    from: (t: string) => {
      select: (c: string) => { eq: (col: string, val: string) => { maybeSingle: () => Promise<{ data: { meta: unknown } | null; error: unknown }> } }
      update: (patch: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<{ error: unknown }> }
    }
  }
  const { data, error } = await admin.from('contacts').select('meta').eq('id', contactId).maybeSingle()
  if (error || !data) return { ok: false, error: 'Could not find that contact.' }
  const meta = (data.meta && typeof data.meta === 'object' && !Array.isArray(data.meta) ? (data.meta as Record<string, unknown>) : {})
  const up = await admin.from('contacts').update({ meta: { ...meta, stage } }).eq('id', contactId)
  if (up.error) return { ok: false, error: 'Could not move that contact.' }

  await recordContactInteraction({
    ownerProfileId: operatorId,
    subjectKind: 'contact',
    subjectId: contactId,
    channel: 'system',
    direction: 'internal',
    summary: `Moved to ${stage}`,
    metadata: { playbook_id: playbookId, action: 'move_contact_stage', stage },
    source: 'playbook',
    idempotencyKey: playbookIdemKey('move_contact_stage', playbookId, `${contactId}:${stage}`),
  })
  return { ok: true }
}

/** The cap on a single playbook Gem gift (Resonance Engine Phase 5 · ADR-386). Modest by
 *  design: gamification is FUEL, not the point, so a gift is a small welcome-back token that
 *  never crowds out intrinsic motivation. The default when no amount is given. */
const GEM_GIFT_DEFAULT = 5
const GEM_GIFT_CAP = 10

/** In-product, member-affecting GIFT: a modest, capped retroactive Gem grant for the value-led
 *  winback (a welcome back, not a bribe). Credits the member via lib/gems (the `gift_received`
 *  action, the recipient-crediting path), then logs the touch. No email, no send. The grant is
 *  daily-capped + active-gated inside awardGems, so a misfire can never spray Gems. */
async function giveGemGift(operatorId: string, args: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const subjectProfileId = String(args.subjectProfileId ?? '').trim()
  if (!UUID_RE.test(subjectProfileId)) return { ok: false, error: 'That member id does not look right.' }
  const rawAmount = typeof args.amount === 'number' && Number.isFinite(args.amount) ? Math.floor(args.amount) : GEM_GIFT_DEFAULT
  const amount = Math.max(1, Math.min(GEM_GIFT_CAP, rawAmount))
  const playbookId = playbookIdArg(args)

  const res = await awardGems(subjectProfileId, 'gift_received', amount, {
    source: 'playbook',
    playbook_id: playbookId,
    by_operator: operatorId,
  })
  if (!res.awarded) {
    return { ok: false, error: res.capped ? 'They have already had a gift today.' : 'That gift did not go through.' }
  }

  await recordContactInteraction({
    ownerProfileId: operatorId,
    subjectKind: 'profile',
    subjectId: subjectProfileId,
    channel: 'system',
    direction: 'internal',
    summary: `Gifted ${res.amount} Gems`,
    metadata: { playbook_id: playbookId, action: 'give_gem_gift', amount: res.amount },
    source: 'playbook',
    idempotencyKey: playbookIdemKey('give_gem_gift', playbookId, subjectProfileId),
  })
  return { ok: true }
}

/** OUTBOUND. DRAFT-BY-DEFAULT, human-approved real send (Phase 7 graduation, ADR-028 harness).
 *  Two-step, never autonomous:
 *    • no approval (`approvedSend` false, the default) -> record the DRAFT for a human to review.
 *    • explicit human approval (`approvedSend` true) -> pass the send-gate (consent + suppression),
 *      and ONLY when it allows, enqueue the real email through the outbox; then log it as SENT.
 *  The send-gate is the structural seam an agent cannot route around: a suppressed or unconsented
 *  recipient is NEVER sent, in either mode. Fail-closed on any gate/lookup error. */
async function sendPlaybookEmail(
  operatorId: string,
  args: Record<string, unknown>,
  approvedSend = false,
): Promise<{ ok: boolean; error?: string }> {
  const subjectProfileId = String(args.subjectProfileId ?? '').trim()
  const contactId = String(args.contactId ?? '').trim()
  if (!UUID_RE.test(subjectProfileId)) return { ok: false, error: 'That member id does not look right.' }
  if (!UUID_RE.test(contactId)) return { ok: false, error: 'That contact id does not look right.' }
  const rawCategory = String(args.category ?? '').trim()
  const category: SendCategory = rawCategory === 'marketing' ? 'marketing' : 'lifecycle'
  const subject = String(args.subject ?? '').replace(/[ -]/g, '').trim().slice(0, 200)
  const body = String(args.body ?? '').replace(/[ --]/g, '').trim().slice(0, 5000)
  if (!subject || !body) return { ok: false, error: 'The email needs a subject and a body.' }
  const playbookId = playbookIdArg(args)

  // Resolve the recipient's real address so the gate can check suppression and the send has a `to`.
  const email = await contactEmail(contactId)

  // The send-gate is the structural seam an agent cannot route around. Fail-closed: if the member
  // has not consented, is suppressed, or a lookup fails, nothing is sent AND nothing is drafted.
  const gate = await resolveSendGate(subjectProfileId, 'email', category, email ? { email } : {})
  if (!gate.allowed) return { ok: false, error: 'This member has not opted in, so nothing was sent.' }

  // Real send ONLY with an explicit human approval AND a deliverable address. Otherwise: draft.
  const willSend = approvedSend === true && !!email
  if (willSend) {
    const unsubscribeUrl = buildUnsubscribeUrl({ baseUrl: OUTBOUND_BASE_URL, profileId: subjectProfileId, category: 'lifecycle' })
    await enqueueEmail({
      to: email as string,
      subject,
      html: outboundEmailHtml(body, unsubscribeUrl),
      text: `${body}\n\nUnsubscribe or manage emails: ${unsubscribeUrl}`,
      headers: listUnsubscribeHeaders(unsubscribeUrl),
    })
  }

  // Record the outbound touch: `sent` when the human approved and it went to the outbox, else `drafted`.
  await recordContactInteraction({
    ownerProfileId: operatorId,
    subjectKind: 'contact',
    subjectId: contactId,
    channel: 'email',
    direction: 'outbound',
    summary: subject,
    body,
    metadata: { playbook_id: playbookId, action: 'send_playbook_email', category, status: willSend ? 'sent' : 'drafted' },
    source: 'playbook',
    idempotencyKey: playbookIdemKey('send_playbook_email', playbookId, contactId),
  })
  return { ok: true }
}

// ── Resonance Graph intro (ADR-385) ──────────────────────────────────────────────
// The hardest-gated outbound tool. TWO gates, both fail-closed, before anything is recorded as
// sendable: (1) BOTH parties must have tapped yes on the pairing (the double-opt-in record); (2) the
// recipient must pass the consent send-gate. Suggest-only: even when both gates pass, this only
// records the DRAFT on the timeline for a human to approve and send. Nothing sends here, ever, and
// nothing sends at all until both tap yes. Phase 7 graduation (ADR-028 harness): with an explicit
// human approval (`approvedSend`, default OFF) and BOTH gates passing, it enqueues the real intro
// through the outbox and logs it as SENT; without approval it stays a DRAFT. Never autonomous.
async function sendIntroEmail(
  operatorId: string,
  args: Record<string, unknown>,
  approvedSend = false,
): Promise<{ ok: boolean; error?: string }> {
  const subjectProfileId = String(args.subjectProfileId ?? '').trim()
  const otherProfileId = String(args.otherProfileId ?? '').trim()
  const contactId = String(args.contactId ?? '').trim()
  if (!UUID_RE.test(subjectProfileId)) return { ok: false, error: 'That member id does not look right.' }
  if (!UUID_RE.test(otherProfileId)) return { ok: false, error: 'That other member id does not look right.' }
  if (!UUID_RE.test(contactId)) return { ok: false, error: 'That contact id does not look right.' }
  if (subjectProfileId === otherProfileId) return { ok: false, error: 'An intro needs two different people.' }
  const subject = String(args.subject ?? '').replace(/[ -]/g, '').trim().slice(0, 200)
  const body = String(args.body ?? '').replace(/[ -]/g, '').trim().slice(0, 5000)
  if (!subject || !body) return { ok: false, error: 'The intro needs a subject and a body.' }

  // GATE 1 (the consent-first heart of the Resonance Graph): nothing sends until BOTH tap yes.
  if (!(await bothPartiesOptedIn(subjectProfileId, otherProfileId))) {
    return { ok: false, error: 'Both people need to say yes first, so nothing was sent.' }
  }

  // GATE 2: the recipient's consent send-gate. An intro is a lifecycle touch. Fail-closed. The
  // recipient address is resolved so the gate checks suppression and a real send has a `to`.
  const email = await contactEmail(contactId)
  const gate = await resolveSendGate(subjectProfileId, 'email', 'lifecycle' as SendCategory, email ? { email } : {})
  if (!gate.allowed) return { ok: false, error: 'This member has not opted in to email, so nothing was sent.' }

  // Real send ONLY with an explicit human approval AND a deliverable address (both gates already
  // passed above). Otherwise: draft. Never autonomous.
  const willSend = approvedSend === true && !!email
  if (willSend) {
    const unsubscribeUrl = buildUnsubscribeUrl({ baseUrl: OUTBOUND_BASE_URL, profileId: subjectProfileId, category: 'lifecycle' })
    await enqueueEmail({
      to: email as string,
      subject,
      html: outboundEmailHtml(body, unsubscribeUrl),
      text: `${body}\n\nUnsubscribe or manage emails: ${unsubscribeUrl}`,
      headers: listUnsubscribeHeaders(unsubscribeUrl),
    })
  }

  // Record the outbound touch: `sent` when the human approved and both gates passed, else `drafted`.
  await recordContactInteraction({
    ownerProfileId: operatorId,
    subjectKind: 'contact',
    subjectId: contactId,
    channel: 'email',
    direction: 'outbound',
    summary: subject,
    body,
    metadata: { action: 'send_intro_email', other_profile_id: otherProfileId, status: willSend ? 'sent' : 'drafted' },
    source: 'ai',
    idempotencyKey: `resonance_intro:${subjectProfileId}:${otherProfileId}`,
  })
  return { ok: true }
}

/** Post the member's CONFIRMED introduction to the public feed, mentioning the
 *  person it's for (mirrors the welcome-post / createPost path: same posts row,
 *  same mention notification, same post rewards). The member approved exactly
 *  this text — Vera drafted it, the human sends it (AI-VERA §6, ADR-028). */
async function postIntro(
  profileId: string,
  args: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  // Sanitize both member/model-controlled strings before they touch the DB.
  const handle = String(args.toHandle ?? '').trim().replace(/^@+/, '').toLowerCase()
  if (!/^[a-z0-9_]{1,30}$/.test(handle)) return { ok: false, error: 'That handle doesn’t look right.' }
  const message = String(args.message ?? '')
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '')
    .trim()
    .slice(0, 1000)
  if (!message) return { ok: false, error: 'There’s no introduction text to post.' }

  const admin = createAdminClient()
  const { data: target } = await admin
    .from('profiles')
    .select('id, handle')
    .eq('handle', handle)
    .maybeSingle()
  if (!target) return { ok: false, error: `Couldn't find anyone with the handle @${handle}.` }
  if (target.id === profileId) return { ok: false, error: 'That’s you. Pick someone to be introduced to.' }

  // Make sure the hello actually reaches them: mention them if the draft didn't.
  const body = new RegExp(`@${handle}\\b`, 'i').test(message) ? message : `@${target.handle} ${message}`

  const { data: post, error } = await admin
    .from('posts')
    .insert({
      author_id: profileId,
      scope_id: profileId, // a member's public feed post is self-scoped (cf. feed page composer)
      visibility: 'public',
      post_type: 'feed',
      body,
    })
    .select('id')
    .single()
  if (error || !post) return { ok: false, error: 'The post didn’t go through. Try again in a moment.' }

  // Mention bookkeeping + in-app notification (best-effort, mirrors fanOutMentions).
  try {
    await admin.from('post_mentions').insert({ post_id: post.id, profile_id: target.id })
  } catch {
    /* non-critical */
  }
  try {
    await admin.from('notifications').insert({
      recipient_id: target.id,
      actor_id: profileId,
      type: 'mention',
      reference_type: 'post',
      reference_id: post.id,
      body: 'mentioned you in an introduction',
    })
  } catch {
    /* non-critical */
  }

  // Same rewards as any other post (non-blocking) — an intro IS their first post
  // for the founder tasks / activation funnel.
  processGamificationEvent({ type: 'post_create', profileId }).catch(() => {})
  recordStreakActivity(profileId, 'posting').catch(() => {})
  awardGems(profileId, 'post_create').catch(() => {})

  return { ok: true }
}
