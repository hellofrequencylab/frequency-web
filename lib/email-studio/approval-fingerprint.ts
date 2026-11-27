// EMAIL-086: approving or scheduling a campaign locks its exact content and audience.
//
// On approve (lib/outbound/approvals.ts) or schedule (scheduleCampaign), stampApprovalFingerprint stores a sha256 of
// what will go out: subject, preview text, the block layout (which carries every link), the audience (segment and
// filter), and the From and reply settings. sendCampaignNow, which the scheduled-send cron also calls, recomputes
// it before anything is claimed or queued. A difference means someone changed the email or its audience after it
// was approved: the send refuses and the campaign goes back to draft for a fresh look. EMAIL-081 already resets a
// scheduled email on edit; this makes the send itself the guard, whatever edit path skipped that reset.
//
// A campaign with no stored fingerprint (sent with Send now, or scheduled before this shipped) is unlocked and sends
// as before. A fingerprint we cannot read refuses the send: the lock must fail closed.

import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'

/** The columns the lock covers. Derived fields (compiled_html, counts, timestamps) are left out on purpose. */
const LOCKED_COLS = 'subject, preheader, block_json, segment, audience_filter, from_name, from_address, reply_mode'

export interface FingerprintInput {
  subject: string | null
  preheader: string | null
  block_json: unknown
  segment: string | null
  audience_filter: unknown
  from_name: string | null
  from_address: string | null
  reply_mode: string | null
}

/** PURE: JSON with object keys sorted at every depth, so the same content always hashes the same. */
export function canonicalJson(value: unknown): string {
  if (value === undefined) return 'null'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`
}

/** PURE: the approval fingerprint of one campaign's locked fields. */
export function campaignFingerprint(input: FingerprintInput): string {
  const locked = {
    subject: input.subject ?? '',
    preheader: input.preheader ?? '',
    block_json: input.block_json ?? null,
    segment: input.segment ?? '',
    audience_filter: input.audience_filter ?? null,
    from_name: input.from_name ?? '',
    from_address: input.from_address ?? '',
    reply_mode: input.reply_mode ?? '',
  }
  return createHash('sha256').update(canonicalJson(locked)).digest('hex')
}

/** campaigns.approval_fingerprint is not in lib/database.types.ts until the migration applies and types regenerate
 *  (ADR-246), so it is reached through this narrow untyped seam. */
type Res<T> = PromiseLike<{ data: T | null; error: { message: string } | null }>
type Untyped = {
  from: (t: 'campaigns') => {
    select: (cols: string) => { eq: (c: string, v: string) => { maybeSingle: () => Res<Record<string, unknown>> } }
    update: (row: Record<string, unknown>) => { eq: (c: string, v: string) => Res<unknown> }
  }
}
const db = (): Untyped => createAdminClient() as unknown as Untyped

/** Store the fingerprint of the campaign as it is right now. Returns false when it could not be written. */
export async function stampApprovalFingerprint(campaignId: string): Promise<boolean> {
  try {
    const { data, error } = await db().from('campaigns').select(LOCKED_COLS).eq('id', campaignId).maybeSingle()
    if (error || !data) return false
    const { error: writeErr } = await db()
      .from('campaigns')
      .update({ approval_fingerprint: campaignFingerprint(data as unknown as FingerprintInput), approval_fingerprinted_at: new Date().toISOString() })
      .eq('id', campaignId)
    return !writeErr
  } catch {
    return false
  }
}

type FingerprintCheck = 'unlocked' | 'match' | 'mismatch' | 'unreadable'

/** PURE: compare a stored fingerprint with the row it was taken from. */
export function compareFingerprint(stored: string | null | undefined, row: FingerprintInput): FingerprintCheck {
  if (!stored) return 'unlocked'
  return campaignFingerprint(row) === stored ? 'match' : 'mismatch'
}

/** Recompute the campaign's fingerprint and compare it with the one stored at approval. */
export async function checkApprovalFingerprint(campaignId: string): Promise<FingerprintCheck> {
  try {
    const { data, error } = await db()
      .from('campaigns')
      .select(`${LOCKED_COLS}, approval_fingerprint`)
      .eq('id', campaignId)
      .maybeSingle()
    if (error || !data) return 'unreadable'
    return compareFingerprint(data.approval_fingerprint as string | null, data as unknown as FingerprintInput)
  } catch {
    return 'unreadable'
  }
}

/** Put a campaign whose content moved after approval back to draft, lock cleared, so it is approved again. */
export async function resetChangedCampaign(campaignId: string): Promise<boolean> {
  try {
    const { error } = await db()
      .from('campaigns')
      .update({ status: 'draft', approval_status: 'draft', approval_fingerprint: null, approval_fingerprinted_at: null })
      .eq('id', campaignId)
    return !error
  } catch {
    return false
  }
}

export const FINGERPRINT_MISMATCH_COPY =
  'Nothing was sent. This email or its audience changed after it was approved, so it is back in draft. Check it and approve it again.'
export const FINGERPRINT_UNREADABLE_COPY =
  'Nothing was sent. The approval record for this email could not be read. Try again in a few minutes.'
