import 'server-only'
// THE SERVER SIDE OF A CREATE A SPACE DRAFT (ADR-1933, LIVE-1967): where a signed-out visitor's draft goes once step 3
// has an address, and where a resume link reads it back from. The doors sit behind the public action in
// app/(marketing)/create-a-space/actions.ts, the beacon route in app/api/create-space/draft/route.ts and the reminder
// cron (lib/create-space/draft-recovery-io.ts), which rate limit by IP and by mailbox and keep the honeypot.
//
//   saveDraft           the draft, its zone and step, upserted by the hash of a resume token. A token that opens no
//                       row (or none at all) makes a new row with a fresh token; the token itself is never stored.
//                       The address also goes through capture_signup_lead, the same anon-callable door the induction
//                       uses, so the operator's lead list sees the person and sign-in converts the lead. A failed
//                       lead capture never fails the save: the draft is the thing the visitor came back for.
//   readDraftByToken    the draft JSON for a token, or null. Answers nothing else, so it says nothing about whether an
//                       address is known. A converted draft answers null: the launch owns it now.
//   markDraftConverted  stamps the row when the draft leaves for the launch, so the reminders stop.
//   unsubscribeDrafts   no more reminders for the address a link's row carries.
//
// TWO TOKEN SHAPES open a row. The BROWSER token is 24 random bytes (base64url); only its sha256 is stored. The LINK
// token is what the reminder emails carry (LIVE-1968): the row id plus an HMAC of it, so it can be minted server-side
// without the browser token, which nobody but that browser holds. A link token that opens a row re-keys the row to the
// browser that used it (a fresh browser token is minted on the next save), and stays valid itself, since it signs the id.
//
// Every write goes through the admin client (the table is service-role only, scripts/rls-deny-all.txt) and every
// update is bound to the row its token opens, so a caller can only ever touch that one row.

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { resolveAcquisition } from '@/lib/attribution/server'
import { claimedHandle, parseDraft, serializeDraft } from '@/lib/create-space/builder'
import type { BuilderDraft } from '@/lib/create-space/builder'
import { isLeadToken, leadEmailOf, leadPayloadFor, stepReached } from '@/lib/create-space/lead'
import type { Json } from '@/lib/database.types'
import { signingSecret } from '@/lib/signing-secret'
import { isSpaceSlugTaken } from '@/lib/spaces/store'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const TABLE = 'create_space_drafts'

/** A fresh browser token: 24 random bytes as base64url (32 chars, inside LEAD_TOKEN_RE). */
function mintToken(): string {
  return randomBytes(24).toString('base64url')
}

/** The only form of a browser token the table ever sees. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

// ── Link tokens: the row id (32 hex) followed by 16 hex of an HMAC over it. 48 hex chars, inside LEAD_TOKEN_RE.
const LINK_RE = /^([0-9a-f]{32})([0-9a-f]{16})$/
const linkSecret = () => signingSecret('create-space-drafts', ['CREATE_SPACE_DRAFT_SECRET', 'UNSUBSCRIBE_SECRET'])
const linkSig = (idHex: string) => createHmac('sha256', linkSecret()).update(`create-space-draft:${idHex}`).digest('hex').slice(0, 16)
const uuidOf = (hex: string) => `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`

/** The link token for a row, as the reminder emails carry it. */
export function draftLinkToken(id: string): string {
  const hex = id.replace(/-/g, '').toLowerCase()
  return `${hex}${linkSig(hex)}`
}

/** True for a well-signed link token (the shape the reminder emails carry). Pure: no database. */
export function isDraftLink(token: unknown): token is string {
  if (typeof token !== 'string') return false
  const m = LINK_RE.exec(token)
  if (!m) return false
  try {
    return timingSafeEqual(Buffer.from(linkSig(m[1]), 'hex'), Buffer.from(m[2], 'hex'))
  } catch {
    return false
  }
}

/** Which row a token opens: by browser-token hash, or by id when it is a well-signed link token. */
function keyOf(token: string): Key | null {
  if (!isLeadToken(token)) return null
  const m = LINK_RE.exec(token)
  if (m) {
    const [, hex, sig] = m
    try {
      if (timingSafeEqual(Buffer.from(linkSig(hex), 'hex'), Buffer.from(sig, 'hex'))) return { id: uuidOf(hex) }
    } catch { /* not a link token */ }
  }
  return { hash: hashToken(token) }
}

type Key = { hash: string } | { id: string }

/** What a row stores: the draft with the token taken out (the hash is the key) and the address beside it. */
function storedDraft(draft: BuilderDraft): Json {
  return JSON.parse(serializeDraft({ ...draft, leadToken: null })) as Json
}

type UntypedRpc = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>
}

/** The address into the signup funnel through capture_signup_lead (ADR-959): the SESSION client, so the function's
 *  own anon grant applies. Returns the lead row id, or null on any failure. Best-effort by design. */
