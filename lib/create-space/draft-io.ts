import 'server-only'
// THE SERVER SIDE OF A CREATE A SPACE DRAFT (ADR-1933, LIVE-1967): where a signed-out visitor's draft goes once step 3
// has an address, and where a resume link reads it back from. Three doors, each behind the public action in
// app/(marketing)/create-a-space/actions.ts or the beacon route in app/api/create-space/draft/route.ts, which rate
// limit by IP and by mailbox and keep the honeypot.
//
//   saveDraft          the draft, its zone and step, upserted by the hash of a resume token. A token that opens no
//                      row (or none at all) makes a new row with a fresh token; the token itself is never stored.
//                      The address also goes through capture_signup_lead, the same anon-callable door the induction
//                      uses, so the operator's lead list sees the person and sign-in converts the lead. A failed
//                      lead capture never fails the save: the draft is the thing the visitor came back for.
//   readDraftByToken   the draft JSON for a token, or null. Answers nothing else, so it says nothing about whether an
//                      address is known. A converted draft answers null: the launch owns it now.
//   markDraftConverted stamps the row when the draft leaves for the launch, so the reminder cron stops.
//
// Every write goes through the admin client (the table is service-role only, scripts/rls-deny-all.txt) and every
// update is bound to the token hash, so a caller can only ever touch the row its token opens.

import { createHash, randomBytes } from 'node:crypto'
import { resolveAcquisition } from '@/lib/attribution/server'
import { claimedHandle, parseDraft, serializeDraft } from '@/lib/create-space/builder'
import type { BuilderDraft } from '@/lib/create-space/builder'
import { isLeadToken, leadEmailOf, leadPayloadFor, stepReached } from '@/lib/create-space/lead'
import type { Json } from '@/lib/database.types'
import { isSpaceSlugTaken } from '@/lib/spaces/store'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const TABLE = 'create_space_drafts'

/** A fresh resume token: 24 random bytes as base64url (32 chars, inside LEAD_TOKEN_RE). */
function mintToken(): string {
  return randomBytes(24).toString('base64url')
}

/** The only form of a token the table ever sees. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

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
    if (input.token && isLeadToken(input.token)) {
      const hash = hashToken(input.token)
      const { data: row } = await db.from(TABLE).select('id, step_reached').eq('token_hash', hash).maybeSingle()
      if (row) {
        const { error } = await db.from(TABLE).update({ ...common, step_reached: Math.max(step, row.step_reached) }).eq('token_hash', hash)
        return error ? null : { token: input.token, handleTaken }
      }
    }
    const token = mintToken()
    const { error } = await db.from(TABLE).insert({ ...common, token_hash: hashToken(token), step_reached: step })
    return error ? null : { token, handleTaken }
  } catch {
    return null
  }
}

/** The draft a resume token opens, as the browser's own JSON (parseDraft reads it), or null. */
export async function readDraftByToken(token: string): Promise<string | null> {
  if (!isLeadToken(token)) return null
  try {
    const { data } = await createAdminClient().from(TABLE).select('draft, email, converted_at').eq('token_hash', hashToken(token)).maybeSingle()
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
  if (!isLeadToken(token)) return
  try {
    await createAdminClient().from(TABLE).update({ converted_at: new Date().toISOString() }).eq('token_hash', hashToken(token)).is('converted_at', null)
  } catch {
    /* best-effort: the launch goes on without the stamp */
  }
}
