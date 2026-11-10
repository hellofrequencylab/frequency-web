/**
 * Hunt consent (FH-024): the application side of the consent ledger. The database keeps the guarantees
 * (supabase/migrations/20270346040000_hunt_consent.sql): the ledger is append-only, a repeated event key
 * is a replay, an event older than the latest for that Space is stale, a withdrawal writes its
 * suppression first, a global suppression outranks every grant, and one Space's roster never holds
 * another's choice. This file holds what the caller computes around it: the event key, the contact hash,
 * the narrowed answers, and the pure read of a history.
 *
 * The product rules are docs/hunts/PRODUCT-DRAFTS-D4-D7-D8.md, and they are drafts until a person with
 * privacy authority signs FH-023. Nothing here trades a reward for consent: the reward path never reads
 * this module. It is called from a consent control the player taps, and a sender calls `canSend` before
 * every message. Takes the RPC caller as an argument, like lib/hunts/apply-claim.ts.
 */
import { createHash } from 'node:crypto'

type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>

export type ConsentSource = 'hunt_reward' | 'follow_link' | 'player_area' | 'privacy_request'

/** Hash of a contact (a lowercased, trimmed email) for the suppression that must outlive the account. Never log the address. */
export function contactHash(contact: string): string {
  return createHash('sha256').update(contact.trim().toLowerCase()).digest('hex')
}

/**
 * One stable key per tap. The same tap retried gets the same key, so it is a replay; a new tap gets a new
 * key. `tapId` comes from the client control (generated once when it renders).
 */
export function consentEventKey(input: { profileId: string; spaceId: string; event: 'grant' | 'withdraw'; tapId: string }): string {
  return `consent-${createHash('sha256').update(JSON.stringify([input.profileId, input.spaceId, input.event, input.tapId])).digest('hex').slice(0, 40)}`
}

const RECORD_RESULTS = ['recorded', 'replayed', 'stale', 'suppressed'] as const
type RecordResult = (typeof RECORD_RESULTS)[number]

/** Record a grant or a withdrawal for one named Space. Returns the database's answer; an error throws. */
export async function recordConsent(
  rpc: Rpc,
  input: { profileId: string; spaceId: string; event: 'grant' | 'withdraw'; version: string; source: ConsentSource; huntId?: string | null; eventKey: string; occurredAt?: Date },
): Promise<RecordResult> {
  const { data, error } = await rpc('hunt_consent_record', {
    p_profile: input.profileId,
    p_space: input.spaceId,
    p_event: input.event,
    p_version: input.version,
    p_source: input.source,
    p_hunt: input.huntId ?? null,
    p_event_key: input.eventKey,
    p_occurred_at: (input.occurredAt ?? new Date()).toISOString(),
  })
  if (error) throw new Error(`hunt_consent_record failed: ${error.message}`)
  const result = RECORD_RESULTS.find((r) => r === (data as { result?: string } | null)?.result)
  if (!result) throw new Error('hunt_consent_record returned an answer this build does not know')
  return result
}

const SEND_REASONS = ['opted_in', 'essential', 'no_consent', 'withdrawn', 'space_suppression', 'global_suppression'] as const
type SendReason = (typeof SEND_REASONS)[number]

/**
 * May this message go to this person on behalf of this Space? Call it immediately before every send, with
 * `essential` true only for a reward ready or a closed stop and `contact` the verified account email
 * resolved on the server. An unknown answer fails closed.
 */
export async function canSend(rpc: Rpc, input: { profileId: string; spaceId: string; essential?: boolean; contact?: string }): Promise<{ allowed: boolean; reason: SendReason }> {
  const { data, error } = await rpc('hunt_consent_can_send', {
    p_profile: input.profileId,
    p_space: input.spaceId,
    p_essential: input.essential === true,
    p_contact_hash: input.contact ? contactHash(input.contact) : null,
  })
  if (error) throw new Error(`hunt_consent_can_send failed: ${error.message}`)
  const answer = data as { allowed?: boolean; reason?: string } | null
  const reason = SEND_REASONS.find((r) => r === answer?.reason)
  if (!reason) return { allowed: false, reason: 'no_consent' }
  return { allowed: answer?.allowed === true, reason }
}

const PRIVACY_RESULTS = ['recorded', 'replayed'] as const
type PrivacyResult = (typeof PRIVACY_RESULTS)[number]

/** Export, erase or do-not-contact. Erase and do-not-contact carry the contact hash so the suppression outlives the account. */
export async function requestPrivacy(
  rpc: Rpc,
  input: { profileId: string; kind: 'export' | 'erase' | 'do_not_contact'; requestKey: string; contact?: string },
): Promise<PrivacyResult> {
  if (input.kind !== 'export' && !input.contact) throw new Error('This privacy request needs the verified contact.')
  const { data, error } = await rpc('hunt_privacy_request', {
    p_profile: input.profileId,
    p_kind: input.kind,
    p_request_key: input.requestKey,
    p_contact_hash: input.contact ? contactHash(input.contact) : null,
  })
  if (error) throw new Error(`hunt_privacy_request failed: ${error.message}`)
  const result = PRIVACY_RESULTS.find((r) => r === (data as { result?: string } | null)?.result)
  if (!result) throw new Error('hunt_privacy_request returned an answer this build does not know')
  return result
}

/** The latest standing in one Space, read from a player's own history (for the player area). Pure. */
export function latestConsent(events: readonly { spaceId: string; event: 'grant' | 'withdraw'; occurredAt: string }[], spaceId: string): 'opted_in' | 'withdrawn' | 'none' {
  let latest: { event: 'grant' | 'withdraw'; at: number } | null = null
  for (const e of events) {
    if (e.spaceId !== spaceId) continue
    const at = Date.parse(e.occurredAt)
    if (!latest || at > latest.at) latest = { event: e.event, at }
  }
  return latest === null ? 'none' : latest.event === 'grant' ? 'opted_in' : 'withdrawn'
}