async function captureDraftLead(email: string, draft: BuilderDraft, facts: { ownPhoto: boolean; tz: string | null }): Promise<string | null> {
  try {
    const supabase = await createClient()
    const { data, error } = await (supabase as unknown as UntypedRpc).rpc('capture_signup_lead', {
      p_email: email,
      p_source: 'create_space',
      p_step: stepReached(draft),
      p_display_name: draft.hostName.trim() || null,
      p_handle: claimedHandle(draft) || null,
      p_payload: leadPayloadFor(draft, { ...facts, saved: true }),
      p_attribution: await resolveAcquisition(),
    })
    if (error || !data || typeof data !== 'object') return null
    const id = (data as { id?: unknown }).id
    return typeof id === 'string' && id ? id : null
  } catch {
    return null
  }
}

interface SaveDraftInput {
  draft: BuilderDraft
  /** The token the browser already holds, if any. */
  token: string | null
  tz: string | null
  ownPhoto: boolean
}

interface SaveDraftResult {
  token: string
  /** The handle the draft claims is now someone's Space (re-checked on every save, as the claim actions do). */
  handleTaken: boolean
}

/** Keep the draft. Null only when it has no address to keep it under, or the write failed. */
export async function saveDraft(input: SaveDraftInput): Promise<SaveDraftResult | null> {
  const email = leadEmailOf(input.draft)
  if (!email) return null
  const handle = claimedHandle(input.draft)
  // A read that SAYS taken is the only taken; a failed read (null) is not a reason to alarm the visitor.
  const handleTaken = (await isSpaceSlugTaken(handle).catch(() => null)) === true
  const leadId = await captureDraftLead(email, input.draft, { ownPhoto: input.ownPhoto, tz: input.tz })
  const now = new Date().toISOString()
  const common = {
    email,
    handle: handle || null,
    draft: storedDraft(input.draft),
    tz: input.tz,
    saved_at: now,
    started_at: input.draft.startedAt,
    ...(leadId ? { signup_lead_id: leadId } : {}),
  }
  const step = stepReached(input.draft)
  try {
    const db = createAdminClient()
    const key = input.token ? keyOf(input.token) : null
    if (key) {
      const q = db.from(TABLE).select('id, step_reached')
      const { data: row } = await ('id' in key ? q.eq('id', key.id) : q.eq('token_hash', key.hash)).maybeSingle()
      if (row) {
        // A link token re-keys the row to this browser: the browser gets a token of its own from here on.
        const token = 'id' in key ? mintToken() : input.token!
        const patch = { ...common, step_reached: Math.max(step, row.step_reached), ...('id' in key ? { token_hash: hashToken(token) } : {}) }
        const { error } = await db.from(TABLE).update(patch).eq('id', row.id)
        return error ? null : { token, handleTaken }
      }
    }
    const token = mintToken()
    const { error } = await db.from(TABLE).insert({ ...common, token_hash: hashToken(token), step_reached: step })
    return error ? null : { token, handleTaken }
  } catch {
    return null
  }
}

/** The draft a token opens, as the browser's own JSON (parseDraft reads it), or null. */
export async function readDraftByToken(token: string): Promise<string | null> {
  const key = keyOf(token)
  if (!key) return null
  try {
    const q = createAdminClient().from(TABLE).select('draft, email, converted_at')
    const { data } = await ('id' in key ? q.eq('id', key.id) : q.eq('token_hash', key.hash)).maybeSingle()
    if (!data || data.converted_at) return null
    const draft = parseDraft(JSON.stringify(data.draft), null)
    if (!draft) return null
    return serializeDraft({ ...draft, email: draft.email || data.email, leadToken: token })
  } catch {
    return null
  }
}

/** The draft left for the launch. Idempotent; a token that opens nothing is a no-op. */
export async function markDraftConverted(token: string): Promise<void> {
  const key = keyOf(token)
  if (!key) return
  try {
    const q = createAdminClient().from(TABLE).update({ converted_at: new Date().toISOString() })
    await ('id' in key ? q.eq('id', key.id) : q.eq('token_hash', key.hash)).is('converted_at', null)
  } catch {
    /* best-effort: the launch goes on without the stamp */
  }
}

/** No more reminders for the address the token's row carries: every draft under it is stamped. Returns whether the
 *  token opened a row. */
export async function unsubscribeDrafts(token: string): Promise<boolean> {
  const key = keyOf(token)
  if (!key) return false
  try {
    const db = createAdminClient()
    const q = db.from(TABLE).select('email')
    const { data } = await ('id' in key ? q.eq('id', key.id) : q.eq('token_hash', key.hash)).maybeSingle()
    if (!data) return false
    const { error } = await db.from(TABLE).update({ unsubscribed_at: new Date().toISOString() }).eq('email', data.email).is('unsubscribed_at', null)
    return !error
  } catch {
    return false
  }
}
